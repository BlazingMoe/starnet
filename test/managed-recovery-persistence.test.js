'use strict';
const A = require('./_assert.js');
const { persistManagedRecoveryDecision } = require('../sidecar/orchestration/managed-recovery-persistence.js');
const { managedRecoveryActionId } = require('../sidecar/orchestration/managed-recovery-identity.js');

(async () => {
  const writes = [];
  const store = {
    async commitRecoveryReconciliation(record) { writes.push(record); return { ok: true, record }; }
  };

  let out = await persistManagedRecoveryDecision({
    store, taskId: 'task-a',
    decision: { decision: 'CONTINUE_CONFIRMED', outcome: 'APPLIED_CONFIRMED', executionMayHaveStarted: true, providerRef: 'order:1', reason: 'confirmed' }
  });
  A.eq(out.ok, true, 'confirmed applied outcome can be durably committed');
  A.eq(out.persisted, true, 'confirmed applied outcome reports durable persistence');
  A.eq(out.retryAllowed, false, 'applied confirmation never unlocks retry');
  A.eq(writes[0].actionId, managedRecoveryActionId('task-a'), 'persistence derives action identity instead of trusting caller input');
  A.eq(writes[0].schemaVersion, 'moe.managed-recovery-reconciliation.v1', 'durable record has explicit schema');

  out = await persistManagedRecoveryDecision({
    store, taskId: 'task-b',
    decision: { decision: 'RETRY_ALLOWED', outcome: 'NOT_APPLIED_CONFIRMED', executionMayHaveStarted: true, providerRef: 'order:2' }
  });
  A.eq(out.ok, true, 'authoritative not-applied outcome can be committed');
  A.eq(out.retryAllowed, true, 'retry becomes eligible only after the durable not-applied commit succeeds');

  const beforeSafe = writes.length;
  out = await persistManagedRecoveryDecision({
    store, taskId: 'safe', decision: { decision: 'RETRY_ALLOWED', executionMayHaveStarted: false }
  });
  A.eq(out.ok, true, 'pre-dispatch safe restart needs no reconciliation write');
  A.eq(out.persisted, false, 'safe restart does not create redundant reconciliation evidence');
  A.eq(writes.length, beforeSafe, 'safe restart leaves append-only history unchanged');

  out = await persistManagedRecoveryDecision({
    store, taskId: 'bad-applied', decision: { decision: 'CONTINUE_CONFIRMED', outcome: 'UNKNOWN', executionMayHaveStarted: true }
  });
  A.eq(out.ok, false, 'continue cannot be persisted without applied confirmation');

  out = await persistManagedRecoveryDecision({
    store, taskId: 'bad-retry', decision: { decision: 'RETRY_ALLOWED', outcome: 'UNKNOWN', executionMayHaveStarted: true }
  });
  A.eq(out.ok, false, 'post-boundary retry cannot be persisted without not-applied confirmation');
  A.eq(out.retryAllowed, false, 'invalid retry evidence fails closed');

  out = await persistManagedRecoveryDecision({
    store: { async commitRecoveryReconciliation() { throw new Error('disk full'); } },
    taskId: 'write-fail', decision: { decision: 'RETRY_ALLOWED', outcome: 'NOT_APPLIED_CONFIRMED', executionMayHaveStarted: true }
  });
  A.eq(out.ok, false, 'persistence failure blocks retry');
  A.eq(out.retryAllowed, false, 'retry is not exposed before durable commit');
  A.eq(out.reason, 'reconciliation-persistence-failed', 'write failure is machine-readable');

  out = await persistManagedRecoveryDecision({
    store: { async commitRecoveryReconciliation() { return { ok: false, reason: 'stale-recovery-state' }; } },
    taskId: 'stale', decision: { decision: 'RETRY_ALLOWED', outcome: 'NOT_APPLIED_CONFIRMED', executionMayHaveStarted: true }
  });
  A.eq(out.ok, false, 'atomic store refusal blocks stale reconciliation decision');
  A.eq(out.retryAllowed, false, 'stale decision cannot unlock retry');
  A.eq(out.reason, 'stale-recovery-state', 'store refusal reason is preserved');

  A.report('managed-recovery-persistence.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
