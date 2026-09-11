'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');
const { restartManagedTask } = require('../sidecar/orchestration/managed-recovery-runner.js');
const { runManagedRecoveryBatch } = require('../sidecar/orchestration/managed-recovery-scheduler.js');
const { makeManagedRecoveryLifecycleHook } = require('../sidecar/orchestration/managed-recovery-lifecycle.js');

function makeStore() {
  const disk = [];
  let now = 7000;
  return makeTaskHistoryStore({
    io: {
      readAll() { return disk.slice(); },
      append(row) { disk.push(JSON.parse(JSON.stringify(row))); }
    },
    clock: { now() { return now++; } }
  });
}

function seed(store, taskId) {
  store.recordCheckpoint({
    taskId,
    parentRunId: 'run-' + taskId,
    leadAgentId: 'lead-' + taskId,
    workerAgentId: 'worker-' + taskId,
    objective: 'resume ' + taskId,
    acceptanceCriteria: ['same durable contract'],
    stage: 'contract',
    startedAt: 6990
  });
}

(async () => {
  let accidentalClaims = 0;
  const preflightStore = {
    recovery() { return null; },
    claimSafeRestart() { accidentalClaims++; return { ok: false }; },
    fenceSafeRestartClaim() { return { ok: false }; },
    releaseSafeRestartClaim() { return { ok: true }; }
  };
  const noRegistry = await restartManagedTask({
    registry: null,
    store: preflightStore,
    taskId: 'preflight',
    claimId: 'claim-preflight'
  });
  A.eq(noRegistry.ok, false, 'missing registry blocks restart');
  A.eq(noRegistry.phase, 'preflight', 'host dependency failure is classified before durable mutation');
  A.eq(noRegistry.reason, 'managed-registry-unavailable', 'missing registry failure is machine-readable');
  A.eq(noRegistry.executionMayHaveStarted, false, 'preflight failure never invents execution');
  A.eq(accidentalClaims, 0, 'preflight failure cannot strand a durable recovery claim');

  const deniedStore = makeStore();
  seed(deniedStore, 'denied');
  const deniedRegistry = {
    async dispatch() {
      return { ok: false, isError: true, summary: 'capability-denied', content: 'blocked before tool boundary' };
    }
  };
  const denied = await restartManagedTask({
    registry: deniedRegistry,
    store: deniedStore,
    taskId: 'denied',
    claimId: 'claim-denied',
    ambientCtx: { traceId: 'trace-denied' }
  });
  A.eq(denied.ok, false, 'ordinary registry refusal remains a failed restart');
  A.eq(denied.phase, 'dispatch', 'claimed restart reaches the authoritative dispatch phase');
  A.eq(denied.boundaryCrossed, false, 'pre-tool refusal does not cross the durable execution fence');
  A.eq(denied.claimReleased, true, 'pre-tool refusal releases the claim through the authoritative store');
  A.eq(deniedStore.recovery('denied').disposition, 'SAFE_RESTART', 'provably pre-execution refusal returns to safe restart state');

  const successStore = makeStore();
  seed(successStore, 'success');
  let ran = false;
  let seenCtx = null;
  const successRegistry = {
    async dispatch(call, ctx) {
      seenCtx = ctx;
      const boundary = await ctx.beforeToolExecute(call, { name: call.name });
      if (boundary && boundary.ok === false) return boundary;
      ran = true;
      return { ok: true, isError: false, summary: 'ok', content: 'ran' };
    }
  };
  const success = await restartManagedTask({
    registry: successRegistry,
    store: successStore,
    taskId: 'success',
    claimId: 'claim-success',
    ambientCtx: { traceId: 'trace-success' }
  });
  A.eq(success.ok, true, 'safe restart can execute through the ordinary registry');
  A.eq(success.phase, 'dispatch', 'successful restart reports the dispatch phase');
  A.eq(ran, true, 'tool runs only after the injected pre-tool recovery fence');
  A.eq(success.boundaryCrossed, true, 'successful restart durably crosses the execution boundary');
  A.eq(success.claimReleased, false, 'post-boundary state is never rewound to replayable');
  A.eq(successStore.recovery('success').disposition, 'RECONCILE_BEFORE_RETRY', 'post-dispatch recovery stays conservative');
  A.eq(successStore.recovery('success').executionMayHaveStarted, true, 'durable history remains the authority for possible execution');
  A.eq(seenCtx.agentId, 'lead-success', 'restart preserves original lead provenance');
  A.eq(seenCtx.runId, 'run-success', 'restart preserves original parent run provenance');
  A.eq(seenCtx.traceId, 'trace-success', 'ambient host context survives composition');

  const batchStore = makeStore();
  seed(batchStore, 'batch-old');
  batchStore.recordCheckpoint({
    taskId: 'batch-unsafe',
    parentRunId: 'run-batch-unsafe',
    leadAgentId: 'lead-batch-unsafe',
    workerAgentId: 'worker-batch-unsafe',
    objective: 'do not replay',
    stage: 'dispatch',
    startedAt: 6990
  });
  seed(batchStore, 'batch-new');
  const batchSeen = [];
  const batchRegistry = {
    async dispatch(call, ctx) {
      batchSeen.push(ctx.runId);
      const boundary = await ctx.beforeToolExecute(call, { name: call.name });
      if (boundary && boundary.ok === false) return boundary;
      return { ok: true, isError: false, summary: 'ok', content: 'ran' };
    }
  };
  const batch = await runManagedRecoveryBatch({
    store: batchStore,
    registry: batchRegistry,
    limit: 1,
    claimIdFor(candidate) { return 'claim-' + candidate.taskId; }
  });
  A.eq(batch.ok, true, 'bounded recovery batch executes a safe candidate');
  A.eq(batch.processed, 1, 'batch limit bounds execution count');
  A.eq(batch.items[0].taskId, 'batch-new', 'batch consumes authoritative newest-first recovery discovery');
  A.eq(batchSeen.length, 1, 'unsafe recovery never reaches registry through scheduler');
  A.eq(batchStore.recovery('batch-old').disposition, 'SAFE_RESTART', 'unprocessed safe recovery remains authoritative and replayable');
  A.eq(batchStore.recovery('batch-unsafe').disposition, 'RECONCILE_BEFORE_RETRY', 'scheduler never promotes post-boundary recovery');

  const lifecycleStore = makeStore();
  seed(lifecycleStore, 'lifecycle-safe');
  const lifecycleRuns = [];
  const lifecycleRegistry = {
    async dispatch(call, ctx) {
      lifecycleRuns.push({ call, ctx });
      const boundary = await ctx.beforeToolExecute(call, { name: call.name });
      if (boundary && boundary.ok === false) return boundary;
      return { ok: true, isError: false, summary: 'ok', content: 'ran' };
    }
  };
  const lifecycleHook = makeManagedRecoveryLifecycleHook({
    enabled: true,
    store: lifecycleStore,
    registry: lifecycleRegistry,
    limit: 1,
    claimIdFor(candidate) { return 'lifecycle-claim-' + candidate.taskId; }
  });
  const lifecycleFirst = await lifecycleHook({ traceId: 'startup-trace' });
  A.eq(lifecycleFirst.ok, true, 'lifecycle hook runs one bounded recovery pass');
  A.eq(lifecycleFirst.processed, 1, 'lifecycle hook delegates bounded execution to scheduler');
  A.eq(lifecycleRuns.length, 1, 'lifecycle hook executes the safe recovery once');
  A.eq(lifecycleRuns[0].ctx.traceId, 'startup-trace', 'lifecycle ambient context reaches ordinary registry dispatch');
  const lifecycleSecond = await lifecycleHook({ traceId: 'second-trace' });
  A.eq(lifecycleSecond.skipped, true, 'same lifecycle hook instance is idempotent after first invocation');
  A.eq(lifecycleSecond.reason, 'managed-recovery-lifecycle-already-invoked', 'repeat invocation is explicit and machine-readable');
  A.eq(lifecycleRuns.length, 1, 'repeat lifecycle invocation does not redispatch recovered work');

  let preflightClaimIds = 0;
  const retryableLifecycle = makeManagedRecoveryLifecycleHook({
    enabled: true,
    store: lifecycleStore,
    registry: null,
    claimIdFor() { preflightClaimIds++; return 'unused'; }
  });
  const lifecyclePreflight = await retryableLifecycle();
  A.eq(lifecyclePreflight.ok, false, 'lifecycle preflight failure is surfaced');
  A.eq(lifecyclePreflight.reason, 'managed-registry-unavailable', 'lifecycle preflight failure identifies missing registry');
  A.eq(preflightClaimIds, 0, 'lifecycle preflight failure happens before claim-id generation or durable mutation');

  const disabledLifecycle = makeManagedRecoveryLifecycleHook({ enabled: false });
  const disabled = await disabledLifecycle();
  A.eq(disabled.skipped, true, 'lifecycle recovery requires explicit host opt-in');
  A.eq(disabled.reason, 'managed-recovery-lifecycle-disabled', 'disabled lifecycle hook reports why it did nothing');

  A.report('managed-recovery-runner.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
