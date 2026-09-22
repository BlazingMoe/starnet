'use strict';

const { managedRecoveryActionId } = require('./managed-recovery-identity.js');

function str(v, max) {
  const s = v == null ? '' : String(v);
  return max ? s.slice(0, max) : s;
}

/* Persist only already-classified authoritative reconciliation decisions. The store
   remains the single authority: this module owns no queue, cache, lease, or retry state.
   It requires an atomic store primitive so a stale decision can never overwrite newer
   recovery evidence. */
async function persistManagedRecoveryDecision(opts) {
  opts = opts || {};
  const store = opts.store;
  const taskId = str(opts.taskId, 120);
  const decision = opts.decision || {};
  const actionId = managedRecoveryActionId(taskId);

  if (!store || typeof store.commitRecoveryReconciliation !== 'function') {
    return { ok: false, persisted: false, retryAllowed: false, reason: 'reconciliation-persistence-unavailable' };
  }
  if (!taskId || !actionId) {
    return { ok: false, persisted: false, retryAllowed: false, reason: 'reconciliation-task-id-required' };
  }

  const kind = str(decision.decision, 40);
  const outcome = str(decision.outcome, 40);
  if (kind !== 'CONTINUE_CONFIRMED' && kind !== 'RETRY_ALLOWED' && kind !== 'FREEZE_UNKNOWN') {
    return { ok: false, persisted: false, retryAllowed: false, reason: 'reconciliation-decision-not-persistable' };
  }
  // A pre-dispatch SAFE_RESTART is not a reconciliation outcome and needs no new write.
  if (kind === 'RETRY_ALLOWED' && decision.executionMayHaveStarted !== true) {
    return { ok: true, persisted: false, retryAllowed: true, reason: 'safe-restart-already-durable' };
  }
  if (kind === 'CONTINUE_CONFIRMED' && outcome !== 'APPLIED_CONFIRMED') {
    return { ok: false, persisted: false, retryAllowed: false, reason: 'applied-confirmation-required' };
  }
  if (kind === 'RETRY_ALLOWED' && outcome !== 'NOT_APPLIED_CONFIRMED') {
    return { ok: false, persisted: false, retryAllowed: false, reason: 'not-applied-confirmation-required' };
  }
  if (kind === 'FREEZE_UNKNOWN' && outcome && outcome !== 'UNKNOWN') {
    return { ok: false, persisted: false, retryAllowed: false, reason: 'unknown-outcome-required' };
  }

  const record = Object.freeze({
    schemaVersion: 'moe.managed-recovery-reconciliation.v1',
    taskId,
    actionId,
    decision: kind,
    outcome: outcome || 'UNKNOWN',
    providerRef: str(decision.providerRef, 500),
    reason: str(decision.reason, 160)
  });

  let committed;
  try { committed = await store.commitRecoveryReconciliation(record); }
  catch (_) { return { ok: false, persisted: false, retryAllowed: false, reason: 'reconciliation-persistence-failed' }; }

  if (!committed || committed.ok !== true) {
    return {
      ok: false, persisted: false, retryAllowed: false,
      reason: str(committed && committed.reason, 160) || 'reconciliation-persistence-refused'
    };
  }

  return {
    ok: true,
    persisted: true,
    retryAllowed: kind === 'RETRY_ALLOWED' && outcome === 'NOT_APPLIED_CONFIRMED',
    decision: kind,
    outcome: record.outcome,
    record: committed.record || record
  };
}

module.exports = { persistManagedRecoveryDecision };
