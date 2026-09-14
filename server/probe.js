// =============================================================================
// Helm — probe.js
// The only source of REAL live data in Helm. It pings each project's health or
// root URL SERVER-SIDE (no browser, so no CORS), measures wall-clock latency,
// records the HTTP status code, and keeps a small rolling history per probe so
// the sparklines, uptime % and p50/p95 are computed from actual measurements.
//
// What is REAL here: up/down, HTTP status code, measured latency (current +
// history), uptime % over the sampled window, p50/p95 latency.
// What is NOT here: web-vitals, error rate, cost. Those are SAMPLE (see api).
// =============================================================================

import { FLEET } from './fleet.js';

const TIMEOUT_MS = 9000; // fly machines cold-start; give them room before calling down.
const HISTORY_MAX = 60; // rolling samples kept per probe (~30 min at 30s interval).
const REFRESH_MS = 30000; // background probe cadence.

// history: Map<projectId, Map<probeName, Array<{ t, ok, ms, code, error }>>>
const history = new Map();
let lastSweep = 0;
let sweeping = false;

function pushSample(projectId, probeName, sample) {
  if (!history.has(projectId)) history.set(projectId, new Map());
  const byProbe = history.get(projectId);
  if (!byProbe.has(probeName)) byProbe.set(probeName, []);
  const arr = byProbe.get(probeName);
  arr.push(sample);
  if (arr.length > HISTORY_MAX) arr.splice(0, arr.length - HISTORY_MAX);
}

function seriesFor(projectId, probeName) {
  return history.get(projectId)?.get(probeName) ?? [];
}

// One real HTTP probe with a hard timeout. Any 2xx/3xx is "up"; a 4xx/5xx is
// reachable-but-erroring (still counts as a real response, latency is valid);
// a network error or timeout is "down".
async function probeOnce(url, method = 'GET') {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Helm-fleet-probe/1.0 (+https://helm-abheet.fly.dev)' }
    });
    const ms = Date.now() - started;
    return { t: Date.now(), ok: res.status < 400, ms, code: res.status, error: null };
  } catch (err) {
    const ms = Date.now() - started;
    const aborted = err?.name === 'AbortError';
    return {
      t: Date.now(),
      ok: false,
      ms,
      code: 0,
      error: aborted ? `timeout after ${TIMEOUT_MS}ms` : String(err?.cause?.code || err?.message || err)
    };
  }
}

// Probe every project's every endpoint once, concurrently, and record history.
export async function sweep() {
  if (sweeping) return;
  sweeping = true;
  try {
    const jobs = [];
    for (const project of FLEET) {
      for (const probe of project.probes) {
        jobs.push(
          probeOnce(probe.url, probe.method).then((sample) => {
            pushSample(project.id, probe.name, sample);
          })
        );
      }
    }
    await Promise.all(jobs);
    lastSweep = Date.now();
  } finally {
    sweeping = false;
  }
}

function percentile(sortedMs, p) {
  if (!sortedMs.length) return null;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

// Summarise a single probe's rolling history into a real snapshot.
function summariseProbe(projectId, probe) {
  const series = seriesFor(projectId, probe.name);
  const latest = series[series.length - 1] || null;
  const okSamples = series.filter((s) => s.ok);
  const latencies = okSamples.map((s) => s.ms).sort((a, b) => a - b);
  const uptime = series.length ? Math.round((okSamples.length / series.length) * 1000) / 10 : null;
  return {
    name: probe.name,
    url: probe.url,
    status: latest ? (latest.ok ? 'up' : 'down') : 'unknown',
    code: latest?.code ?? null,
    latencyMs: latest?.ms ?? null,
    error: latest?.error ?? null,
    checkedAt: latest?.t ?? null,
    samples: series.length,
    uptimePct: uptime,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    // Real measured latency history (ok-samples only) for the sparkline.
    spark: series.map((s) => ({ t: s.t, ms: s.ok ? s.ms : null, ok: s.ok }))
  };
}

// Roll a project's probes up into one status: down if any probe is down,
// up if all are up, unknown if never sampled. Zeno (no probes) is "local".
export function summariseProject(project) {
  if (!project.probes.length) {
    return {
      id: project.id,
      status: project.deploy?.target === 'local' ? 'local' : 'unknown',
      latencyMs: null,
      uptimePct: null,
      p95Ms: null,
      checkedAt: null,
      probes: []
    };
  }
  const probes = project.probes.map((p) => summariseProbe(project.id, p));
  const anyDown = probes.some((p) => p.status === 'down');
  const allUp = probes.every((p) => p.status === 'up');
  const anyUnknown = probes.some((p) => p.status === 'unknown');
  const status = anyUnknown && !anyDown ? 'unknown' : anyDown ? 'down' : allUp ? 'up' : 'degraded';
  // Project latency/uptime = worst (max latency, min uptime) across its probes.
  const lat = probes.map((p) => p.latencyMs).filter((n) => n != null);
  const up = probes.map((p) => p.uptimePct).filter((n) => n != null);
  const p95 = probes.map((p) => p.p95Ms).filter((n) => n != null);
  const checked = probes.map((p) => p.checkedAt).filter(Boolean);
  return {
    id: project.id,
    status,
    latencyMs: lat.length ? Math.max(...lat) : null,
    uptimePct: up.length ? Math.min(...up) : null,
    p95Ms: p95.length ? Math.max(...p95) : null,
    checkedAt: checked.length ? Math.max(...checked) : null,
    probes
  };
}

export function getFleetHealth() {
  return {
    generatedAt: Date.now(),
    lastSweep,
    intervalMs: REFRESH_MS,
    real: true,
    projects: FLEET.map(summariseProject)
  };
}

export function hasData() {
  return lastSweep > 0;
}

// Kick off the background probe loop. One immediate sweep, then every REFRESH_MS.
let started = false;
export function startProbing() {
  if (started) return;
  started = true;
  sweep().catch(() => {});
  const timer = setInterval(() => sweep().catch(() => {}), REFRESH_MS);
  if (timer.unref) timer.unref(); // don't keep the process alive just for probing.
}

export const PROBE_CONFIG = { TIMEOUT_MS, HISTORY_MAX, REFRESH_MS };
