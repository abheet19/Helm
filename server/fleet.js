// =============================================================================
// Helm — fleet.js
// The project registry. The single source of truth for the seven-project
// ecosystem Helm watches. Everything here is hand-verified metadata (names,
// stacks, live URLs, accents, relationships); NOTHING here is a live metric.
// Live metrics are attached at request time by probe.js.
//
// Honesty rule (the Zeno ethos): every field in this file is a static fact
// about the fleet. Up/down, latency and uptime are computed from real probes
// (probe.js). Web-vitals, error rate and cost are SAMPLE and labelled as such
// in the API payload and the UI.
// =============================================================================

// Accent hexes are each project's brand mark colour, surfaced per-card in the UI.
export const FLEET = [
  {
    id: 'zeno',
    name: 'Zeno',
    tagline: 'Local-first agent orchestrator',
    blurb:
      'A local-first coding-agent orchestrator: a command center that drives Forge sub-agents over open and frontier models. Runs as a desktop app, so it has no public web endpoint to probe.',
    accent: '#C81E33',
    glassTheme: 'zeno',
    stack: ['Electron', 'TypeScript', 'React', 'Node', 'glass'],
    role: 'Agent command center',
    liveUrl: null,
    repoUrl: 'https://github.com/abheet19',
    deploy: { target: 'local', platform: 'desktop', region: null, note: 'Local desktop app — not web-deployed' },
    usesGlass: true,
    mcp: { exposes: true, note: 'Drives other products over their MCP interfaces' },
    // No probes: Zeno is a local desktop app. Status is reported as "local".
    probes: [],
    // SAMPLE deploy history — wiring-ready (would come from the release channel).
    releases: [
      { version: 'v0.9.0', when: '2026-09-14', kind: 'build', note: 'Devin-pivot: open-model support + command center', sample: true },
      { version: 'v0.8.1', when: '2026-09-05', kind: 'build', note: 'Gate 1+2 approved', sample: true }
    ]
  },
  {
    id: 'weft',
    name: 'Weft',
    tagline: 'Real-time CRDT editor',
    blurb:
      'A collaborative document editor built on CRDTs: conflict-free offline edits that merge deterministically when peers reconnect. Deployed on fly.io.',
    accent: '#2ED3C6',
    glassTheme: 'weft',
    stack: ['TypeScript', 'CRDT', 'WebSocket', 'Node', 'glass'],
    role: 'Product · collaborative editor',
    liveUrl: 'https://weft-abheet.fly.dev',
    repoUrl: 'https://github.com/abheet19',
    deploy: { target: 'fly', platform: 'fly.io', region: 'sin', app: 'weft-abheet' },
    usesGlass: true,
    mcp: { exposes: false, note: 'MCP planned where it fits' },
    probes: [{ name: 'app', url: 'https://weft-abheet.fly.dev/', method: 'GET' }],
    releases: [
      { version: 'gate-3', when: '2026-09-14', kind: 'build', note: 'Gate 3 build in progress', sample: true },
      { version: 'gate-2', when: '2026-09-05', kind: 'deploy', note: 'Gates 1+2 approved', sample: true }
    ]
  },
  {
    id: 'vantage',
    name: 'Vantage',
    tagline: 'Analytics workspace + MCP',
    blurb:
      'A product-analytics workspace that also exposes an MCP server, so Claude and Zeno can query metrics and drive it programmatically. The reference MCP surface of the ecosystem. Deployed on fly.io.',
    accent: '#F2B23E',
    glassTheme: 'vantage',
    stack: ['TypeScript', 'MCP', 'Node', 'Postgres', 'glass'],
    role: 'Product · analytics + MCP',
    liveUrl: 'https://vantage-abheet.fly.dev',
    repoUrl: 'https://github.com/abheet19',
    deploy: { target: 'fly', platform: 'fly.io', region: 'sin', app: 'vantage-abheet' },
    usesGlass: true,
    mcp: { exposes: true, note: 'Reference MCP server: fleet-style metrics tools' },
    probes: [{ name: 'health', url: 'https://vantage-abheet.fly.dev/health', method: 'GET' }],
    releases: [
      { version: 'gate-3', when: '2026-09-14', kind: 'build', note: 'Gate 3 build in progress', sample: true },
      { version: 'gate-2', when: '2026-09-05', kind: 'deploy', note: 'Gates 1+2 approved', sample: true }
    ]
  },
  {
    id: 'glass',
    name: 'glass',
    tagline: 'The shared design system',
    blurb:
      'The framework-neutral CSS design system every other project is built on: semantic OKLCH tokens, eight product themes, and executable contrast/accessibility contracts. The visual foundation of the ecosystem — Helm itself runs on it. Published on GitHub Pages.',
    accent: '#45C7BE',
    glassTheme: 'health',
    stack: ['CSS', 'OKLCH', 'Tailwind adapter', 'GitHub Pages'],
    role: 'Foundation · design system',
    liveUrl: 'https://abheet19.github.io/glass/',
    repoUrl: 'https://github.com/abheet19/glass',
    deploy: { target: 'pages', platform: 'GitHub Pages', region: null, note: 'Exact-SHA Pages release' },
    usesGlass: true,
    foundation: true,
    mcp: { exposes: false, note: 'Design system — no runtime interface' },
    probes: [{ name: 'pages', url: 'https://abheet19.github.io/glass/', method: 'GET' }],
    releases: [
      { version: 'rc-2026-09-10', when: '2026-09-10', kind: 'deploy', note: 'Release candidate to Pages', sample: true }
    ]
  },
  {
    id: 'healthflow',
    name: 'HealthFlow',
    tagline: 'Clinical workflow app',
    blurb:
      'A clinical-workflow application with a separate API tier. Two deploys — the web front-end and the API — so Helm probes both and the project is only "up" when both answer. Deployed on fly.io.',
    accent: '#3ECF8E',
    glassTheme: 'health',
    stack: ['TypeScript', 'React', 'MUI', 'Node API', 'glass'],
    role: 'Product · clinical workflow',
    liveUrl: 'https://healthflow-abheet19.fly.dev',
    repoUrl: 'https://github.com/abheet19',
    deploy: { target: 'fly', platform: 'fly.io', region: 'sin', app: 'healthflow-abheet19' },
    usesGlass: true,
    mcp: { exposes: false, note: 'MCP planned where it fits' },
    probes: [
      { name: 'web', url: 'https://healthflow-abheet19.fly.dev/', method: 'GET' },
      { name: 'api', url: 'https://healthflow-api-abheet19.fly.dev/health', method: 'GET' }
    ],
    releases: [
      { version: 'live', when: '2026-09-12', kind: 'deploy', note: 'Web + API deployed', sample: true }
    ]
  },
  {
    id: 'textify',
    name: 'Textify',
    tagline: 'Document RAG + summariser',
    blurb:
      'A document retrieval-augmented-generation tool: upload documents, ask grounded questions, get cited summaries. Deployed on fly.io (machine cold-starts on first hit).',
    accent: '#E0954D',
    glassTheme: 'textify',
    stack: ['Python', 'RAG', 'Vector DB', 'FastAPI', 'glass'],
    role: 'Product · document RAG',
    liveUrl: 'https://textify-abheet19.fly.dev',
    repoUrl: 'https://github.com/abheet19',
    deploy: { target: 'fly', platform: 'fly.io', region: 'sin', app: 'textify-abheet19' },
    usesGlass: true,
    mcp: { exposes: false, note: 'MCP planned where it fits' },
    probes: [{ name: 'health', url: 'https://textify-abheet19.fly.dev/health', method: 'GET' }],
    releases: [
      { version: 'live', when: '2026-09-11', kind: 'deploy', note: 'Deployed on fly.io', sample: true }
    ]
  },
  {
    id: 'shieldai',
    name: 'ShieldAI',
    tagline: 'Privacy-preserving evaluation',
    blurb:
      'Scores inputs under homomorphic encryption — the raw values never leave the browser unencrypted. Paillier-encrypted weighted-sum risk scoring, not ML inference. Deployed on fly.io (machine cold-starts on first hit).',
    accent: '#4F8EF7',
    glassTheme: 'shield',
    stack: ['Python', 'Flask', 'Vanilla JS', 'Paillier'],
    role: 'Product · privacy evaluation',
    liveUrl: 'https://shieldai-abheet19.fly.dev',
    repoUrl: 'https://github.com/abheet19',
    deploy: { target: 'fly', platform: 'fly.io', region: 'sin', app: 'shieldai-abheet19' },
    usesGlass: true,
    mcp: { exposes: false, note: 'MCP planned where it fits' },
    probes: [{ name: 'app', url: 'https://shieldai-abheet19.fly.dev/', method: 'GET' }],
    releases: [
      { version: 'live', when: '2026-09-10', kind: 'deploy', note: 'Deployed on fly.io', sample: true }
    ]
  }
];

// A flat lookup for convenience.
export const FLEET_BY_ID = Object.fromEntries(FLEET.map((p) => [p.id, p]));

// The ecosystem graph edges, for the service/stack map. Honest relationships:
//  - every product is built ON glass (the foundation);
//  - Zeno orchestrates the products that expose MCP;
//  - Helm observes/operates every project.
export const ECOSYSTEM = {
  foundation: 'glass',
  edges: [
    // built-on-glass
    ...['zeno', 'weft', 'vantage', 'healthflow', 'textify', 'shieldai'].map((id) => ({
      from: id,
      to: 'glass',
      kind: 'built-on'
    })),
    // MCP connective tissue (exposers Zeno/Helm can drive)
    { from: 'zeno', to: 'vantage', kind: 'mcp' }
  ]
};
