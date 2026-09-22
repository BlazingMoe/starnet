'use strict';

const { managedRecoveryReconciliation } = require('./managed-recovery-reconciliation.js');
const { decideManagedRecovery } = require('./managed-recovery-decision.js');
const { managedRecoveryActionId } = require('./managed-recovery-identity.js');

/* Read authoritative recovery state, then ask exactly one injected verifier for provider
   evidence only when the durable checkpoint proves execution may have started. This
   runner never mutates history or retries work; persistence remains a later explicit seam. */
async function reconcileManagedRecovery(opts) {
  opts = opts || {};
  const store = opts.store;
  const taskId = String(opts.taskId || '').slice(0, 120);
  if (!store || typeof store.recovery !== 'function') {
    return { ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, reason: 'recovery-authority-unavailable' };
  }
  if (!taskId) {
    return { ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, reason: 'reconciliation-task-id-required' };
  }

  let recovery;
  try { recovery = await store.recovery(taskId); }
  catch (_) { return { ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, reason: 'recovery-read-failed' }; }

  const checkpointTaskId = String(recovery && recovery.checkpoint && recovery.checkpoint.taskId || '');
  if (recovery && recovery.state === 'RESUME_REQUIRED' && checkpointTaskId !== taskId) {
    return { ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, reason: 'recovery-task-identity-mismatch' };
  }

  const next = managedRecoveryReconciliation(recovery);
  if (next.action !== 'VERIFY_AUTHORITATIVE_OUTCOME') {
    return decideManagedRecovery(recovery);
  }

  if (typeof opts.verifyOutcome !== 'function') {
    return { ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, executionMayHaveStarted: true, reason: 'authoritative-verifier-unavailable' };
  }

  const actionId = managedRecoveryActionId(taskId);
  const request = Object.freeze({ taskId, actionId });
  let evidence;
  try { evidence = await opts.verifyOutcome(request); }
  catch (_) {
    return { ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, executionMayHaveStarted: true, outcome: 'UNKNOWN', reason: 'authoritative-verifier-failed' };
  }

  return decideManagedRecovery(recovery, request, evidence);
}

module.exports = { reconcileManagedRecovery };
