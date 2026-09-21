'use strict';

const { managedRecoveryReconciliation } = require('./managed-recovery-reconciliation.js');
const { reconcileAuthoritativeOutcome } = require('./managed-recovery-outcome.js');

function str(v, max) {
  const s = v == null ? '' : String(v);
  return max ? s.slice(0, max) : s;
}

/*
  Pure reconciliation decision seam. It deliberately does not mutate task history or
  retry work. A caller must persist any later transition through the authoritative
  task-history store. UNKNOWN always freezes retry.
*/
function decideManagedRecovery(recovery, request, evidence) {
  const next = managedRecoveryReconciliation(recovery);

  if (next.action === 'SAFE_RESTART') {
    return {
      ok: true,
      decision: 'RETRY_ALLOWED',
      retryAllowed: true,
      executionMayHaveStarted: false,
      reason: next.reason
    };
  }

  if (next.action !== 'VERIFY_AUTHORITATIVE_OUTCOME') {
    return {
      ok: next.ok === true,
      decision: next.action,
      retryAllowed: false,
      executionMayHaveStarted: next.executionMayHaveStarted,
      reason: next.reason
    };
  }

  const durableTaskId = str(recovery && recovery.checkpoint && recovery.checkpoint.taskId, 120);
  const requestedTaskId = str(request && request.taskId, 120);
  if (!durableTaskId || !requestedTaskId || durableTaskId !== requestedTaskId) {
    return {
      ok: false,
      decision: 'FREEZE_UNKNOWN',
      retryAllowed: false,
      executionMayHaveStarted: true,
      outcome: 'UNKNOWN',
      providerRef: '',
      reason: 'reconciliation-request-task-mismatch'
    };
  }

  const outcome = reconcileAuthoritativeOutcome(request, evidence);
  if (outcome.outcome === 'APPLIED_CONFIRMED') {
    return {
      ok: true,
      decision: 'CONTINUE_CONFIRMED',
      retryAllowed: false,
      executionMayHaveStarted: true,
      outcome: outcome.outcome,
      providerRef: outcome.providerRef,
      reason: outcome.reason
    };
  }
  if (outcome.outcome === 'NOT_APPLIED_CONFIRMED') {
    return {
      ok: true,
      decision: 'RETRY_ALLOWED',
      retryAllowed: true,
      executionMayHaveStarted: true,
      outcome: outcome.outcome,
      providerRef: outcome.providerRef,
      reason: outcome.reason
    };
  }

  return {
    ok: false,
    decision: 'FREEZE_UNKNOWN',
    retryAllowed: false,
    executionMayHaveStarted: true,
    outcome: 'UNKNOWN',
    providerRef: outcome.providerRef || '',
    reason: outcome.reason
  };
}

module.exports = { decideManagedRecovery };
