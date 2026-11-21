'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');

function harness(ramMax) {
  const disk = [];
  let now = 1000;
  return {
    disk,
    store: makeTaskHistoryStore({
      io: {
        readAll() { return disk.slice(); },
        append(row) { disk.push(JSON.parse(JSON.stringify(row))); }
      },
      clock: { now() { return now++; } },
      ramMax,
      limit: 10
    })
  };
}

const h = harness(10);
h.store.recordCheckpoint({
  taskId: 'safe', parentRunId: 'run-safe', leadAgentId: 'lead-a', workerAgentId: 'worker-a',
  objective: 'safe task', stage: 'contract', startedAt: 900
});
h.store.recordCheckpoint({
  taskId: 'needs-reconcile', parentRunId: 'run-risk', leadAgentId: 'lead-b', workerAgentId: 'worker-b',
  objective: 'already crossed dispatch fence', stage: 'dispatch', startedAt: 901
});

const all = h.store.listRecoveries();
A.eq(all.truncated, false, 'complete checkpoint window is reported as complete');
A.eq(all.items.length, 2, 'recovery listing comes directly from active durable checkpoints');
A.eq(all.items[0].taskId, 'needs-reconcile', 'recovery listing is newest-first');
A.eq(all.items[0].disposition, 'RECONCILE_BEFORE_RETRY', 'listing reuses conservative recovery disposition');
A.eq(all.items[0].executionMayHaveStarted, true, 'listing preserves possible-execution evidence');
A.eq(all.items[1].taskId, 'safe', 'older active checkpoint remains discoverable');
A.eq(all.items[1].disposition, 'SAFE_RESTART', 'pre-dispatch task is discoverable as safe restart');
A.eq(all.items[1].executionMayHaveStarted, false, 'safe restart does not invent execution telemetry');

const safeOnly = h.store.listRecoveries({ disposition: 'SAFE_RESTART' });
A.eq(safeOnly.items.length, 1, 'disposition filter can select safe restart candidates');
A.eq(safeOnly.items[0].taskId, 'safe', 'safe restart filter returns the authoritative task id');
A.eq(h.store.listRecoveries({ agentId: 'worker-b' }).items[0].taskId, 'needs-reconcile', 'agent filter uses stored provenance');
A.eq(h.store.listRecoveries({}, { limit: 1 }).items.length, 1, 'recovery listing obeys bounded caller limits');
A.eq(h.store.listRecoveries({}, { limit: 1 }).truncated, true, 'caller limit reports omitted matching recoveries');
A.eq(h.store.listRecoveries({}, { limit: 2 }).truncated, false, 'exactly filling the limit does not invent omitted recoveries');
A.eq(h.store.listRecoveries({ disposition: 'SAFE_RESTART' }, { limit: 1 }).truncated, false, 'nonmatching recoveries do not imply truncation');

const cursorWindow = harness(10);
for (const taskId of ['older-a', 'middle-b', 'newest-c']) cursorWindow.store.recordCheckpoint({
  taskId, leadAgentId: 'lead', workerAgentId: 'worker', stage: 'contract'
});
const firstPage = cursorWindow.store.listRecoveries({}, { limit: 1 });
A.eq(firstPage.items.map(row => row.taskId), ['newest-c'], 'first cursor page is newest first');
A.eq(firstPage.hasMore, true, 'page continuation is explicit when matching rows remain');
A.eq(firstPage.storageTruncated, false, 'continuation is not confused with dropped storage');
cursorWindow.store.recordCheckpoint({ taskId: 'inserted-after-page-one', leadAgentId: 'lead', workerAgentId: 'worker', stage: 'contract' });
const secondPage = cursorWindow.store.listRecoveries({}, { limit: 1, after: {
  taskId: firstPage.items[0].taskId, ts: firstPage.items[0].checkpoint.ts
} });
A.eq(secondPage.items.map(row => row.taskId), ['middle-b'], 'new data ahead of the cursor does not shift the next page');
A.eq(secondPage.items.some(row => firstPage.items.some(first => first.taskId === row.taskId)), false, 'adjacent cursor pages are disjoint');
const thirdPage = cursorWindow.store.listRecoveries({}, { limit: 3, after: {
  taskId: secondPage.items[0].taskId, ts: secondPage.items[0].checkpoint.ts
} });
A.eq(thirdPage.items.map(row => row.taskId), ['older-a'], 'cursor continues in stable newest-to-oldest order');
A.eq(thirdPage.hasMore, false, 'last page has no continuation');
A.throws(() => cursorWindow.store.listRecoveries({}, { limit: 1, after: { taskId: 'missing-anchor', ts: 1 } }), 'unknown cursor anchor is rejected');
cursorWindow.store.recordCheckpoint({ taskId: 'newest-c', leadAgentId: 'lead', workerAgentId: 'worker', stage: 'dispatch' });
A.throws(() => cursorWindow.store.listRecoveries({}, { limit: 1, after: {
  taskId: firstPage.items[0].taskId, ts: firstPage.items[0].checkpoint.ts
} }), 'updated cursor anchor expires rather than duplicating or skipping records');

const leadScoped = harness(10);
leadScoped.store.recordCheckpoint({
  taskId: 'owned', leadAgentId: 'lead-main', workerAgentId: 'worker-owned', objective: 'owned', stage: 'contract'
});
leadScoped.store.recordCheckpoint({
  taskId: 'role-collision', leadAgentId: 'lead-other', workerAgentId: 'lead-main', objective: 'foreign lead', stage: 'contract'
});
const genericAgent = leadScoped.store.listRecoveries({ agentId: 'lead-main' }, { limit: 1 });
A.eq(genericAgent.items[0].taskId, 'role-collision', 'generic agent filter intentionally matches any stored role');
const exactLead = leadScoped.store.listRecoveries({ leadAgentId: 'lead-main' }, { limit: 1 });
A.eq(exactLead.items.length, 1, 'exact lead filter is applied before bounded result limit');
A.eq(exactLead.items[0].taskId, 'owned', 'worker-role collision cannot displace an owned lead recovery');

h.store.record({
  taskId: 'safe', leadAgentId: 'lead-a', workerAgentId: 'worker-a', objective: 'safe task',
  status: 'accepted', stage: 'accepted', accepted: true
});
A.eq(h.store.listRecoveries({ taskId: 'safe' }).items.length, 0, 'terminal history removes completed task from recovery discovery');

const bounded = harness(1);
bounded.store.recordCheckpoint({ taskId: 'old', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'old', stage: 'contract' });
bounded.store.recordCheckpoint({ taskId: 'new', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'new', stage: 'contract' });
const boundedList = bounded.store.listRecoveries();
A.eq(boundedList.items.length, 1, 'bounded checkpoint mirror exposes only its retained recovery window');
A.eq(boundedList.items[0].taskId, 'new', 'bounded recovery window retains newest checkpoint');
A.eq(boundedList.truncated, true, 'bounded recovery listing explicitly reports omitted older checkpoint evidence');
A.eq(boundedList.hasMore, false, 'store truncation does not claim more retained rows are pageable');
A.eq(boundedList.storageTruncated, true, 'dropped checkpoints are explicitly distinct from page continuation');

const restarted = makeTaskHistoryStore({
  io: {
    readAll() { return bounded.disk.slice(); },
    append(row) { bounded.disk.push(JSON.parse(JSON.stringify(row))); }
  },
  clock: { now() { return 2000; } },
  ramMax: 1,
  limit: 10
});
const restartedList = restarted.listRecoveries();
A.eq(restartedList.items.length, 1, 'restart reconstructs the bounded recovery window from the same durable log');
A.eq(restartedList.items[0].taskId, 'new', 'restart retains newest durable recovery candidate');
A.eq(restartedList.truncated, true, 'restart truthfully reports recovery-window truncation');

A.report('managed-recovery-listing.test');
