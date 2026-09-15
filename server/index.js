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
const SOURCE_REVISION = /^[0-9a-f]{40}$/i.test(process.env.SOURCE_REVISION || '')
  ? process.env.SOURCE_REVISION.toLowerCase()
  : null;

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'"
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
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
    release_sha: SOURCE_REVISION,
    sourceRevision: SOURCE_REVISION,
    revisionStatus: SOURCE_REVISION ? 'verified-build-input' : 'unknown',
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
  res.json({
    probe: PROBE_CONFIG,
    buildTs: process.env.BUILD_TS || null,
    sourceRevision: SOURCE_REVISION,
    revisionStatus: SOURCE_REVISION ? 'verified-build-input' : 'unknown'
  });
});

// --- Static SPA. ------------------------------------------------------------
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      // The SPA is a single unversioned app.js/styles.css, so a long max-age would
      // hide a fresh deploy for up to an hour (charts, fixes, etc. would look stale).
      // no-cache lets the browser revalidate against the ETag every load — it still
      // gets a cheap 304 when nothing changed, but always picks up a new build.
      if (/\.(css|js|svg)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
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
  if (process.env.HELM_DISABLE_PROBES !== '1') startProbing();
  // eslint-disable-next-line no-console
  console.log(`Helm listening on :${PORT}  (probing ${FLEET.reduce((n, p) => n + p.probes.length, 0)} endpoints every ${PROBE_CONFIG.REFRESH_MS / 1000}s)`);
});
