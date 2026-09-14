// =============================================================================
// Helm — mcp.js
// An honest, static MCP manifest describing the READ-ONLY fleet tools Helm
// would expose to Claude / Zeno Command. This is a description document, not a
// running MCP transport: the tools listed here map 1:1 to Helm's real read-only
// HTTP endpoints. Action tools (deploy/rollback/restart) are intentionally NOT
// exposed over MCP — Helm never performs them; see server/index.js.
// =============================================================================

export function mcpManifest(origin) {
  return {
    name: 'helm-fleet',
    version: '1.0.0',
    description:
      'Read-only observability tools over Abheet\'s 7-project ecosystem (Zeno, Weft, Vantage, glass, HealthFlow, Textify, ShieldAI). Backed by real server-side health probes.',
    homepage: origin,
    honesty:
      'Read-only. Every tool maps to a real Helm HTTP endpoint that returns real probe data (up/down, latency, uptime, p95) plus clearly-labelled SAMPLE metrics. No deploy/rollback/restart tool is exposed here — Helm does not perform those actions.',
    transport: {
      type: 'http',
      note: 'Descriptive manifest. Call the mapped endpoints directly; a stdio/SSE MCP shim can wrap these read-only endpoints unchanged.'
    },
    tools: [
      {
        name: 'list_fleet',
        description: 'List every project in the ecosystem with its stack, role, live URL and relationships.',
        readOnly: true,
        endpoint: { method: 'GET', path: '/api/fleet' },
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      },
      {
        name: 'get_fleet_health',
        description: 'Real server-side health for every project: up/down, HTTP code, measured latency, uptime %, p50/p95.',
        readOnly: true,
        endpoint: { method: 'GET', path: '/api/health' },
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      },
      {
        name: 'get_project_health',
        description: 'Real health detail for a single project by id.',
        readOnly: true,
        endpoint: { method: 'GET', path: '/api/health/:id' },
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', enum: ['zeno', 'weft', 'vantage', 'glass', 'healthflow', 'textify', 'shieldai'] } },
          required: ['id'],
          additionalProperties: false
        }
      },
      {
        name: 'get_ecosystem_map',
        description: 'The service/stack graph: which projects are built on glass and which expose MCP.',
        readOnly: true,
        endpoint: { method: 'GET', path: '/api/ecosystem' },
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      }
    ]
  };
}
