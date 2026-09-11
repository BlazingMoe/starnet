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

function seed(store, taskId, stage, leadAgentId) {
  const lead = leadAgentId || 'lead-' + taskId;
  store.recordCheckpoint({
    taskId,
    parentRunId: 'run-' + taskId,
    leadAgentId: lead,
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
    leadAgentId: 'lead-main',
    claimIdFor() { claimCalls++; return 'unused'; }
  });
  A.eq(noDiscovery.ok, false, 'missing authoritative discovery blocks scheduler');
  A.eq(noDiscovery.reason, 'recovery-discovery-unavailable', 'missing discovery has stable reason');
  A.eq(noDiscovery.executionMayHaveStarted, false, 'preflight failure never invents execution');
  A.eq(claimCalls, 0, 'preflight failure does not mint a claim id');

  const noLead = await runManagedRecoveryBatch({
    store: { listRecoveries() { throw new Error('must not discover without lead authority'); } },
    registry: { dispatch() {} },
    claimIdFor() { claimCalls++; return 'unused'; }
  });
  A.eq(noLead.ok, false, 'scheduler requires an active lead authority');
  A.eq(noLead.reason, 'recovery-lead-agent-required', 'missing lead authority has stable reason');
  A.eq(noLead.executionMayHaveStarted, false, 'missing lead authority is pre-execution');
  A.eq(claimCalls, 0, 'missing lead authority cannot mint a claim id');

  const discoveryFailure = await runManagedRecoveryBatch({
    store: { listRecoveries() { throw new Error('history read unavailable'); } },
    registry: { dispatch() { throw new Error('must not dispatch'); } },
    leadAgentId: 'lead-main',
    claimIdFor() { claimCalls++; return 'unused'; }
  });
  A.eq(discoveryFailure.ok, false, 'authoritative discovery exception is contained');
  A.eq(discoveryFailure.reason, 'recovery-discovery-failed', 'discovery exception has stable reason');
  A.eq(discoveryFailure.executionMayHaveStarted, false, 'discovery exception is explicitly pre-execution');
  A.eq(discoveryFailure.items.length, 0, 'discovery exception cannot synthesize work');
  A.eq(claimCalls, 0, 'discovery exception cannot mint a claim id');

  const ambientFailureStore = makeStore();
  seed(ambientFailureStore, 'ambient-failure', 'contract', 'lead-main');
  const ambientFailure = await runManagedRecoveryBatch({
    store: ambientFailureStore,
    registry: { dispatch() { throw new Error('must not dispatch'); } },
    leadAgentId: 'lead-main',
    ambientCtxFor() { throw new Error('ambient context unavailable'); },
    claimIdFor() { claimCalls++; return 'unused'; }
  });
  A.eq(ambientFailure.ok, false, 'per-task ambient context exception is contained');
  A.eq(ambientFailure.items.length, 1, 'ambient context failure remains attached to its candidate');
  A.eq(ambientFailure.items[0].reason, 'recovery-ambient-context-failed', 'ambient context exception has stable reason');
  A.eq(ambientFailure.items[0].executionMayHaveStarted, false, 'ambient context exception is explicitly pre-execution');
  A.eq(claimCalls, 0, 'ambient context failure is detected before claim-id minting');
  A.eq(ambientFailureStore.recovery('ambient-failure').disposition, 'SAFE_RESTART', 'ambient context failure leaves durable recovery untouched');

  const store = makeStore();
  seed(store, 'safe-old', 'contract', 'lead-main');
  seed(store, 'unsafe-dispatch', 'dispatch', 'lead-main');
  seed(store, 'foreign-newest', 'contract', 'lead-other');
  seed(store, 'safe-new', 'contract', 'lead-main');
  store.recordCheckpoint({
    taskId: 'role-collision',
    parentRunId: 'run-role-collision',
    leadAgentId: 'lead-other',
    workerAgentId: 'lead-main',
    objective: 'must not consume the active lead discovery window',
    stage: 'contract',
    startedAt: 8991
  });

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
    leadAgentId: 'lead-main',
    claimIdFor(candidate) { return 'claim-' + candidate.taskId; },
    ambientCtxFor(candidate) { return { traceId: 'trace-' + candidate.taskId }; }
  });
  A.eq(first.ok, true, 'bounded batch succeeds for safe candidate owned by active lead');
  A.eq(first.discovered, 1, 'limit bounds lead-scoped discovery snapshot');
  A.eq(first.processed, 1, 'limit bounds executions');
  A.eq(first.items[0].taskId, 'safe-new', 'newest safe recovery for active lead is processed first');
  A.eq(seen.length, 1, 'only one task reaches registry');
  A.eq(seen[0].ctx.agentId, 'lead-main', 'original matching lead provenance is preserved');
  A.eq(seen[0].ctx.runId, 'run-safe-new', 'original run provenance is preserved');
  A.eq(seen[0].ctx.traceId, 'trace-safe-new', 'per-task ambient context is composed');
  A.eq(store.recovery('safe-new').disposition, 'RECONCILE_BEFORE_RETRY', 'processed task crosses durable dispatch fence');
  A.eq(store.recovery('safe-old').disposition, 'SAFE_RESTART', 'unprocessed safe task remains discoverable');
  A.eq(store.recovery('foreign-newest').disposition, 'SAFE_RESTART', 'different lead task is left untouched');
  A.eq(store.recovery('role-collision').disposition, 'SAFE_RESTART', 'worker-role collision cannot consume lead recovery capacity');
  A.eq(store.recovery('unsafe-dispatch').disposition, 'RECONCILE_BEFORE_RETRY', 'unsafe recovery is never promoted into batch');

  const second = await runManagedRecoveryBatch({
    store,
    registry,
    limit: 5,
    ambientCtx: { agentId: 'lead-main' },
    claimIdFor(candidate) { return 'claim-' + candidate.taskId; }
  });
  A.eq(second.discovered, 1, 'ambient lead authority discovers only remaining matching safe candidate');
  A.eq(second.items[0].taskId, 'safe-old', 'remaining matching safe task is processed');
  A.eq(seen.length, 2, 'unsafe, foreign-lead, and role-collision checkpoints never reach registry');

  const empty = await runManagedRecoveryBatch({
    store,
    registry,
    leadAgentId: 'lead-main',
    claimIdFor(candidate) { return 'claim-' + candidate.taskId; }
  });
  A.eq(empty.ok, true, 'empty lead-scoped safe-recovery batch is a successful no-op');
  A.eq(empty.discovered, 0, 'no safe candidates for active lead remain');
  A.eq(empty.processed, 0, 'no synthetic work is reported');
  A.eq(store.recovery('foreign-newest').disposition, 'SAFE_RESTART', 'empty matching batch does not consume another lead recovery');
  A.eq(store.recovery('role-collision').disposition, 'SAFE_RESTART', 'empty matching batch does not consume worker-role collision');

  const missingClaimAuthority = await runManagedRecoveryBatch({
    store,
    registry,
    leadAgentId: 'lead-main'
  });
  A.eq(missingClaimAuthority.ok, false, 'scheduler refuses to invent claim identity');
  A.eq(missingClaimAuthority.reason, 'recovery-claim-id-authority-required', 'claim identity must come from host authority');

  A.report('managed-recovery-scheduler.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
