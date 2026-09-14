// =============================================================================
// Helm — app.js
// The single-page fleet command center. Vanilla ES modules, no framework, no
// build step, no network dependency beyond Helm's own JSON APIs. Everything the
// UI shows about up/down, latency, uptime and p95 comes from /api/fleet, which
// is backed by REAL server-side probes. Metrics that are not measured yet
// (web-vitals, error rate, cost) are generated deterministically and labelled
// SAMPLE — never presented as real.
// =============================================================================

/* ---------------------------------------------------------------------------
   0. Tiny helpers
   --------------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const api = (path) => fetch(path, { headers: { accept: 'application/json' } }).then((r) => {
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
});

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('helm.' + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('helm.' + k, v); } catch {} }
};

/* ---------------------------------------------------------------------------
   1. Formatting
   --------------------------------------------------------------------------- */
const fmtMs = (n) => (n == null ? '—' : `${Math.round(n)} ms`);
const fmtPct = (n) => (n == null ? '—' : `${n}%`);
function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}
const STATUS_LABEL = { up: 'Operational', down: 'Down', degraded: 'Degraded', local: 'Local app', unknown: 'Checking…' };

// Stable pseudo-random in [0,1) seeded by a string — for labelled SAMPLE data
// that must not flicker on every re-render.
function seeded(str, salt = '') {
  let h = 2166136261;
  const s = str + '::' + salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/* ---------------------------------------------------------------------------
   2. Icons (inline SVG, 24-box, stroke = currentColor)
   --------------------------------------------------------------------------- */
const ICON = {
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  pulse: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  heart: '<path d="M12 20s-7-4.4-9.3-8.5C1 8.4 2.6 5 6 5c2 0 3.2 1.2 4 2.3C10.8 6.2 12 5 14 5c3.4 0 5 3.4 3.3 6.5C19 15.6 12 20 12 20z"/>',
  rocket: '<path d="M5 15c-1.5 1-2 5-2 5s4-.5 5-2M9 15l-3-3c0-6 5-9 9-9 0 4-3 9-9 9l3 3zM14.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0"/>',
  share: '<path d="M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10.5 7.5l-4 8M13.5 7.5l4 8"/>',
  globe: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  spark: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5zM18 15l1 2.5L21.5 19 19 20l-1 2.5L17 20l-2.5-1 2.5-1 1-2.5z"/>',
  gear: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.1A1.6 1.6 0 0 0 9 1.1V1a2 2 0 0 1 4 0v.1A1.6 1.6 0 0 0 15 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.1 1.5h.1a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.1 1.5z"/>',
  search: '<path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v5h-5"/>',
  sun: '<path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v3M12 20v3M4 12H1M23 12h-3M5 5 3 3M21 21l-2-2M5 19l-2 2M21 3l-2 2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  contrast: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18z"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  github: '<path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.5 11.5 0 0 0-6 0C6.3 3.3 5.3 3.6 5.3 3.6a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 3.9 10c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V22"/>',
  fly: '<path d="M4 18c4 0 6-2 8-6s4-6 8-6M4 12c3 0 4.5-1 6-3M12 18c2 0 3-1 4-3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  clock: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  play: '<path d="M6 4l14 8-14 8V4z"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7M3 3v5h5"/>',
  logs: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
  rewind: '<path d="M11 19 2 12l9-7v14zM22 19l-9-7 9-7v14z"/>'
};
function icon(name, cls = '') {
  return `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ico-svg ${cls}" aria-hidden="true">${ICON[name] || ''}</svg>`;
}
function reticle(size = 30) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="11" stroke="currentColor" stroke-width="1.4" opacity="0.35"/>
    <circle cx="16" cy="16" r="7.5" stroke="currentColor" stroke-width="1.6"/>
    <path d="M16 1v6M16 25v6M1 16h6M25 16h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="2" fill="currentColor"/>
  </svg>`;
}

/* ---------------------------------------------------------------------------
   3. Sections + state
   --------------------------------------------------------------------------- */
const SECTIONS = [
  { id: 'overview', title: 'Overview', sub: 'Fleet status at a glance', icon: 'grid' },
  { id: 'performance', title: 'Performance', sub: 'Web Vitals & latency', icon: 'pulse' },
  { id: 'health', title: 'Health', sub: 'Probes & response codes', icon: 'heart' },
  { id: 'deploys', title: 'Deploys', sub: 'Releases & fleet actions', icon: 'rocket' },
  { id: 'alerts', title: 'Alerts', sub: 'Rules & recent activity', icon: 'bell' },
  { id: 'map', title: 'Service Map', sub: 'The ecosystem graph', icon: 'share' },
  { id: 'status', title: 'Status', sub: 'Public status summary', icon: 'globe' },
  { id: 'assistant', title: 'Assistant', sub: 'Ask about the fleet', icon: 'spark' },
  { id: 'settings', title: 'Settings', sub: 'Appearance & integrations', icon: 'gear' }
];
const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

const state = {
  fleet: [],
  generatedAt: 0,
  ecosystem: null,
  config: null,
  route: 'overview',
  project: null,
  loaded: false,
  chat: [] // assistant history: {role, text, src}
};

const projById = (id) => state.fleet.find((p) => p.id === id);

// Overall fleet posture (local apps never count as "down").
function fleetPosture() {
  const probed = state.fleet.filter((p) => p.status !== 'local');
  if (!probed.length) return { state: 'unknown', up: 0, total: 0 };
  const up = probed.filter((p) => p.status === 'up').length;
  const anyDown = probed.some((p) => p.status === 'down');
  const anyOff = probed.some((p) => p.status === 'degraded' || p.status === 'unknown');
  const s = anyDown ? 'down' : anyOff ? 'degraded' : 'up';
  return { state: s, up, total: probed.length };
}

/* ---------------------------------------------------------------------------
   4. Charts (hand-drawn SVG — no chart library, CSP-clean)
   --------------------------------------------------------------------------- */
function sparkline(spark, opts = {}) {
  const pts = (spark || []).filter((s) => s.ms != null);
  const W = 100, H = 40, pad = 3;
  if (pts.length < 2) {
    return `<div class="spark-empty">collecting samples…</div>`;
  }
  const vals = pts.map((s) => s.ms);
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = Math.max(1, max - min);
  const stepX = (W - pad * 2) / (spark.length - 1);
  let d = '';
  spark.forEach((s, i) => {
    if (s.ms == null) return;
    const x = pad + i * stepX;
    const y = H - pad - ((s.ms - min) / span) * (H - pad * 2);
    d += (d ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  });
  // down markers
  let downs = '';
  spark.forEach((s, i) => {
    if (s.ok === false) {
      const x = pad + i * stepX;
      downs += `<circle cx="${x.toFixed(1)}" cy="${H - pad}" r="1.8" fill="var(--bad)"/>`;
    }
  });
  const area = `${d} L${(pad + (spark.length - 1) * stepX).toFixed(1)} ${H - pad} L${pad} ${H - pad} Z`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="latency trend, ${Math.round(min)} to ${Math.round(max)} ms">
    <path d="${area}" fill="var(--proj, var(--accent))" opacity="0.12"/>
    <path d="${d}" fill="none" stroke="var(--proj, var(--accent))" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    ${downs}
  </svg>`;
}

function barChart(rows, opts = {}) {
  // rows: [{label, value, accent}], value in ms (or generic). Horizontal bars.
  // opts.unit    — value suffix (e.g. ' ms', '%').
  // opts.scale   — 'sqrt' compresses a heavy outlier (a cold-start p95) so the
  //                normal-range services stay legible; the outlier still reads
  //                as the longest bar. Noted honestly wherever it is used.
  // opts.budget / opts.budgetLabel — a reference line drawn on every track at
  //                that value's scaled position (same scale as the bars).
  const unit = opts.unit || '';
  const values = rows.map((r) => r.value).filter((v) => v != null);
  const max = Math.max(1, ...values);
  const sqrtMode = opts.scale === 'sqrt';
  const scaledPct = (v) => {
    if (v == null) return 0;
    const f = sqrtMode ? Math.sqrt(Math.max(0, v) / max) : (v / max);
    return Math.max(0, Math.min(1, f)) * 100;
  };
  const marked = sqrtMode || opts.budget != null;
  const budgetPct = opts.budget != null ? scaledPct(opts.budget) : null;
  return el('div', { class: 'stack-v' }, ...rows.map((r) => {
    const pct = scaledPct(r.value);
    const track = el('div', { class: 'gauge' + (marked ? ' helm-track' : ''), style: 'flex:1' },
      el('span', { class: 'gauge-fill', style: `width:${r.value == null ? 0 : pct.toFixed(1)}%;background:var(--proj)` }));
    if (budgetPct != null && budgetPct > 0.5 && budgetPct < 99.5) {
      track.appendChild(el('span', { class: 'helm-budget-tick', style: `left:${budgetPct.toFixed(1)}%`, title: opts.budgetLabel || 'budget' }));
    }
    return el('div', { class: 'gauge-row', style: `--proj:${r.accent || 'var(--accent)'}` },
      el('span', { style: 'flex:0 0 6.5rem;color:var(--ink)', text: r.label }),
      track,
      el('span', { class: 'gauge-value', style: 'flex:0 0 5rem;text-align:right', text: r.value == null ? '—' : `${Math.round(r.value)}${unit}` })
    );
  }));
}

/* Fleet latency-over-time — a prominent, multi-series line chart across every
   probed service, drawn from REAL rolling probe history (each project's primary
   endpoint spark: {t, ms, ok}). One hand-drawn inline SVG, no library. A √
   (square-root) y-axis keeps every service legible even when one machine
   cold-starts into multi-second latency. Returns SVG + a legend, or a
   collecting-samples note before enough history exists. */
function fleetLatencyChart() {
  const series = state.fleet
    .filter((p) => p.status !== 'local' && p.probes && p.probes[0] && Array.isArray(p.probes[0].spark))
    .map((p) => ({
      id: p.id, name: p.name, accent: p.accent, latest: p.latencyMs,
      pts: p.probes[0].spark.map((s) => ({ t: s.t, ms: s.ms, ok: s.ok }))
    }))
    .filter((s) => s.pts.length);

  const okPts = series.flatMap((s) => s.pts.filter((p) => p.ms != null));
  if (okPts.length < 2) {
    return `<div class="ts-empty">Collecting probe samples… the fleet latency trend appears after the first few 30-second sweeps.</div>`;
  }

  const allT = series.flatMap((s) => s.pts.map((p) => p.t));
  let tMin = Math.min(...allT), tMax = Math.max(...allT);
  if (tMax <= tMin) tMax = tMin + 1;
  const vMax = Math.max(...okPts.map((p) => p.ms));
  const axisMax = vMax * 1.06;

  const W = 780, H = 300, padL = 48, padR = 14, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const baseY = padT + plotH;
  const xFor = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;
  const yFor = (v) => padT + (1 - Math.sqrt(Math.max(0, v) / axisMax)) * plotH;

  // Y gridlines at round ms values, positioned by the √ scale.
  const GRID = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000];
  let yticks = GRID.filter((v) => v <= vMax);
  if (!yticks.length) yticks = [Math.round(vMax)];
  let grid = '';
  for (const v of yticks) {
    const y = yFor(v);
    grid += `<line class="ts-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="ts-axis" x="${padL - 7}" y="${(y + 3).toFixed(1)}" text-anchor="end">${v >= 1000 ? (v / 1000) + 's' : v + 'ms'}</text>`;
  }

  // X ticks — minutes-ago, four across.
  const now = state.generatedAt || Date.now();
  let xaxis = '';
  for (let i = 0; i <= 3; i++) {
    const t = tMin + (i / 3) * (tMax - tMin);
    const x = xFor(t);
    const mins = Math.max(0, Math.round((now - t) / 60000));
    const lbl = i === 3 ? 'now' : `−${mins}m`;
    xaxis += `<text class="ts-axis" x="${x.toFixed(1)}" y="${H - padB + 16}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${lbl}</text>`;
  }

  // One line per service (broken on down/null samples), a down tick at the
  // baseline for failed probes, and a filled dot on the most recent sample.
  let paths = '', downs = '', dots = '';
  for (const s of series) {
    let d = '', pen = false;
    for (const p of s.pts) {
      if (p.ms == null) {
        pen = false;
        if (p.ok === false) downs += `<circle cx="${xFor(p.t).toFixed(1)}" cy="${(baseY + 3).toFixed(1)}" r="1.7" fill="var(--bad)"/>`;
        continue;
      }
      const x = xFor(p.t), y = yFor(p.ms);
      d += (pen ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      pen = true;
    }
    if (d) paths += `<path d="${d}" fill="none" stroke="${s.accent}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.95"/>`;
    const last = [...s.pts].reverse().find((p) => p.ms != null);
    if (last) dots += `<circle cx="${xFor(last.t).toFixed(1)}" cy="${yFor(last.ms).toFixed(1)}" r="2.6" fill="${s.accent}" stroke="var(--surface)" stroke-width="1"/>`;
  }

  const svg = `<svg class="ts-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fleet latency over time — primary endpoint per project, square-root scale, from real probe history">
    ${grid}
    <line class="ts-axis-line" x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}"/>
    ${paths}${downs}${dots}
    ${xaxis}
  </svg>`;
  const legend = series
    .map((s) => `<span class="lg"><span class="sw" style="background:${s.accent}"></span>${s.name} <b class="mono">${fmtMs(s.latest)}</b></span>`)
    .join('');
  return `${svg}<div class="chart-legend">${legend}</div>`;
}

/* Core Web Vitals threshold bars. Google's standard bands, per metric:
   LCP good ≤2.5s / poor >4s · INP good ≤200ms / poor >500ms ·
   CLS good ≤0.1 / poor >0.25 · error rate good ≤1% / poor >5%.
   Values are deterministic SAMPLE placeholders (see sampleVitals) and labelled
   as such — never presented as measured. */
const VITALS = [
  { key: 'lcp',     name: 'LCP', good: 2.5, needs: 4.0,  ceil: 5.0, unit: 's',  fmt: (v) => v.toFixed(2) + 's' },
  { key: 'inp',     name: 'INP', good: 200, needs: 500,  ceil: 600, unit: 'ms', fmt: (v) => Math.round(v) + 'ms' },
  { key: 'cls',     name: 'CLS', good: 0.1, needs: 0.25, ceil: 0.4, unit: '',   fmt: (v) => v.toFixed(3) },
  { key: 'errRate', name: 'Error rate', good: 1.0, needs: 5.0, ceil: 8.0, unit: '%', fmt: (v) => v.toFixed(2) + '%' }
];
function vitalBand(v, m) { return v <= m.good ? 'good' : v <= m.needs ? 'needs' : 'poor'; }
function vitalCell(v, m) {
  const clamp = (x) => Math.max(0, Math.min(100, x));
  const w = clamp((v / m.ceil) * 100);
  const gPos = clamp((m.good / m.ceil) * 100);
  const nPos = clamp((m.needs / m.ceil) * 100);
  const band = vitalBand(v, m);
  const bandText = band === 'good' ? 'good' : band === 'needs' ? 'needs improvement' : 'poor';
  const zones = `linear-gradient(to right,`
    + ` color-mix(in srgb, var(--ok) 16%, var(--surface)) 0 ${gPos.toFixed(1)}%,`
    + ` color-mix(in srgb, var(--warn) 16%, var(--surface)) ${gPos.toFixed(1)}% ${nPos.toFixed(1)}%,`
    + ` color-mix(in srgb, var(--bad) 16%, var(--surface)) ${nPos.toFixed(1)}% 100%)`;
  return `<td data-numeric="true">
    <div class="vcell">
      <div class="vbar" style="background:${zones}" role="img" aria-label="${m.name} ${m.fmt(v)} — ${bandText}">
        <span class="vbar-fill vb-${band}" style="width:${w.toFixed(1)}%"></span>
        <span class="vbar-tick" style="left:${gPos.toFixed(1)}%"></span>
        <span class="vbar-tick" style="left:${nPos.toFixed(1)}%"></span>
      </div>
      <span class="vnum" data-band="${band}">${m.fmt(v)}</span>
    </div>
  </td>`;
}
function vitalsChart() {
  const projects = state.fleet.filter((p) => p.status !== 'local');
  const legend = `<div class="vitals-legend">
    <span class="lg"><span class="sw" style="background:var(--ok)"></span> Good</span>
    <span class="lg"><span class="sw" style="background:var(--warn)"></span> Needs improvement</span>
    <span class="lg"><span class="sw" style="background:var(--bad)"></span> Poor</span>
    <span class="muted">— standard Web Vitals bands; each tinted track shows a metric's good / needs / poor zones and the fill lands in its band.</span>
  </div>`;
  const head = `<tr><th>Project</th>${VITALS
    .map((m) => `<th data-numeric="true">${m.name} <em style="font-weight:400;color:var(--ink-2)">good ≤ ${m.good}${m.unit}</em></th>`)
    .join('')}<th data-numeric="true">p95 <em style="font-weight:400;color:var(--ink-2)">(real)</em></th></tr>`;
  const rows = projects.map((p) => {
    const raw = sampleVitals(p.id);
    const vals = { lcp: parseFloat(raw.lcp), inp: parseFloat(raw.inp), cls: parseFloat(raw.cls), errRate: parseFloat(raw.errRate) };
    const cells = VITALS.map((m) => vitalCell(vals[m.key], m)).join('');
    return `<tr><td><span class="mono">${p.name}</span></td>${cells}<td data-numeric="true"><span class="mono">${fmtMs(p.p95Ms)}</span></td></tr>`;
  }).join('');
  return `${legend}<div class="table-wrap"><table class="table table-striped vitals-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------------------------------------------------------------------------
   5. Small view atoms
   --------------------------------------------------------------------------- */
function tagReal() { return `<span class="tag tag-real">Real</span>`; }
function tagSample() { return `<span class="tag tag-sample">Sample</span>`; }
// Compact data-source / freshness label for a metric group. Live = real probe
// data with how long ago it was refreshed; Sample = labelled placeholder data.
function freshLive() { return `<span class="tag tag-real" title="Measured from Helm’s server-side probes">Live probe · updated ${timeAgo(state.generatedAt)}</span>`; }
function freshSample() { return `<span class="tag tag-sample" title="Labelled placeholder — not a real measurement">Sample</span>`; }
function statusChip(s) {
  return `<span class="status" data-s="${s}"><span class="dot"></span>${STATUS_LABEL[s] || s}</span>`;
}
function sectionHead(title, desc, extraHtml = '') {
  return `<div class="section-head"><div class="head-row"><div><h2>${title}</h2><p>${desc}</p></div><div class="topbar-tools">${extraHtml}</div></div></div>`;
}

// deterministic labelled SAMPLE web-vitals for a project
function sampleVitals(id) {
  return {
    lcp: (1.1 + seeded(id, 'lcp') * 1.6).toFixed(2),        // s
    inp: Math.round(40 + seeded(id, 'inp') * 170),          // ms
    cls: (0.01 + seeded(id, 'cls') * 0.11).toFixed(3),      // unitless
    errRate: (0.05 + seeded(id, 'err') * 1.1).toFixed(2)    // %
  };
}

/* ---------------------------------------------------------------------------
   6. VIEWS
   --------------------------------------------------------------------------- */
function viewOverview() {
  const wrap = el('div', { class: 'view' });
  const post = fleetPosture();
  const lats = state.fleet.map((p) => p.latencyMs).filter((n) => n != null);
  const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
  const ups = state.fleet.map((p) => p.uptimePct).filter((n) => n != null);
  const avgUp = ups.length ? Math.round((ups.reduce((a, b) => a + b, 0) / ups.length) * 10) / 10 : null;
  const endpoints = state.fleet.reduce((n, p) => n + (p.probes ? p.probes.length : 0), 0);

  wrap.appendChild(el('div', { html: sectionHead(
    'Fleet Overview',
    'Real-time status across the seven-project ecosystem. Up/down, latency and uptime are measured by Helm’s server-side probes; the sparkline is real latency history.',
    tagReal()
  ) }));

  wrap.appendChild(el('div', { class: 'metric-meta', html: `${freshLive()}<span class="metric-meta-note">Operational count, latency and uptime are read from Helm’s server-side probes.</span>` }));
  wrap.appendChild(el('div', { class: 'kpi-row', html: `
    <div class="kpi"><div class="kpi-label">${icon('globe')} Services operational</div><div class="kpi-value">${post.up}<small> / ${post.total}</small></div><div class="kpi-sub">${post.up}/${post.total} web endpoints up · Zeno local</div></div>
    <div class="kpi"><div class="kpi-label">${icon('clock')} Avg. latency</div><div class="kpi-value">${avgLat == null ? '—' : avgLat}<small> ms</small></div><div class="kpi-sub">mean of last live probe</div></div>
    <div class="kpi"><div class="kpi-label">${icon('pulse')} Avg. uptime</div><div class="kpi-value">${avgUp == null ? '—' : avgUp}<small>%</small></div><div class="kpi-sub">rolling sampled window</div></div>
    <div class="kpi"><div class="kpi-label">${icon('layers')} Endpoints watched</div><div class="kpi-value">${endpoints}</div><div class="kpi-sub">across ${state.fleet.length} projects</div></div>
  ` }));

  // Prominent fleet-wide latency time-series (real probe history).
  const tsPanel = el('div', { class: 'panel', style: 'margin-bottom:var(--sp-5)' });
  tsPanel.innerHTML = `
    <div class="row-between" style="align-items:flex-start">
      <div>
        <h3 style="margin:0">${icon('pulse')} Fleet latency over time ${tagReal()}</h3>
        <p class="panel-note" style="margin:6px 0 0;max-width:64ch">Live probe latency for each web service's primary endpoint, from Helm's rolling history. A √ (square-root) y-axis keeps every service legible even when one machine cold-starts into multi-second latency.</p>
      </div>
    </div>
    <div class="ts-wrap">${fleetLatencyChart()}</div>`;
  wrap.appendChild(tsPanel);

  const grid = el('div', { class: 'fleet-grid' });
  for (const p of state.fleet) grid.appendChild(projectCard(p));
  wrap.appendChild(grid);
  return wrap;
}

function projectCard(p) {
  const mark = p.name === 'glass' ? 'gl' : p.name.slice(0, 2);
  const spark = p.probes && p.probes[0] ? p.probes[0].spark : null;
  const card = el('div', {
    class: 'proj-card',
    style: `--proj:${p.accent}`,
    role: 'button',
    tabindex: '0',
    'aria-label': `${p.name} — ${STATUS_LABEL[p.status] || p.status}`
  });
  const deployFresh = p.releases && p.releases[0] ? p.releases[0].when : null;
  card.innerHTML = `
    <div class="proj-head">
      <div class="proj-mark">${mark}</div>
      <div style="min-width:0">
        <h3 class="proj-name">${p.name}${p.foundation ? ' <span class="pill-mini">foundation</span>' : ''}</h3>
        <div class="proj-tag">${p.tagline}</div>
      </div>
      <div class="proj-head-end">${statusChip(p.status)}</div>
    </div>
    <div class="proj-meta">
      <span class="m">latency <b>${fmtMs(p.latencyMs)}</b></span>
      <span class="m">uptime <b>${fmtPct(p.uptimePct)}</b></span>
      <span class="m">p95 <b>${fmtMs(p.p95Ms)}</b></span>
    </div>
    <div class="spark-wrap">${p.status === 'local' ? `<div class="spark-empty">local desktop app — not web-deployed</div>` : sparkline(spark)}</div>
    <div class="proj-foot">
      <div class="stack-pills">${p.stack.slice(0, 4).map((s) => `<span class="pill-mini">${s}</span>`).join('')}</div>
    </div>
    <div class="proj-foot">
      ${p.liveUrl ? `<a class="linkA" href="${p.liveUrl}" target="_blank" rel="noopener">${icon('external')} Open live</a>` : `<span class="muted" style="font-size:var(--fs-0)">no public URL</span>`}
      <span class="muted" style="font-size:var(--fs-0);margin-left:auto">${deployFresh ? 'deploy ' + deployFresh : ''}</span>
    </div>
  `;
  const go = () => { location.hash = '#/health/' + p.id; };
  card.addEventListener('click', (e) => { if (!e.target.closest('a')) go(); });
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  return card;
}

function viewPerformance() {
  const wrap = el('div', { class: 'view' });
  wrap.appendChild(el('div', { html: sectionHead(
    'Performance & Web Vitals',
    'p50/p95 latency and uptime are measured from real probe history. Core Web Vitals (LCP/INP/CLS) and error rate are SAMPLE placeholders with wiring notes below — never fake numbers presented as real.',
    tagReal() + tagSample()
  ) }));

  // REAL: p95 latency bar chart across probed projects
  const perf = el('div', { class: 'grid-2' });
  const latRows = state.fleet.filter((p) => p.status !== 'local').map((p) => ({ label: p.name, value: p.p95Ms ?? p.latencyMs, accent: p.accent }));
  const latPanel = el('div', { class: 'panel' });
  const slowest = latRows.filter((r) => r.value != null).sort((a, b) => b.value - a.value)[0];
  const budgetVisible = slowest && slowest.value > 2525; // the 2500 ms line only falls on-scale once a service runs this slow
  const budgetNote = budgetVisible
    ? ` The <span style="color:var(--warn);font-weight:600">amber line</span> marks the 2500 ms p95 budget.`
    : ` A <span style="color:var(--warn);font-weight:600">2500 ms p95-budget line</span> appears once a service runs slow enough to approach it.`;
  latPanel.innerHTML = `<h3>${icon('pulse')} p95 latency by project ${freshLive()}</h3><p class="panel-note">Computed from the rolling window of successful probes. Drawn on a <b>√ (square-root) scale</b> so one cold-start p95${slowest ? ` — currently ${slowest.label} at ${Math.round(slowest.value)} ms` : ''} doesn't squash the rest flat; that bar still reads as the longest.${budgetNote}</p>`;
  latPanel.appendChild(barChart(latRows, { unit: ' ms', scale: 'sqrt', budget: 2500, budgetLabel: 'p95 budget · 2500 ms' }));
  perf.appendChild(latPanel);

  const upPanel = el('div', { class: 'panel' });
  upPanel.innerHTML = `<h3>${icon('check')} Uptime by project ${freshLive()}</h3><p class="panel-note">Share of probe samples that returned a healthy response since Helm started.</p>`;
  upPanel.appendChild(barChart(state.fleet.filter((p) => p.status !== 'local').map((p) => ({ label: p.name, value: p.uptimePct, accent: p.accent })), { unit: '%' }));
  perf.appendChild(upPanel);
  wrap.appendChild(perf);

  // SAMPLE: web vitals as threshold bars (numbers kept, honestly labelled).
  const vpanel = el('div', { class: 'panel', style: 'margin-top:var(--sp-4)' });
  vpanel.innerHTML = `<h3>${icon('layers')} Core Web Vitals ${freshSample()}</h3>
    <p class="panel-note">Placeholder values, stable per project, shown against the standard Web Vitals thresholds so each metric reads at a glance. Wire real data from a Real-User-Monitoring beacon (e.g. the <code>web-vitals</code> library posting to <code>/api/vitals</code>) or a Lighthouse-CI job. Vantage already ships product analytics and would be the first real source. The p95 column is real.</p>`;
  vpanel.appendChild(el('div', { html: vitalsChart() }));
  wrap.appendChild(vpanel);
  return wrap;
}

function viewHealth() {
  const wrap = el('div', { class: 'view' });
  wrap.appendChild(el('div', { html: sectionHead(
    'Health & Probes',
    'Every endpoint Helm probes, with the last HTTP status code, measured latency and time of last check. All real.',
    tagReal() + `<button class="btn" id="refresh-inline">${icon('refresh')} Refresh</button>`
  ) }));

  for (const p of state.fleet) {
    const focused = state.project === p.id;
    const panel = el('div', { class: 'panel', style: `--proj:${p.accent};margin-bottom:var(--sp-3)${focused ? ';border-color:color-mix(in srgb, var(--proj) 55%, var(--line))' : ''}`, id: 'h-' + p.id });
    let probeRows;
    if (!p.probes || !p.probes.length) {
      probeRows = `<tr><td colspan="5" class="table-empty">${p.name} is a local desktop app — no web endpoint to probe.</td></tr>`;
    } else {
      probeRows = p.probes.map((pr) => `<tr>
        <td>${pr.name}</td>
        <td>${statusChip(pr.status)}</td>
        <td data-numeric="true">${pr.code == null ? '—' : pr.code}</td>
        <td data-numeric="true">${fmtMs(pr.latencyMs)}</td>
        <td class="mono" style="max-width:24rem;white-space:normal">${pr.error ? pr.error : '<a class="linkA" href="' + pr.url + '" target="_blank" rel="noopener">' + pr.url.replace(/^https?:\/\//, '') + '</a>'}</td>
      </tr>`).join('');
    }
    panel.innerHTML = `
      <div class="row-between">
        <h3 style="margin:0">${statusChip(p.status)} &nbsp; ${p.name}</h3>
        <span class="muted" style="font-size:var(--fs-0)">last check ${timeAgo(p.checkedAt)} · uptime ${fmtPct(p.uptimePct)} · ${p.probes ? p.probes.reduce((n, x) => Math.max(n, x.samples || 0), 0) : 0} samples</span>
      </div>
      <div class="table-wrap" style="margin-top:var(--sp-3)">
        <table class="table"><thead><tr><th>Endpoint</th><th>Status</th><th data-numeric="true">Code</th><th data-numeric="true">Latency</th><th>URL / error</th></tr></thead>
        <tbody>${probeRows}</tbody></table>
      </div>`;
    wrap.appendChild(panel);
  }
  return wrap;
}

function viewDeploys() {
  const wrap = el('div', { class: 'view' });
  wrap.appendChild(el('div', { html: sectionHead(
    'Deploys & Actions',
    'A releases timeline per project (SAMPLE — would come from fly.io / GitHub) and one-click fleet actions. Actions are a safe DRY RUN: Helm shows the exact command it would run and performs nothing.',
    tagSample() + `<span class="tag" style="border-color:color-mix(in srgb,var(--bad) 40%,var(--surface));background:color-mix(in srgb,var(--bad) 16%,var(--surface))">Dry run — no real deploys</span>`
  ) }));

  const grid = el('div', { class: 'grid-2' });
  for (const p of state.fleet) {
    const panel = el('div', { class: 'panel', style: `--proj:${p.accent}` });
    const isFly = p.deploy && p.deploy.target === 'fly';
    const rel = (p.releases || []).map((r) => `<li data-kind="${r.kind}">
      <div class="tl-head"><span class="mono" style="color:var(--ink);font-weight:600">${r.version}</span> <span class="chip">${r.kind}</span> <span class="tl-when">${r.when}</span></div>
      <div class="tl-note">${r.note} <span class="tag tag-sample" style="margin-left:6px">sample</span></div>
    </li>`).join('');
    panel.innerHTML = `
      <div class="row-between"><h3 style="margin:0">${p.name}</h3><span class="chip chip-mono">${p.deploy ? (p.deploy.app || p.deploy.platform) : '—'}</span></div>
      <p class="panel-note">${p.deploy ? p.deploy.platform : ''}${p.deploy && p.deploy.region ? ' · ' + p.deploy.region : ''}${statusChipInline(p.status)}</p>
      <ul class="timeline">${rel || '<li>no releases recorded</li>'}</ul>
      <div class="action-row">
        <button class="btn" data-act="deploy" data-p="${p.id}">${icon('play')} Deploy</button>
        <button class="btn" data-act="rollback" data-p="${p.id}">${icon('rewind')} Rollback</button>
        <button class="btn" data-act="restart" data-p="${p.id}">${icon('restart')} Restart</button>
        <button class="btn" data-act="logs" data-p="${p.id}">${icon('logs')} Logs</button>
      </div>
      ${!isFly ? `<p class="panel-note" style="margin-top:var(--sp-2)">${p.deploy && p.deploy.target === 'local' ? 'Local app — actions have no remote target.' : 'Pages project — redeploys via git push.'}</p>` : ''}
    `;
    grid.appendChild(panel);
  }
  wrap.appendChild(grid);
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    runAction(btn.dataset.p, btn.dataset.act);
  });
  return wrap;
}
function statusChipInline(s) { return ` &nbsp;·&nbsp; ${statusChip(s)}`; }

function viewAlerts() {
  const wrap = el('div', { class: 'view' });
  wrap.appendChild(el('div', { html: sectionHead(
    'Alerts',
    'Alert rules are evaluated LIVE against the real probe data — a firing alert here is real. The recent-activity feed below is SAMPLE history, labelled.',
    tagReal() + tagSample()
  ) }));

  // Real rule evaluation
  const rules = [
    { id: 'down', label: 'Endpoint down', desc: 'Any project probe not returning a healthy response', test: (p) => p.status === 'down' },
    { id: 'slow', label: 'High latency', desc: 'Last probe latency over 3000 ms (cold start or degraded)', test: (p) => p.latencyMs != null && p.latencyMs > 3000 },
    { id: 'p95', label: 'p95 budget breach', desc: 'p95 latency over 2500 ms across the window', test: (p) => p.p95Ms != null && p.p95Ms > 2500 }
  ];
  const rulePanel = el('div', { class: 'panel' });
  let rulesHtml = '';
  for (const r of rules) {
    const firing = state.fleet.filter((p) => p.status !== 'local' && r.test(p));
    rulesHtml += `<div class="status-line" style="border-left:3px solid ${firing.length ? 'var(--bad)' : 'var(--ok)'}">
      <div><div class="nm">${r.label}</div><div class="muted" style="font-size:var(--fs-0)">${r.desc}</div></div>
      <div class="end">${firing.length
        ? `<span class="state state-bad"><span class="state-text"></span></span> ${firing.map((p) => p.name).join(', ')}`
        : `<span class="state state-ok"><span class="state-text"></span></span> all clear`}</div>
    </div>`;
  }
  rulePanel.innerHTML = `<h3>${icon('bell')} Live rules ${tagReal()}</h3><p class="panel-note">Evaluated against the latest real probe on every refresh.</p><div class="status-list">${rulesHtml}</div>`;
  wrap.appendChild(rulePanel);

  // Sample recent feed
  const feed = el('div', { class: 'panel', style: 'margin-top:var(--sp-4)' });
  const kinds = ['warn', 'ok', 'info', 'bad'];
  const items = state.fleet.filter((p) => p.status !== 'local').slice(0, 6).map((p, i) => {
    const k = kinds[Math.floor(seeded(p.id, 'alert') * 4)];
    const mins = Math.floor(seeded(p.id, 'when') * 240);
    const msgs = {
      warn: `${p.name} latency approached its budget`,
      ok: `${p.name} recovered to healthy`,
      info: `${p.name} deploy completed`,
      bad: `${p.name} health check failed once`
    };
    return `<div class="status-line"><span class="state state-${k}"><span class="state-text"></span></span><div class="nm">${msgs[k]}</div><div class="end">${mins}m ago <span class="tag tag-sample">sample</span></div></div>`;
  }).join('');
  feed.innerHTML = `<h3>${icon('clock')} Recent activity ${tagSample()}</h3><p class="panel-note">Illustrative history. Wire to fly.io / an alerting webhook (PagerDuty, BetterStack) to make this real.</p><div class="status-list">${items}</div>`;
  wrap.appendChild(feed);
  return wrap;
}

function viewMap() {
  const wrap = el('div', { class: 'view' });
  wrap.appendChild(el('div', { html: sectionHead(
    'Service & Stack Map',
    'How the seven projects connect. glass is the shared design-system foundation every project is built on, and MCP is the interface Zeno and Helm use to drive them. Node rings show live status; click a node to open its health detail.',
    tagReal()
  ) }));
  const mapWrap = el('div', { class: 'map-wrap' });
  mapWrap.innerHTML = ecosystemSvg();
  // Node clicks + keyboard (Enter / Space) open the project's health detail.
  const openNode = (t) => { const n = t.closest('.map-node'); if (n) location.hash = '#/health/' + n.dataset.id; };
  mapWrap.addEventListener('click', (e) => openNode(e.target));
  mapWrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const n = e.target.closest('.map-node'); if (n) { e.preventDefault(); openNode(n); } } });
  wrap.appendChild(mapWrap);

  const legend = el('div', { class: 'panel', style: 'margin-top:var(--sp-4)' });
  legend.innerHTML = `<h3>${icon('share')} Reading the graph</h3>
    <div class="chart-legend">
      <span class="lg"><span class="sw" style="background:var(--line)"></span> built on glass (solid)</span>
      <span class="lg"><span class="sw" style="background:var(--accent)"></span> MCP link (dashed)</span>
      <span class="lg"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:var(--ok);display:inline-block"></span> up</span>
      <span class="lg"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:var(--bad);display:inline-block"></span> down</span>
      <span class="lg"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:var(--info);display:inline-block"></span> local</span>
    </div>
    <div class="table-wrap" style="margin-top:var(--sp-3)"><table class="table table-striped"><thead><tr><th>Project</th><th>Role</th><th>Built on glass</th><th>Exposes MCP</th></tr></thead><tbody>
    ${state.fleet.map((p) => `<tr><td class="mono">${p.name}</td><td>${p.role}</td><td>${p.usesGlass ? icon('check') + ' yes' : '—'}</td><td>${p.mcp && p.mcp.exposes ? icon('check') + ' yes' : '<span class="muted">planned</span>'}</td></tr>`).join('')}
    </tbody></table></div>`;
  wrap.appendChild(legend);
  return wrap;
}

function ecosystemSvg() {
  const W = 760, H = 460, cx = W / 2, cy = H / 2;
  const center = projById('glass');
  const others = state.fleet.filter((p) => p.id !== 'glass');
  const R = 165;
  const pos = {};
  pos['glass'] = { x: cx, y: cy };
  others.forEach((p, i) => {
    const a = (-Math.PI / 2) + (i / others.length) * Math.PI * 2;
    pos[p.id] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
  });
  const statusColor = (s) => s === 'up' ? 'var(--ok)' : s === 'down' ? 'var(--bad)' : s === 'local' ? 'var(--info)' : s === 'degraded' ? 'var(--warn)' : 'var(--ink-3)';

  // edges: built-on glass
  let edges = '';
  for (const p of others) {
    edges += `<line class="map-edge" x1="${pos[p.id].x}" y1="${pos[p.id].y}" x2="${cx}" y2="${cy}"/>`;
  }
  // mcp edge zeno -> vantage
  if (pos['zeno'] && pos['vantage']) {
    edges += `<path class="map-edge-mcp" d="M${pos['zeno'].x} ${pos['zeno'].y} Q ${cx} ${cy - 120} ${pos['vantage'].x} ${pos['vantage'].y}"/>`;
  }

  // Each node is a real control: click / Enter / Space opens that project's
  // health detail (same target as the Overview cards and the ⌘K palette).
  const node = (p, r = 30) => {
    const { x, y } = pos[p.id];
    return `<g class="map-node" data-id="${p.id}" role="link" tabindex="0" aria-label="${p.name} — ${STATUS_LABEL[p.status] || p.status}. Open health detail">
      <circle cx="${x}" cy="${y}" r="${r + 4}" fill="none" stroke="${statusColor(p.status)}" stroke-width="2" opacity="0.9"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="color-mix(in srgb, ${p.accent} 22%, var(--surface))" stroke="${p.accent}" stroke-width="1.5"/>
      <text x="${x}" y="${y + 2}" text-anchor="middle" class="map-node-label">${p.name}</text>
      <text x="${x}" y="${y + r + 15}" text-anchor="middle" class="map-node-sub">${p.mcp && p.mcp.exposes ? 'MCP' : ''}</text>
    </g>`;
  };
  let nodes = node(center, 40);
  for (const p of others) nodes += node(p, 28);

  return `<svg class="map-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ecosystem graph: glass at the centre, six products around it, MCP link from Zeno to Vantage">
    ${edges}
    <text x="${cx}" y="${cy + 58}" text-anchor="middle" class="map-node-sub">design-system foundation</text>
    ${nodes}
  </svg>`;
}

function viewStatus() {
  const wrap = el('div', { class: 'view' });
  const post = fleetPosture();
  const overall = post.state === 'up' ? 'All systems operational' : post.state === 'down' ? 'Partial outage' : 'Degraded performance';
  const ringColor = post.state === 'up' ? 'var(--ok)' : post.state === 'down' ? 'var(--bad)' : 'var(--warn)';
  wrap.appendChild(el('div', { html: sectionHead(
    'Status',
    'A clean, public-style status summary generated entirely from real probes. Shareable as the fleet’s status page.',
    tagReal()
  ) }));
  wrap.appendChild(el('div', { class: 'status-hero', html: `
    <div class="ring" style="color:${ringColor}">${reticle(60)}</div>
    <div><h2>${overall}</h2><p>${post.up}/${post.total} web endpoints up · Zeno local · updated ${timeAgo(state.generatedAt)}</p></div>
  ` }));
  const list = el('div', { class: 'status-list' });
  for (const p of state.fleet) {
    list.appendChild(el('div', { class: 'status-line', style: `--proj:${p.accent}`, html: `
      <span class="dot" style="width:10px;height:10px;border-radius:50%;background:${p.status === 'up' ? 'var(--ok)' : p.status === 'down' ? 'var(--bad)' : p.status === 'local' ? 'var(--info)' : 'var(--warn)'};flex:none"></span>
      <span class="nm">${p.name}</span>
      <span class="muted" style="font-size:var(--fs-0)">${p.tagline}</span>
      <span class="end">${p.status === 'local' ? 'local app' : fmtMs(p.latencyMs) + ' · ' + fmtPct(p.uptimePct)} &nbsp; ${statusChip(p.status)}</span>
    ` }));
  }
  wrap.appendChild(list);
  return wrap;
}

function viewAssistant() {
  const wrap = el('div', { class: 'view' });
  wrap.appendChild(el('div', { html: sectionHead(
    'Fleet Assistant',
    'Ask about the fleet. The assistant answers only from a small facts base plus the live probe data — and says so when it doesn’t know. No external model call; fully client-side.',
    tagReal()
  ) }));
  const panel = el('div', { class: 'panel' });
  const suggests = ['Is Textify up?', 'What is Vantage?', 'Which projects expose MCP?', 'How many services are up?', 'What is Helm?', 'Latency of HealthFlow'];
  panel.innerHTML = `<div class="suggests">${suggests.map((s) => `<button class="chip suggest">${s}</button>`).join('')}</div>`;
  const chat = el('div', { class: 'chat' });
  const log = el('div', { class: 'chat-log', id: 'chat-log' });
  if (!state.chat.length) {
    state.chat.push({ role: 'bot', text: 'Hi — I’m the Helm fleet assistant. Ask me about any of the seven projects, their status, stack or how the ecosystem fits together.', src: null });
  }
  for (const m of state.chat) log.appendChild(chatBubble(m));
  const form = el('form', { class: 'chat-input' });
  const input = el('input', { class: 'field', placeholder: 'Ask about the fleet…', 'aria-label': 'Ask the fleet assistant' });
  form.appendChild(input);
  form.appendChild(el('button', { class: 'btn btn-primary', type: 'submit' }, 'Ask'));
  chat.appendChild(log);
  chat.appendChild(form);
  panel.appendChild(chat);
  wrap.appendChild(panel);

  const submit = (text) => {
    text = text.trim();
    if (!text) return;
    const um = { role: 'user', text };
    state.chat.push(um);
    log.appendChild(chatBubble(um));
    const ans = answer(text);
    state.chat.push(ans);
    log.appendChild(chatBubble(ans));
    log.scrollTop = log.scrollHeight;
    input.value = '';
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(input.value); });
  panel.querySelectorAll('.suggest').forEach((b) => b.addEventListener('click', () => submit(b.textContent)));
  setTimeout(() => { log.scrollTop = log.scrollHeight; }, 0);
  return wrap;
}
function chatBubble(m) {
  const b = el('div', { class: 'bubble ' + (m.role === 'user' ? 'user' : 'bot') });
  b.textContent = m.text;
  if (m.src) b.appendChild(el('span', { class: 'src', text: 'source: ' + m.src }));
  return b;
}

// The assistant's grounding: answer only from facts + live data; be honest otherwise.
function answer(q) {
  const ql = q.toLowerCase();
  const matched = state.fleet.find((p) => ql.includes(p.name.toLowerCase()) || ql.includes(p.id));
  // Intent keywords are matched with the project's own name removed, so its
  // letters can't satisfy an intent ("HealthFlow" contains "health", which
  // would otherwise route "Latency of HealthFlow" to the status answer).
  const qk = matched ? ql.split(matched.name.toLowerCase()).join(' ').split(matched.id).join(' ') : ql;
  const wants = (kw) => kw.some((k) => qk.includes(k));

  if (wants(['what is helm', 'about helm', 'what does helm']) || (ql.includes('helm') && wants(['what', 'about']))) {
    return { role: 'bot', text: 'Helm is this app: a cross-project ops & observability command center over the 7-project ecosystem. It probes each live service server-side for real up/down and latency, tracks performance and deploys, and exposes read-only fleet tools over MCP. It is built on the glass design system.', src: 'registry' };
  }
  if (wants(['how many', 'count']) && wants(['up', 'operational', 'online', 'down'])) {
    const post = fleetPosture();
    return { role: 'bot', text: `${post.up} of ${post.total} probed web services are currently operational. Zeno is a local desktop app and isn’t web-probed.`, src: 'live probe' };
  }
  if (wants(['which', 'what']) && ql.includes('mcp')) {
    const ex = state.fleet.filter((p) => p.mcp && p.mcp.exposes).map((p) => p.name);
    return { role: 'bot', text: `Exposing an MCP interface today: ${ex.join(', ')}. Zeno drives products over MCP as the agent orchestrator; the other products have MCP planned where it fits.`, src: 'registry' };
  }
  if (wants(['which', 'what', 'who']) && ql.includes('glass')) {
    return { role: 'bot', text: 'Every project is built on glass — it is the shared design-system foundation of the ecosystem, and Helm itself runs on it.', src: 'registry' };
  }
  if (matched) {
    if (wants(['up', 'down', 'status', 'health', 'online', 'working', 'live'])) {
      if (matched.status === 'local') return { role: 'bot', text: `${matched.name} is a local desktop app, so it has no public endpoint for Helm to probe. It shows as "local / not web-deployed".`, src: 'live probe' };
      const detail = matched.probes && matched.probes.length ? matched.probes.map((pr) => `${pr.name}: ${pr.status} (${pr.code || 'n/a'}, ${fmtMs(pr.latencyMs)})`).join('; ') : '';
      return { role: 'bot', text: `${matched.name} is ${STATUS_LABEL[matched.status]} — last latency ${fmtMs(matched.latencyMs)}, uptime ${fmtPct(matched.uptimePct)}. ${detail}`, src: 'live probe' };
    }
    if (wants(['latency', 'fast', 'slow', 'speed', 'p95'])) {
      return { role: 'bot', text: `${matched.name}: last latency ${fmtMs(matched.latencyMs)}, p95 ${fmtMs(matched.p95Ms)} over the sampled window.`, src: 'live probe' };
    }
    if (wants(['stack', 'built', 'tech', 'technology', 'framework'])) {
      return { role: 'bot', text: `${matched.name} is built with: ${matched.stack.join(', ')}. Deploy target: ${matched.deploy ? matched.deploy.platform : 'n/a'}.`, src: 'registry' };
    }
    if (wants(['url', 'link', 'live', 'where'])) {
      return { role: 'bot', text: matched.liveUrl ? `${matched.name} is live at ${matched.liveUrl}.` : `${matched.name} has no public URL (local desktop app).`, src: 'registry' };
    }
    // default: describe it
    return { role: 'bot', text: `${matched.name} — ${matched.blurb} Currently ${STATUS_LABEL[matched.status]}.`, src: 'registry' };
  }
  // Honest fallback
  return { role: 'bot', text: 'I don’t have a grounded answer for that. I can tell you each project’s status, latency, stack and live URL, how many services are up, which expose MCP, and how the ecosystem fits together. Try naming one of: ' + state.fleet.map((p) => p.name).join(', ') + '.', src: 'i don’t know' };
}

function viewSettings() {
  const wrap = el('div', { class: 'view' });
  wrap.appendChild(el('div', { html: sectionHead(
    'Settings',
    'Appearance is live. Integrations are placeholders — connect a token to enable real deploy history, cost and actions.',
    ''
  ) }));

  const appearance = el('div', { class: 'panel' });
  const curTheme = document.documentElement.getAttribute('data-theme') || 'system';
  const flat = document.documentElement.getAttribute('data-flat') === '1';
  appearance.innerHTML = `<h3>${icon('sun')} Appearance</h3>
    <div class="setting-row">
      <div class="lab"><b>Theme</b><span>Dark-first. System follows your OS.</span></div>
      <div class="seg" id="seg-theme">
        <button data-theme="system" aria-pressed="${curTheme === 'system'}">System</button>
        <button data-theme="light" aria-pressed="${curTheme === 'light'}">Light</button>
        <button data-theme="dark" aria-pressed="${curTheme === 'dark'}">Dark</button>
      </div>
    </div>
    <div class="setting-row">
      <div class="lab"><b>Reduce transparency</b><span>Turns the glass panes into opaque surfaces (accessibility).</span></div>
      <div class="seg" id="seg-flat">
        <button data-flat="0" aria-pressed="${!flat}">Glass</button>
        <button data-flat="1" aria-pressed="${flat}">Flat</button>
      </div>
    </div>`;
  wrap.appendChild(appearance);

  const integ = el('div', { class: 'panel', style: 'margin-top:var(--sp-4)' });
  integ.innerHTML = `<h3>${icon('gear')} Integrations</h3>
    <p class="panel-note">Not connected. These are the wiring points that would turn SAMPLE panels into real data.</p>
    <div class="stack-v">
      <div class="integration"><div class="ico">${icon('fly')}</div><div style="flex:1"><b>fly.io</b><div class="muted" style="font-size:var(--fs-0)">Connect a deploy token to enable real deploy history, machine status, cost & resources, and live deploy/rollback/restart.</div></div><span class="chip">Not connected</span></div>
      <div class="integration"><div class="ico">${icon('github')}</div><div style="flex:1"><b>GitHub</b><div class="muted" style="font-size:var(--fs-0)">Connect to pull real release history and commit-level deploy freshness per repo.</div></div><span class="chip">Not connected</span></div>
      <div class="integration"><div class="ico">${icon('pulse')}</div><div style="flex:1"><b>RUM / Web Vitals</b><div class="muted" style="font-size:var(--fs-0)">Post real LCP/INP/CLS from the <code>web-vitals</code> beacon; Vantage analytics is the first candidate source.</div></div><span class="chip">Not connected</span></div>
    </div>`;
  wrap.appendChild(integ);

  const about = el('div', { class: 'panel', style: 'margin-top:var(--sp-4)' });
  about.innerHTML = `<h3>${icon('spark')} About Helm</h3>
    <p class="panel-note">Fleet command center for the ecosystem. Read-only fleet tools are published at <a class="linkA" href="/mcp/manifest.json" target="_blank" rel="noopener">/mcp/manifest.json</a>. Health APIs: <a class="linkA" href="/api/health" target="_blank" rel="noopener">/api/health</a> · <a class="linkA" href="/api/fleet" target="_blank" rel="noopener">/api/fleet</a>.</p>`;
  wrap.appendChild(about);

  // wire appearance controls
  appearance.querySelector('#seg-theme').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setTheme(b.dataset.theme);
    appearance.querySelectorAll('#seg-theme button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.theme === b.dataset.theme));
  });
  appearance.querySelector('#seg-flat').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setFlat(b.dataset.flat === '1');
    appearance.querySelectorAll('#seg-flat button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.flat === b.dataset.flat));
  });
  return wrap;
}

const VIEWS = {
  overview: viewOverview, performance: viewPerformance, health: viewHealth,
  deploys: viewDeploys, alerts: viewAlerts, map: viewMap, status: viewStatus,
  assistant: viewAssistant, settings: viewSettings
};

/* ---------------------------------------------------------------------------
   7. Theme controls
   --------------------------------------------------------------------------- */
function setTheme(mode) {
  if (mode === 'system') { document.documentElement.removeAttribute('data-theme'); store.set('theme', 'system'); }
  else { document.documentElement.setAttribute('data-theme', mode); store.set('theme', mode); }
}
function setFlat(on) {
  if (on) { document.documentElement.setAttribute('data-flat', '1'); store.set('flat', '1'); }
  else { document.documentElement.removeAttribute('data-flat'); store.set('flat', '0'); }
}
function cycleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  setTheme(cur === 'dark' ? 'light' : cur === 'light' ? 'system' : 'dark');
}

/* ---------------------------------------------------------------------------
   8. Actions (dry run) + toasts
   --------------------------------------------------------------------------- */
function toast({ title, cmd, kind }) {
  const region = $('#toasts');
  const t = el('div', { class: 'toast', style: kind ? `border-left-color:var(--${kind})` : '', role: 'status' });
  t.innerHTML = `<div class="t-body"><div class="t-title">${title}</div>${cmd ? `<div class="t-cmd">${cmd}</div>` : ''}</div>`;
  region.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 320); }, 6000);
}
async function runAction(projectId, action) {
  try {
    const res = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId, action }) });
    const data = await res.json();
    toast({ title: `Dry run · ${action} ${projById(projectId)?.name || projectId} — nothing was executed`, cmd: data.wouldRun, kind: 'info' });
  } catch (err) {
    toast({ title: 'Action failed', cmd: String(err), kind: 'bad' });
  }
}

/* ---------------------------------------------------------------------------
   9. ⌘K command palette
   --------------------------------------------------------------------------- */
let paletteOpen = false;
function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;
  const scrim = el('div', { class: 'palette-scrim' });
  const box = el('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' });
  box.innerHTML = `<div class="palette-input">${icon('search')}<input type="text" placeholder="Jump to a section, project, or run an action…" aria-label="Command palette search" /></div><div class="palette-list" id="p-list"></div>`;
  scrim.appendChild(box);
  $('#overlay-root').appendChild(scrim);
  const input = box.querySelector('input');
  const list = box.querySelector('#p-list');
  let active = 0;

  const commands = buildCommands();
  function draw(filter = '') {
    const f = filter.toLowerCase();
    const items = commands.filter((c) => !f || c.label.toLowerCase().includes(f) || (c.keywords || '').toLowerCase().includes(f));
    active = Math.min(active, Math.max(0, items.length - 1));
    if (!items.length) { list.innerHTML = `<div class="palette-empty">No matches</div>`; return; }
    let html = ''; let group = '';
    items.forEach((c, i) => {
      if (c.group !== group) { group = c.group; html += `<div class="palette-group">${group}</div>`; }
      html += `<button class="palette-item" data-i="${i}" data-active="${i === active}"><span class="pi-ico">${icon(c.icon)}</span><span>${c.label}</span>${c.sub ? `<span class="pi-sub">${c.sub}</span>` : ''}</button>`;
    });
    list.innerHTML = html;
    list._items = items;
    list.querySelectorAll('.palette-item').forEach((btn) => {
      btn.addEventListener('click', () => { close(); items[+btn.dataset.i].run(); });
      btn.addEventListener('mousemove', () => { active = +btn.dataset.i; markActive(); });
    });
  }
  function markActive() { list.querySelectorAll('.palette-item').forEach((b, i) => b.setAttribute('data-active', i === active)); }
  function close() { paletteOpen = false; scrim.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) {
    if (e.key === 'Escape') { close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min((list._items?.length || 1) - 1, active + 1); markActive(); scrollActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); markActive(); scrollActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = list._items?.[active]; if (it) { close(); it.run(); } }
  }
  function scrollActive() { list.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }
  input.addEventListener('input', () => { active = 0; draw(input.value); });
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  draw('');
  setTimeout(() => input.focus(), 0);
}
function buildCommands() {
  const cmds = [];
  for (const s of SECTIONS) cmds.push({ group: 'Go to', icon: s.icon, label: s.title, sub: s.sub, keywords: s.sub, run: () => (location.hash = '#/' + s.id) });
  for (const p of state.fleet) {
    cmds.push({ group: 'Projects', icon: 'heart', label: p.name, sub: STATUS_LABEL[p.status], keywords: p.tagline + ' ' + p.stack.join(' '), run: () => (location.hash = '#/health/' + p.id) });
    if (p.liveUrl) cmds.push({ group: 'Open live', icon: 'external', label: 'Open ' + p.name, sub: p.liveUrl.replace(/^https?:\/\//, ''), keywords: 'url live open', run: () => window.open(p.liveUrl, '_blank', 'noopener') });
  }
  for (const p of state.fleet.filter((x) => x.deploy && x.deploy.target === 'fly')) {
    for (const act of ['deploy', 'rollback', 'restart', 'logs']) {
      cmds.push({ group: 'Actions (dry run)', icon: act === 'deploy' ? 'play' : act === 'rollback' ? 'rewind' : act === 'restart' ? 'restart' : 'logs', label: `${act[0].toUpperCase() + act.slice(1)} ${p.name}`, sub: 'dry run', keywords: 'fly ' + act, run: () => runAction(p.id, act) });
    }
  }
  cmds.push({ group: 'Appearance', icon: 'contrast', label: 'Toggle theme', sub: 'dark / light / system', keywords: 'theme dark light', run: cycleTheme });
  cmds.push({ group: 'Appearance', icon: 'refresh', label: 'Refresh probes now', sub: '', keywords: 'reload refresh', run: () => refresh(true) });
  return cmds;
}

/* ---------------------------------------------------------------------------
   10. Shell rendering + router
   --------------------------------------------------------------------------- */
function renderShell() {
  const appEl = $('#app');
  appEl.innerHTML = '';
  // rail
  const rail = el('nav', { class: 'rail', 'aria-label': 'Sections' });
  rail.appendChild(el('a', { class: 'rail-logo', href: '#/overview', 'aria-label': 'Helm home', html: reticle(30) }));
  const railItems = SECTIONS.filter((s) => s.id !== 'settings');
  for (const s of railItems) rail.appendChild(railItem(s));
  rail.appendChild(el('div', { class: 'rail-spacer' }));
  rail.appendChild(railItem(SECTIONS.find((s) => s.id === 'settings')));
  appEl.appendChild(rail);

  // content column
  const col = el('div', { class: 'content-col' });
  col.appendChild(topbar());
  const main = el('main', { class: 'main', id: 'main' });
  col.appendChild(main);
  appEl.appendChild(col);
  appEl.setAttribute('aria-busy', 'false');
}
function railItem(s) {
  const a = el('a', { class: 'rail-item', href: '#/' + s.id, 'aria-label': s.title, html: icon(s.icon) + `<span class="rail-tip">${s.title}</span>` });
  if (state.route === s.id) a.setAttribute('aria-current', 'page');
  return a;
}
function topbar() {
  const sec = SECTIONS.find((s) => s.id === state.route) || SECTIONS[0];
  const post = fleetPosture();
  const bar = el('header', { class: 'topbar' });
  const proj = state.project ? projById(state.project) : null;
  bar.innerHTML = `
    <div class="topbar-title">
      <span class="crumb">Helm / ${sec.title}${proj ? ' / ' + proj.name : ''}</span>
      <h1>${sec.title}</h1>
    </div>
    <div class="topbar-spacer"></div>
    <div class="topbar-tools">
      <span class="fleet-pill" data-state="${post.state}"><span class="dot"></span><span class="lbl">${post.up}/${post.total} up</span></span>
      <button class="kbtn" id="k-refresh" title="Refresh probes now">${icon('refresh')}</button>
      <button class="kbtn" id="k-theme" title="Toggle theme">${icon('contrast')}</button>
      <button class="kbtn" id="k-open"><span>Search</span> <kbd>${navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'} K</kbd></button>
    </div>`;
  bar.querySelector('#k-open').addEventListener('click', openPalette);
  bar.querySelector('#k-theme').addEventListener('click', cycleTheme);
  bar.querySelector('#k-refresh').addEventListener('click', () => refresh(true));
  return bar;
}

function renderMain(animate = true) {
  const main = $('#main');
  if (!main) return;
  const fn = VIEWS[state.route] || viewOverview;
  main.innerHTML = '';
  const view = fn();
  if (!animate) view.style.animation = 'none';
  main.appendChild(view);
  // inline refresh button (health view)
  const ri = $('#refresh-inline');
  if (ri) ri.addEventListener('click', () => refresh(true));
  // focus a focused project's panel
  if (state.route === 'health' && state.project) {
    const target = document.getElementById('h-' + state.project);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateChrome() {
  document.querySelectorAll('.rail-item').forEach((a) => {
    const id = a.getAttribute('href').replace('#/', '');
    if (id === state.route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const col = $('.content-col');
  if (col) { const old = col.querySelector('.topbar'); if (old) old.replaceWith(topbar()); }
}

function parseRoute() {
  const raw = (location.hash || '#/overview').replace(/^#\//, '');
  const [id, project] = raw.split('/');
  state.route = SECTION_IDS.has(id) ? id : 'overview';
  state.project = project && projById(project) ? project : null;
}
function onRoute() {
  const prev = state.route;
  parseRoute();
  updateChrome();
  // A new section starts at its heading. Without this the page kept the previous
  // section's scroll offset, landing mid-view under the sticky top bar. A project
  // focus inside the same section (#/health/<id>) is handled by renderMain.
  if (prev !== state.route) window.scrollTo(0, 0);
  renderMain(true);
}

/* ---------------------------------------------------------------------------
   11. Data + boot
   --------------------------------------------------------------------------- */
const DATA_VIEWS = new Set(['overview', 'performance', 'health', 'deploys', 'alerts', 'map', 'status']);
async function refresh(force = false) {
  try {
    const data = await api('/api/fleet');
    state.fleet = data.projects;
    state.generatedAt = data.generatedAt;
    state.loaded = true;
    // Only re-render data-driven views on poll; leave assistant/settings alone.
    if (DATA_VIEWS.has(state.route)) renderMain(false);
    updateChrome();
  } catch (err) {
    if (force) toast({ title: 'Could not reach Helm API', cmd: String(err), kind: 'bad' });
  }
}

async function boot() {
  parseRoute();
  renderShell();
  // show skeleton
  $('#main').innerHTML = `<div class="view"><div class="kpi-row">${'<div class="kpi"><div class="skel" style="height:14px;width:60%"></div><div class="skel" style="height:28px;width:40%;margin-top:8px"></div></div>'.repeat(4)}</div><div class="fleet-grid">${'<div class="proj-card"><div class="skel" style="height:120px"></div></div>'.repeat(6)}</div></div>`;

  try {
    const [fleet, eco, cfg] = await Promise.all([api('/api/fleet'), api('/api/ecosystem').catch(() => null), api('/api/config').catch(() => null)]);
    state.fleet = fleet.projects; state.generatedAt = fleet.generatedAt; state.ecosystem = eco; state.config = cfg; state.loaded = true;
  } catch (err) {
    $('#main').innerHTML = `<div class="view"><div class="panel"><h3>${icon('alert')} Could not load the fleet</h3><p class="panel-note">${String(err)}</p></div></div>`;
    return;
  }
  parseRoute();
  updateChrome();
  renderMain(true);

  // poll every probe interval (default 30s)
  const period = state.config?.probe?.REFRESH_MS || 30000;
  setInterval(() => refresh(false), period);

  window.addEventListener('hashchange', onRoute);
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); openPalette(); }
  });
}

boot();
