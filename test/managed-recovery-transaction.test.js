'use strict';
const A = require('./_assert.js');
const { reconcileAndPersistManagedRecovery } = require('../sidecar/orchestration/managed-recovery-transaction.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');

const schema = 'moe.managed-task-checkpoint.v1';
function recovery(taskId, stage, extra) {
  return { state: 'RESUME_REQUIRED', checkpoint: Object.assign({ schemaVersion: schema, taskId, stage, ts: 100 }, extra || {}) };
}

(async () => {
  const writes = [];
  const store = {
    recovery(id) { return recovery(id, 'dispatch'); },
    async commitRecoveryReconciliation(record) { writes.push(record); return { ok: true, record }; }
  };

  let out = await reconcileAndPersistManagedRecovery({
    store, taskId: 'not-applied',
    async verifyOutcome(request) { return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED', providerRef: 'provider:not-applied' }; }
  });
  A.eq(out.decision, 'RETRY_ALLOWED', 'confirmed not-applied outcome survives durable transaction');
  A.eq(out.persisted, true, 'post-boundary retry decision is durably committed');
  A.eq(out.retryAllowed, true, 'retry is exposed only after commit succeeds');
  A.eq(writes.length, 1, 'transaction performs exactly one reconciliation commit');
  A.eq(writes[0].expectedCheckpointStage, 'dispatch', 'commit is bound to verified checkpoint stage');
  A.eq(writes[0].expectedCheckpointTs, 100, 'commit is bound to verified checkpoint timestamp');

  out = await reconcileAndPersistManagedRecovery({
    store, taskId: 'applied',
    async verifyOutcome(request) { return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'APPLIED_CONFIRMED', providerRef: 'provider:applied' }; }
  });
  A.eq(out.decision, 'CONTINUE_CONFIRMED', 'confirmed applied outcome is durable');
  A.eq(out.persisted, true, 'applied confirmation is committed before continuation');
  A.eq(out.retryAllowed, false, 'applied action is never replayed');

  const refusingStore = {
    recovery(id) { return recovery(id, 'dispatch'); },
    async commitRecoveryReconciliation() { return { ok: false, reason: 'stale-recovery-state' }; }
  };
  out = await reconcileAndPersistManagedRecovery({
    store: refusingStore, taskId: 'stale',
    async verifyOutcome(request) { return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED' }; }
  });
  A.eq(out.decision, 'FREEZE_UNKNOWN', 'stale atomic commit converts tentative retry into freeze');
  A.eq(out.retryAllowed, false, 'failed commit cannot leak retry permission');
  A.eq(out.reason, 'stale-recovery-state', 'atomic refusal remains visible');

  let commits = 0;
  out = await reconcileAndPersistManagedRecovery({
    store: { recovery(id) { return recovery(id, 'resume-claimed', { recoveryClaimId: 'claim-1' }); }, async commitRecoveryReconciliation() { commits++; return { ok: true }; } },
    taskId: 'claimed', async verifyOutcome() { throw new Error('must not run'); }
  });
  A.eq(out.decision, 'VERIFY_CLAIM_OWNER', 'active claim stays on claim-resolution path');
  A.eq(commits, 0, 'claim ownership does not create reconciliation records');
  A.eq(out.retryAllowed, false, 'active claim cannot retry');

  const safeStore = { recovery(id) { return recovery(id, 'contract'); }, async commitRecoveryReconciliation() { throw new Error('safe restart should not write'); } };
  out = await reconcileAndPersistManagedRecovery({ store: safeStore, taskId: 'safe' });
  A.eq(out.decision, 'RETRY_ALLOWED', 'safe pre-dispatch recovery remains restartable');
  A.eq(out.persisted, false, 'safe restart needs no reconciliation write');
  A.eq(out.retryAllowed, true, 'existing durable contract is sufficient for safe restart');

  // Real append-only store integration: reconciliation survives process restart and does
  // not become a terminal task-history row or inflate completion metrics.
  const disk = [];
  const io = { readAll() { return disk.slice(); }, append(row) { disk.push(JSON.parse(JSON.stringify(row))); } };
  let now = 1000;
  const clock = { now() { return now++; } };
  let durable = makeTaskHistoryStore({ io, clock });
  durable.recordCheckpoint({ taskId: 'durable-na', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'x', stage: 'dispatch' });
  out = await reconcileAndPersistManagedRecovery({
    store: durable, taskId: 'durable-na',
    async verifyOutcome(request) { return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED', providerRef: 'provider:na' }; }
  });
  A.eq(out.retryAllowed, true, 'real store unlocks retry only after durable not-applied commit');
  A.eq(durable.count(), 0, 'reconciliation is not counted as a completed task');
  A.eq(durable.recovery('durable-na').disposition, 'SAFE_RESTART', 'durable not-applied evidence becomes safely claimable');

  durable = makeTaskHistoryStore({ io, clock });
  A.eq(durable.recovery('durable-na').disposition, 'SAFE_RESTART', 'not-applied reconciliation reconstructs after restart');
  const claim = durable.claimSafeRestart('durable-na', 'claim-na');
  A.eq(claim.ok, true, 'reconstructed not-applied task can enter the existing atomic claim path');
  A.eq(durable.recovery('durable-na').disposition, 'RECONCILE_BEFORE_RETRY', 'claim consumes prior retry eligibility and prevents duplicate claim');

  durable.recordCheckpoint({ taskId: 'durable-applied', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'y', stage: 'dispatch' });
  out = await reconcileAndPersistManagedRecovery({
    store: durable, taskId: 'durable-applied',
    async verifyOutcome(request) { return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'APPLIED_CONFIRMED', providerRef: 'provider:applied' }; }
  });
  A.eq(out.retryAllowed, false, 'applied durable outcome never unlocks retry');
  A.eq(durable.recovery('durable-applied').disposition, 'RECONCILED_APPLIED', 'applied outcome remains explicit in recovery view');
  durable = makeTaskHistoryStore({ io, clock });
  A.eq(durable.recovery('durable-applied').disposition, 'RECONCILED_APPLIED', 'applied outcome reconstructs after restart');
  A.eq(durable.claimSafeRestart('durable-applied', 'bad-claim').ok, false, 'applied action cannot be reclaimed after restart');

  // CAS: verification against an old checkpoint cannot commit after a newer checkpoint.
  durable.recordCheckpoint({ taskId: 'cas', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'z', stage: 'dispatch' });
  const before = durable.recovery('cas').checkpoint;
  durable.recordCheckpoint({ taskId: 'cas', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'z', stage: 'revision' });
  const staleCommit = durable.commitRecoveryReconciliation({
    schemaVersion: 'moe.managed-recovery-reconciliation.v1', taskId: 'cas', actionId: 'team.delegate_managed:cas',
    decision: 'RETRY_ALLOWED', outcome: 'NOT_APPLIED_CONFIRMED', expectedCheckpointStage: before.stage, expectedCheckpointTs: before.ts
  });
  A.eq(staleCommit.ok, false, 'stale checkpoint evidence cannot overwrite newer durable recovery state');
  A.eq(staleCommit.reason, 'stale-recovery-state', 'CAS refusal is machine-readable');

  A.report('managed-recovery-transaction.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
