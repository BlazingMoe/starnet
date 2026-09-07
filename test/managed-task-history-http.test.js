/* node test/managed-task-history-http.test.js */
'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryHttp, clampLimit } = require('../sidecar/orchestration/task-history-http.js');

const rows = [
  { taskId: 't1', leadAgentId: 'lead', workerAgentId: 'worker', status: 'accepted', accepted: true },
  { taskId: 't2', leadAgentId: 'lead', workerAgentId: 'worker2', status: 'rejected', accepted: false }
];
const store = {
  list(filter, options) {
    let out = rows.slice();
    if (filter.taskId) out = out.filter(x => x.taskId === filter.taskId);
    if (filter.agentId) out = out.filter(x => x.leadAgentId === filter.agentId || x.workerAgentId === filter.agentId);
    if (filter.status) out = out.filter(x => x.status === filter.status);
    return out.slice(0, options.limit);
  },
  summary() { return { total: 2, accepted: 1, rejected: 1, acceptanceRate: 0.5 }; }
};
const sent = [];
const api = makeTaskHistoryHttp({ store, respondJson(res, code, body) { sent.push({ code, body }); return body; } });
function hit(url) { sent.length = 0; api.serve({ url }, {}); return sent[0]; }

A.eq(clampLimit(null), 100, 'missing limit defaults to 100');
A.eq(clampLimit('99999'), 500, 'limit is hard capped');
A.eq(clampLimit('-1'), 100, 'invalid negative limit uses safe default');

let r = hit('/api/managed-tasks?agent=worker&limit=10');
A.eq(r.code, 200, 'list route returns 200');
A.eq(r.body.tasks.map(x => x.taskId), ['t1'], 'agent filter is applied');
r = hit('/api/managed-tasks?status=accepted');
A.eq(r.body.tasks.map(x => x.taskId), ['t1'], 'status filter is applied');
r = hit('/api/managed-tasks?status=made-up');
A.eq(r.code, 400, 'unknown status fails closed');
r = hit('/api/managed-tasks/summary');
A.eq(r.code, 200, 'summary route returns 200');
A.eq(r.body.summary.acceptanceRate, 0.5, 'summary comes from authoritative store');
r = hit('/api/managed-tasks/t1');
A.eq(r.code, 200, 'task drilldown returns 200');
A.eq(r.body.history[0].taskId, 't1', 'task drilldown is exact');
r = hit('/api/managed-tasks/missing');
A.eq(r.code, 404, 'missing task returns honest 404');
r = hit('/api/managed-tasks/a%2Fb');
A.eq(r.code, 400, 'encoded slash cannot escape task-id segment');

const broken = makeTaskHistoryHttp({ store: { list() { throw new Error('disk'); }, summary: store.summary }, respondJson(res, code, body) { sent.push({ code, body }); } });
sent.length = 0; broken.serve({ url: '/api/managed-tasks' }, {});
A.eq(sent[0].code, 500, 'store failure is reported honestly, never converted into empty history');
A.report('managed-task-history-http.test');
