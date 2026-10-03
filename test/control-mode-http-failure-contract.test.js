/* node test/control-mode-http-failure-contract.test.js */
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
function run(factory, endpoint, good, failingKey) {
  const calls = [];
  let touched = 0;
  const opts = Object.assign({}, good, { respondJson: responder(calls) });
  opts[failingKey] = () => { touched++; throw new Error('authoritative source unavailable'); };
  const http = factory(opts);

  http.serve({ method: 'POST', url: endpoint }, {});
  A.eq(calls.at(-1).code, 405, `${endpoint} rejects mutation methods`);
  A.eq(calls.at(-1).body.ok, false, `${endpoint} mutation rejection is explicit`);
  A.eq(touched, 0, `${endpoint} rejects mutation before reading authoritative state`);

  http.serve({ method: 'GET', url: '/api/control/not-this-surface' }, {});
  A.eq(calls.at(-1).code, 404, `${endpoint} rejects unrelated paths`);
  A.eq(touched, 0, `${endpoint} rejects unrelated paths before reading authoritative state`);

  http.serve({ method: 'GET', url: endpoint }, {});
  A.eq(calls.at(-1).code, 500, `${endpoint} reports authoritative source failure`);
  A.eq(calls.at(-1).body.ok, false, `${endpoint} never turns source failure into an empty success`);
  A.ok(String(calls.at(-1).body.error || '').includes('authoritative source unavailable'), `${endpoint} preserves a diagnosable source failure`);
  A.eq(touched, 1, `${endpoint} reads the failing source exactly once for the failed request`);
}

run(makeAgentControlHttp, '/api/control/agents', {
  roster: () => new Map(), statusByAgent: null
}, 'roster');

run(makeMemoryControlHttp, '/api/control/memory?perAgent=12', {
  roster: () => new Map(), recordsForAgent: () => []
}, 'roster');

run(makeApprovalControlHttp, '/api/control/approvals', {
  grantSnapshot: () => ({ grants: [] }), consentSnapshot: () => ({}), pending: () => new Map()
}, 'grantSnapshot');

run(makeActionControlHttp, '/api/control/actions?runs=100&limit=100', {
  recoverPage: () => ({ rows: [] })
}, 'recoverPage');

run(makeCostControlHttp, '/api/control/costs', {
  ledgerRows: () => [], roster: () => new Map(), budgetStatus: () => ({}), caps: () => ({})
}, 'ledgerRows');

run(makeProviderControlHttp, '/api/control/providers', {
  profiles: () => [], rateLimits: () => []
}, 'profiles');

// Memory has one intentional partial-failure exception: a per-agent memory store can be unavailable
// while the roster remains authoritative. That state must be projected as unknown, not as zero records.
{
  const calls = [];
  const http = makeMemoryControlHttp({
    roster: () => new Map([['agent-1', { name: 'Agent 1' }]]),
    recordsForAgent: () => { throw new Error('agent memory store offline'); },
    respondJson: responder(calls)
  });
  http.serve({ method: 'GET', url: '/api/control/memory?perAgent=12' }, {});
  const last = calls.at(-1);
  A.eq(last.code, 200, 'memory keeps roster overview available when one agent store is unavailable');
  A.eq(last.body.overview.agents[0].known, false, 'partial memory failure remains explicitly unknown');
  A.eq(last.body.overview.agents[0].total, null, 'partial memory failure is not fabricated as zero records');
}

A.report('control-mode-http-failure-contract.test');
