'use strict';
const A = require('./_assert.js');
const { makeAgentControlHttp } = require('../sidecar/control/agent-http.js');

const roster = new Map([
  ['cmd', { name: 'Commander', role: 'orchestrator', system: 'hidden' }],
  ['worker', { name: 'Worker', orgRole: 'worker', parentAgentId: 'cmd' }]
]);
const replies = [];
const api = makeAgentControlHttp({
  roster: () => roster,
  statusByAgent: id => id === 'cmd' ? 'running' : null,
  respondJson(res, code, body) { replies.push({ code, body }); return { code, body }; }
});

let out = api.serve({ method: 'GET', url: '/api/control/agents' }, {});
A.eq(out.code, 200, 'GET returns organization telemetry');
A.eq(out.body.ok, true, 'GET response is successful');
A.eq(out.body.organization.total, 2, 'authoritative roster count is returned');
A.eq(out.body.organization.agents[0].orgRole, 'commander', 'role projection is applied');
A.ok(!JSON.stringify(out.body).includes('hidden'), 'system prompt is not exposed');

out = api.serve({ method: 'POST', url: '/api/control/agents' }, {});
A.eq(out.code, 405, 'POST is rejected on read-only endpoint');
A.eq(out.body.error, 'read-only endpoint', 'mutation refusal is explicit');

out = api.serve({ method: 'GET', url: '/api/control/other' }, {});
A.eq(out.code, 404, 'unrelated route is not captured');

const broken = makeAgentControlHttp({
  roster() { throw new Error('roster unavailable'); },
  respondJson(res, code, body) { return { code, body }; }
});
out = broken.serve({ method: 'GET', url: '/api/control/agents' }, {});
A.eq(out.code, 500, 'roster read failure is represented honestly');
A.ok(String(out.body.error).includes('roster unavailable'), 'read failure remains diagnosable');

A.report('control-agent-http.test');
