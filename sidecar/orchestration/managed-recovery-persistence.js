'use strict';

const { managedRecoveryActionId } = require('./managed-recovery-identity.js');

function str(v, max) {
  const s = v == null ? '' : String(v);
  return max ? s.slice(0, max) : s;
}

/* Persist only already-classified authoritative reconciliation decisions. The store
   remains the single authority. Post-boundary decisions must carry the exact durable
   checkpoint token observed before verification; the store performs the final CAS. */
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

  const token = decision.recoveryCheckpoint || {};
  const expectedCheckpointStage = str(token.stage, 40);
  const expectedCheckpointTs = Number(token.ts) || 0;
  if (!expectedCheckpointStage || !expectedCheckpointTs) {
    return { ok: false, persisted: false, retryAllowed: false, reason: 'reconciliation-checkpoint-token-required' };
  }

  const record = Object.freeze({
    schemaVersion: 'moe.managed-recovery-reconciliation.v1',
    taskId,
    actionId,
    decision: kind,
    outcome: outcome || 'UNKNOWN',
    providerRef: str(decision.providerRef, 500),
    reason: str(decision.reason, 160),
    expectedCheckpointStage,
    expectedCheckpointTs
  });

  let committed;
  try { committed = await store.commitRecoveryReconciliation(record); }
  catch (_) { return { ok: false, persisted: false, retryAllowed: false, reason: 'reconciliation-persistence-failed' }; }

  if (!committed || committed.ok !== true) {
    return { ok: false, persisted: false, retryAllowed: false, reason: str(committed && committed.reason, 160) || 'reconciliation-persistence-refused' };
  }

  return {
    ok: true,
    persisted: true,
    retryAllowed: kind === 'RETRY_ALLOWED' && outcome === 'NOT_APPLIED_CONFIRMED',
    decision: kind,
    outcome: record.outcome,
    duplicate: committed.duplicate === true,
    record: committed.record || record
  };
}

module.exports = { persistManagedRecoveryDecision };
