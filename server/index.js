// =============================================================================
// Helm — server/index.js
// A small Express server that:
//   (a) serves the SPA from /public;
//   (b) exposes /api/health — REAL server-side probes of each project (probe.js);
//   (c) exposes /api/fleet — the project registry + last probe rollup;
//   (d) exposes /api/ecosystem — the service/stack graph;
//   (e) exposes /mcp/manifest.json — an honest read-only fleet-tools manifest;
//   (f) exposes /api/action — a STUB that never deploys, it only reports the
//       exact command it *would* run (deploy/rollback/restart/logs);
//   (g) exposes its own /health.
//
// Honesty: the only endpoint that hits the network is the probe. /api/action
// performs nothing — it is explicitly a dry run.
// =============================================================================

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLEET, FLEET_BY_ID, ECOSYSTEM } from './fleet.js';
import { getFleetHealth, summariseProject, startProbing, hasData, PROBE_CONFIG } from './probe.js';
import { mcpManifest } from './mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 8080;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.headers.host}`;
}

// --- Helm's own liveness. Cheap, no network. -------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'helm',
    uptimeSec: Math.round(process.uptime()),
    probing: hasData(),
    ts: new Date().toISOString()
  });
});

// --- The registry (static facts) + a live status rollup per project. --------
app.get('/api/fleet', (_req, res) => {
  const projects = FLEET.map((p) => {
    const live = summariseProject(p);
    return {
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      blurb: p.blurb,
      accent: p.accent,
      glassTheme: p.glassTheme,
      stack: p.stack,
      role: p.role,
      liveUrl: p.liveUrl,
      repoUrl: p.repoUrl,
      deploy: p.deploy,
      usesGlass: p.usesGlass,
      foundation: !!p.foundation,
      mcp: p.mcp,
      releases: p.releases,
      status: live.status,
      latencyMs: live.latencyMs,
      uptimePct: live.uptimePct,
      p95Ms: live.p95Ms,
      checkedAt: live.checkedAt,
      probes: live.probes
    };
  });
  res.json({ generatedAt: Date.now(), count: projects.length, projects });
});

// --- REAL health for the whole fleet. ---------------------------------------
app.get('/api/health', (_req, res) => {
  res.json(getFleetHealth());
});

// --- REAL health for one project. -------------------------------------------
app.get('/api/health/:id', (req, res) => {
  const project = FLEET_BY_ID[req.params.id];
  if (!project) return res.status(404).json({ error: 'unknown project', id: req.params.id });
  res.json({ generatedAt: Date.now(), project: summariseProject(project) });
});

// --- The ecosystem graph. ----------------------------------------------------
app.get('/api/ecosystem', (_req, res) => {
  res.json({
    foundation: ECOSYSTEM.foundation,
    edges: ECOSYSTEM.edges,
    nodes: FLEET.map((p) => ({
      id: p.id,
      name: p.name,
      accent: p.accent,
      usesGlass: p.usesGlass,
      exposesMcp: !!p.mcp?.exposes,
      foundation: !!p.foundation,
      role: p.role
    }))
  });
});

// --- MCP manifest (honest, read-only). --------------------------------------
app.get('/mcp/manifest.json', (req, res) => {
  res.json(mcpManifest(originOf(req)));
});

// --- Action endpoint: A DRY RUN. It performs nothing. -----------------------
// It returns the exact fly command it *would* run so the UI can show operators
// the real operation, honestly, without Helm ever touching the fleet.
app.post('/api/action', (req, res) => {
  const { projectId, action } = req.body || {};
  const project = FLEET_BY_ID[projectId];
  const allowed = ['deploy', 'rollback', 'restart', 'logs'];
  if (!project) return res.status(404).json({ error: 'unknown project', projectId });
  if (!allowed.includes(action)) return res.status(400).json({ error: 'unknown action', action, allowed });

  const app_ = project.deploy?.app;
  let command;
  if (project.deploy?.target === 'fly' && app_) {
    command = {
      deploy: `fly deploy --app ${app_}`,
      rollback: `fly releases rollback --app ${app_}`,
      restart: `fly apps restart ${app_}`,
      logs: `fly logs --app ${app_}`
    }[action];
  } else if (project.deploy?.target === 'pages') {
    command = `git push origin main   # ${project.name} redeploys via GitHub Pages CI`;
  } else if (project.deploy?.target === 'local') {
    command = `# ${project.name} is a local desktop app — no remote deploy target`;
  } else {
    command = `# no deploy target configured for ${project.name}`;
  }

  res.json({
    ok: true,
    performed: false, // <- HELM NEVER RUNS THIS. Always false.
    dryRun: true,
    projectId,
    action,
    wouldRun: command,
    note: 'Dry run only. Helm did not execute anything. Connect a fly.io token in Settings to enable real actions.',
    ts: new Date().toISOString()
  });
});

// --- Runtime config for the SPA (probe cadence etc.). -----------------------
app.get('/api/config', (_req, res) => {
  res.json({ probe: PROBE_CONFIG, buildTs: process.env.BUILD_TS || null });
});

// --- Static SPA. ------------------------------------------------------------
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (/\.(css|js|svg)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  })
);

// SPA fallback: any non-API GET returns index.html (hash routing on the client).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/mcp') || req.path === '/health') return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  startProbing();
  // eslint-disable-next-line no-console
  console.log(`Helm listening on :${PORT}  (probing ${FLEET.reduce((n, p) => n + p.probes.length, 0)} endpoints every ${PROBE_CONFIG.REFRESH_MS / 1000}s)`);
});
