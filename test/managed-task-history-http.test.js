/* node test/managed-task-history-http.test.js */
'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryHttp, clampLimit } = require('../sidecar/orchestration/task-history-http.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');

const rows = [
  { taskId: 't1', leadAgentId: 'lead', workerAgentId: 'worker', status: 'accepted', accepted: true },
  { taskId: 't2', leadAgentId: 'lead', workerAgentId: 'worker2', status: 'rejected', accepted: false }
];
const activeRows = [
  { taskId: 'live1', leadAgentId: 'lead', workerAgentId: 'worker', stage: 'dispatch', elapsedMs: 50 },
  { taskId: 'live2', leadAgentId: 'lead2', workerAgentId: 'worker2', stage: 'audit', elapsedMs: 25 }
];
const recoveries = {
  t1: { state: 'TERMINAL', checkpoint: null, terminal: rows[0] },
  live1: { state: 'RESUME_REQUIRED', checkpoint: { taskId: 'live1', stage: 'dispatch', ts: 123 }, terminal: null }
};
const store = {
  list(filter, options) {
    let out = rows.slice();
    if (filter.taskId) out = out.filter(x => x.taskId === filter.taskId);
    if (filter.agentId) out = out.filter(x => x.leadAgentId === filter.agentId || x.workerAgentId === filter.agentId);
    if (filter.status) out = out.filter(x => x.status === filter.status);
    return out.slice(0, options.limit);
  },
  summary() { return { total: 2, accepted: 1, rejected: 1, acceptanceRate: 0.5 }; },
  recovery(taskId) { return recoveries[taskId] || { state: 'UNKNOWN_TASK', checkpoint: null, terminal: null }; },
  activeList(filter) {
    let out = activeRows.slice();
    if (filter.agentId) out = out.filter(x => x.leadAgentId === filter.agentId || x.workerAgentId === filter.agentId);
    return out;
  },
  activeSummary() { return { active: 2, byStage: { dispatch: 1, audit: 1 } }; }
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
A.eq(r.body.live.active, 2, 'summary includes authoritative in-flight count');
r = hit('/api/managed-tasks/active?agent=worker&limit=1');
A.eq(r.code, 200, 'active route returns 200');
A.eq(r.body.tasks.map(x => x.taskId), ['live1'], 'active route applies agent filter and limit');
A.eq(r.body.summary.byStage.audit, 1, 'active route includes live summary');
r = hit('/api/managed-task-recovery/t1');
A.eq(r.code, 200, 'recovery route returns terminal state');
A.eq(r.body.state, 'TERMINAL', 'terminal recovery state comes from authoritative store');
A.eq(r.body.recovery.terminal.taskId, 't1', 'terminal recovery preserves authoritative terminal row');
r = hit('/api/managed-task-recovery/live1');
A.eq(r.code, 200, 'recovery route exposes restart-required task');
A.eq(r.body.state, 'RESUME_REQUIRED', 'checkpoint-only task is explicitly marked resume-required');
A.eq(r.body.recovery.checkpoint.stage, 'dispatch', 'resume-required response preserves durable checkpoint stage');
r = hit('/api/managed-task-recovery/missing');
A.eq(r.code, 404, 'unknown recovery task returns honest 404');
A.eq(r.body.state, 'UNKNOWN_TASK', 'unknown recovery task is not fabricated');
r = hit('/api/managed-task-recovery/a%2Fb');
A.eq(r.code, 400, 'recovery route rejects encoded slash escape');
r = hit('/api/managed-tasks/t1');
A.eq(r.code, 200, 'task drilldown returns 200');
A.eq(r.body.history[0].taskId, 't1', 'task drilldown is exact');
r = hit('/api/managed-tasks/missing');
A.eq(r.code, 404, 'missing task returns honest 404');
r = hit('/api/managed-tasks/a%2Fb');
A.eq(r.code, 400, 'encoded slash cannot escape task-id segment');

const noLive = makeTaskHistoryHttp({ store: { list: store.list, summary: store.summary, recovery: store.recovery }, respondJson(res, code, body) { sent.push({ code, body }); } });
sent.length = 0; noLive.serve({ url: '/api/managed-tasks/active' }, {});
A.eq(sent[0].code, 503, 'active route reports unavailable tracker honestly');

const noRecovery = makeTaskHistoryHttp({ store: { list: store.list, summary: store.summary }, respondJson(res, code, body) { sent.push({ code, body }); } });
sent.length = 0; noRecovery.serve({ url: '/api/managed-task-recovery/t1' }, {});
A.eq(sent[0].code, 503, 'recovery route reports unavailable recovery authority honestly');

const broken = makeTaskHistoryHttp({ store: { list() { throw new Error('disk'); }, summary: store.summary }, respondJson(res, code, body) { sent.push({ code, body }); } });
sent.length = 0; broken.serve({ url: '/api/managed-tasks' }, {});
A.eq(sent[0].code, 500, 'store failure is reported honestly, never converted into empty history');
for (const [count, truncated, expected] of [[500, false, false], [501, false, true], [2, true, true], [2, undefined, true]]) {
  let page;
  const boundedApi = makeTaskHistoryHttp({
    store: {
      list(filter, options) { A.eq(options.limit, 501, 'detail reads one extra record to detect the response boundary'); return Array.from({ length: count }, (_, index) => ({ taskId: filter.taskId, index })).slice(0, options.limit); },
      summary() { return { window: { truncated } }; }
    },
    respondJson(res, code, body) { page = body; }
  });
  boundedApi.serve({ url: '/api/managed-tasks/windowed' }, {});
  A.eq(page.history.length, Math.min(count, 500), 'detail response retains its existing hard cap');
  A.eq(page.historyWindow.bounded, expected, 'response cap and store retention both bound history evidence');
  A.eq(page.historyWindow.returnedRows, page.history.length, 'window describes only returned rows');
}

let now = 100;
const recoveryDisk = [];
const recoveryStore = makeTaskHistoryStore({ clock: { now: () => now++ }, ramMax: 10,
  io: { readAll: () => recoveryDisk.slice(), append: row => recoveryDisk.push(row) } });
for (const taskId of ['older-a', 'middle-b', 'newest-c']) recoveryStore.recordCheckpoint({ taskId, leadAgentId: 'lead', workerAgentId: 'worker', stage: 'contract' });
const recoveryApi = makeTaskHistoryHttp({ store: recoveryStore, respondJson(res, code, body) { sent.push({ code, body }); return body; } });
function recoveryHit(url) { sent.length = 0; recoveryApi.serve({ url }, {}); return sent[0]; }
r = recoveryHit('/api/managed-task-recoveries?limit=1');
A.eq(r.code, 200, 'first recovery page returns successfully');
A.eq(r.body.recoveries.rows.map(row => row.taskId), ['newest-c'], 'recovery HTTP page is newest first');
A.eq(r.body.page.hasMore, true, 'HTTP exposes retained continuation separately');
A.eq(r.body.page.storageTruncated, false, 'HTTP reports no retained-store loss independently');
A.ok(r.body.page.nextCursor, 'HTTP returns an opaque continuation cursor');
recoveryStore.recordCheckpoint({ taskId: 'inserted-after-page-one', leadAgentId: 'lead', workerAgentId: 'worker', stage: 'contract' });
r = recoveryHit('/api/managed-task-recoveries?limit=1&cursor=' + encodeURIComponent(r.body.page.nextCursor));
A.eq(r.code, 200, 'cursor continues after new records arrive');
A.eq(r.body.recoveries.rows.map(row => row.taskId), ['middle-b'], 'new records do not shift the cursor page');
A.eq(r.body.recoveries.rows.some(row => row.taskId === 'newest-c'), false, 'HTTP cursor pages do not duplicate their anchor');
const validCursor = recoveryHit('/api/managed-task-recoveries?limit=1').body.page.nextCursor;
A.eq(recoveryHit('/api/managed-task-recoveries?limit=1&agent=other&cursor=' + encodeURIComponent(validCursor)).code, 400, 'cursor cannot be reused with another filter context');
A.eq(recoveryHit('/api/managed-task-recoveries?cursor=not-a-cursor').code, 400, 'malformed cursor returns a clear client error');
A.eq(recoveryHit('/api/managed-task-recoveries?cursor=').code, 400, 'an explicitly empty cursor is malformed rather than treated as the first page');
const unknownAnchor = Buffer.from(JSON.stringify({ v: 1, taskId: 'unknown-anchor', ts: 1, agent: '', disposition: '' })).toString('base64url');
A.eq(recoveryHit('/api/managed-task-recoveries?cursor=' + unknownAnchor).code, 410, 'unknown or expired anchor returns a clear reload status');
A.ok(/expired.*reload/i.test(recoveryHit('/api/managed-task-recoveries?cursor=' + unknownAnchor).body.error), 'expired cursor response explains recovery');
const anchorValue = JSON.parse(Buffer.from(validCursor, 'base64url').toString('utf8'));
recoveryStore.recordCheckpoint({ taskId: anchorValue.taskId, leadAgentId: 'lead', workerAgentId: 'worker', stage: 'dispatch' });
A.eq(recoveryHit('/api/managed-task-recoveries?cursor=' + encodeURIComponent(validCursor)).code, 410, 'cursor is rejected when its retained checkpoint has changed');

const truncatedStore = makeTaskHistoryStore({ clock: { now: () => 500 }, ramMax: 1,
  io: { readAll: () => [], append() {} } });
truncatedStore.recordCheckpoint({ taskId: 'retained', leadAgentId: 'lead', workerAgentId: 'worker', stage: 'contract' });
truncatedStore.recordCheckpoint({ taskId: 'dropped', leadAgentId: 'lead', workerAgentId: 'worker', stage: 'contract' });
const truncatedApi = makeTaskHistoryHttp({ store: truncatedStore, respondJson(res, code, body) { sent.push({ code, body }); return body; } });
sent.length = 0; truncatedApi.serve({ url: '/api/managed-task-recoveries?limit=10' }, {});
A.eq(sent[0].body.page.hasMore, false, 'no cursor continuation when retained rows fit the page');
A.eq(sent[0].body.page.storageTruncated, true, 'dropped store history remains visible independently of hasMore');

A.report('managed-task-history-http.test');
