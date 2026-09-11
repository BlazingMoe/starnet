/* node test/control-mode-e2e-contract.test.js */
'use strict';
const A = require('./_assert.js');
const { makeAgentControlHttp } = require('../sidecar/control/agent-http.js');
const { makeMemoryControlHttp } = require('../sidecar/control/memory-http.js');
const { makeApprovalControlHttp } = require('../sidecar/control/approval-http.js');
const { makeActionControlHttp } = require('../sidecar/control/action-http.js');
const { makeCostControlHttp } = require('../sidecar/control/cost-http.js');
const { makeProviderControlHttp } = require('../sidecar/control/provider-http.js');

function responder(calls) {
  return (_res, code, body) => { calls.push({ code, body }); return body; };
}
function keysDeep(value, out) {
  out = out || new Set();
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) { for (const item of value) keysDeep(item, out); return out; }
  for (const key of Object.keys(value)) { out.add(key); keysDeep(value[key], out); }
  return out;
}

const surfaces = [
  {
    name: 'agents', endpoint: '/api/control/agents', schema: 'moe.control-agents.v1', projection: 'organization',
    factory: makeAgentControlHttp,
    opts: { roster: () => new Map([['agent-1', { name: 'Agent 1', status: 'idle', provider: 'openai', model: 'example' }]]) }
  },
  {
    name: 'memory', endpoint: '/api/control/memory?perAgent=12', schema: 'moe.control-memory.v1', projection: 'overview',
    factory: makeMemoryControlHttp,
    opts: { roster: () => new Map([['agent-1', { name: 'Agent 1' }]]), recordsForAgent: () => [] }
  },
  {
    name: 'approvals', endpoint: '/api/control/approvals', schema: 'moe.control-approvals.v1', projection: 'overview',
    factory: makeApprovalControlHttp,
    opts: {
      grantSnapshot: () => ({ grants: [], grantable: [], meta: {} }),
      consentSnapshot: () => ({ session: {} }),
      pending: () => new Map()
    }
  },
  {
    name: 'actions', endpoint: '/api/control/actions?runs=100&limit=100', schema: 'moe.control-actions.v1', projection: 'trace',
    factory: makeActionControlHttp,
    opts: { recoverPage: () => ({ rows: [], total: 0, offset: 0, nextOffset: null, hasMore: false }) }
  },
  {
    name: 'costs', endpoint: '/api/control/costs', schema: 'moe.control-costs.v1', projection: 'overview',
    factory: makeCostControlHttp,
    opts: { ledgerRows: () => [], roster: () => new Map(), budgetStatus: () => ({}), caps: () => ({}) }
  },
  {
    name: 'providers', endpoint: '/api/control/providers', schema: 'moe.control-providers.v1', projection: 'overview',
    factory: makeProviderControlHttp,
    opts: {
      profiles: () => [{ id: 'openai', name: 'OpenAI', authType: 'api-key', keyRequired: true }],
      rateLimits: () => []
    }
  }
];

const forbiddenKeys = new Set([
  'argsRaw', 'resultRaw', 'replayFingerprint', 'systemPrompt', 'apiKey', 'secret',
  'healthScore', 'credentialValid', 'latencyMs', 'uptime', 'successRate'
]);

for (const surface of surfaces) {
  const calls = [];
  const http = surface.factory(Object.assign({}, surface.opts, { respondJson: responder(calls) }));

  http.serve({ method: 'GET', url: surface.endpoint }, {});
  let last = calls.at(-1);
  A.eq(last.code, 200, `${surface.name} GET succeeds`);
  A.eq(last.body.ok, true, `${surface.name} GET returns an explicit success envelope`);
  A.ok(last.body[surface.projection] && typeof last.body[surface.projection] === 'object', `${surface.name} GET returns its projection object`);
  A.eq(last.body[surface.projection].schemaVersion, surface.schema, `${surface.name} GET returns the expected projection schema`);

  const keys = keysDeep(last.body);
  for (const key of forbiddenKeys) A.ok(!keys.has(key), `${surface.name} success envelope does not expose forbidden key ${key}`);

  http.serve({ method: 'HEAD', url: surface.endpoint }, {});
  last = calls.at(-1);
  A.eq(last.code, 200, `${surface.name} HEAD follows the read-only success path`);
  A.eq(last.body.ok, true, `${surface.name} HEAD does not mutate or downgrade the projection`);
  A.eq(last.body[surface.projection].schemaVersion, surface.schema, `${surface.name} HEAD preserves the projection schema`);

  http.serve({ method: 'PATCH', url: surface.endpoint }, {});
  last = calls.at(-1);
  A.eq(last.code, 405, `${surface.name} rejects mutation at the aggregate E2E boundary`);
  A.eq(last.body.ok, false, `${surface.name} mutation rejection is explicit`);
}

A.report('control-mode-e2e-contract.test');
