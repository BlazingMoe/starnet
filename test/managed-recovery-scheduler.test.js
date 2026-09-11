'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');
const { runManagedRecoveryBatch } = require('../sidecar/orchestration/managed-recovery-scheduler.js');

function makeStore() {
  const disk = [];
  let now = 9000;
  return makeTaskHistoryStore({
    io: {
      readAll() { return disk.slice(); },
      append(row) { disk.push(JSON.parse(JSON.stringify(row))); }
    },
    clock: { now() { return now++; } }
  });
}

function seed(store, taskId, stage) {
  store.recordCheckpoint({
    taskId,
    parentRunId: 'run-' + taskId,
    leadAgentId: 'lead-' + taskId,
    workerAgentId: 'worker-' + taskId,
    objective: 'recover ' + taskId,
    acceptanceCriteria: ['same durable contract'],
    stage: stage || 'contract',
    startedAt: 8990
  });
}

(async () => {
  let claimCalls = 0;
  const noDiscovery = await runManagedRecoveryBatch({
    store: {},
    registry: { dispatch() {} },
    claimIdFor() { claimCalls++; return 'unused'; }
  });
  A.eq(noDiscovery.ok, false, 'missing authoritative discovery blocks scheduler');
  A.eq(noDiscovery.reason, 'recovery-discovery-unavailable', 'missing discovery has stable reason');
  A.eq(noDiscovery.executionMayHaveStarted, false, 'preflight failure never invents execution');
  A.eq(claimCalls, 0, 'preflight failure does not mint a claim id');

  const store = makeStore();
  seed(store, 'safe-old');
  seed(store, 'unsafe-dispatch', 'dispatch');
  seed(store, 'safe-new');

  const seen = [];
  const registry = {
    async dispatch(call, ctx) {
      seen.push({ call, ctx });
      const boundary = await ctx.beforeToolExecute(call, { name: call.name });
      if (boundary && boundary.ok === false) return boundary;
      return { ok: true, isError: false, summary: 'ok', content: 'ran' };
    }
  };

  const first = await runManagedRecoveryBatch({
    store,
    registry,
    limit: 1,
    claimIdFor(candidate) { return 'claim-' + candidate.taskId; },
    ambientCtxFor(candidate) { return { traceId: 'trace-' + candidate.taskId }; }
  });
  A.eq(first.ok, true, 'bounded batch succeeds for safe candidate');
  A.eq(first.discovered, 1, 'limit bounds discovery snapshot');
  A.eq(first.processed, 1, 'limit bounds executions');
  A.eq(first.items[0].taskId, 'safe-new', 'newest safe recovery is processed first');
  A.eq(seen.length, 1, 'only one task reaches registry');
  A.eq(seen[0].ctx.agentId, 'lead-safe-new', 'original lead provenance is preserved');
  A.eq(seen[0].ctx.runId, 'run-safe-new', 'original run provenance is preserved');
  A.eq(seen[0].ctx.traceId, 'trace-safe-new', 'per-task ambient context is composed');
  A.eq(store.recovery('safe-new').disposition, 'RECONCILE_BEFORE_RETRY', 'processed task crosses durable dispatch fence');
  A.eq(store.recovery('safe-old').disposition, 'SAFE_RESTART', 'unprocessed safe task remains discoverable');
  A.eq(store.recovery('unsafe-dispatch').disposition, 'RECONCILE_BEFORE_RETRY', 'unsafe recovery is never promoted into batch');

  const second = await runManagedRecoveryBatch({
    store,
    registry,
    limit: 5,
    claimIdFor(candidate) { return 'claim-' + candidate.taskId; }
  });
  A.eq(second.discovered, 1, 'second batch sees remaining safe candidate only');
  A.eq(second.items[0].taskId, 'safe-old', 'remaining safe task is processed');
  A.eq(seen.length, 2, 'unsafe dispatch checkpoint never reaches registry');

  const empty = await runManagedRecoveryBatch({
    store,
    registry,
    claimIdFor(candidate) { return 'claim-' + candidate.taskId; }
  });
  A.eq(empty.ok, true, 'empty safe-recovery batch is a successful no-op');
  A.eq(empty.discovered, 0, 'no safe candidates remain');
  A.eq(empty.processed, 0, 'no synthetic work is reported');

  const missingClaimAuthority = await runManagedRecoveryBatch({
    store,
    registry
  });
  A.eq(missingClaimAuthority.ok, false, 'scheduler refuses to invent claim identity');
  A.eq(missingClaimAuthority.reason, 'recovery-claim-id-authority-required', 'claim identity must come from host authority');

  A.report('managed-recovery-scheduler.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
