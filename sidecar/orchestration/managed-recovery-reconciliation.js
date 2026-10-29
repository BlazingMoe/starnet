'use strict';

const { recoveryDisposition } = require('./task-history.js');

/* Derive the next reconciliation action from durable managed-task recovery evidence.
   Read-only: it never releases claims, retries work, or invents provider outcomes. */
function managedRecoveryReconciliation(recovery) {
  recovery = recovery || {};

  if (recovery.state === 'TERMINAL') {
    return { ok: true, action: 'NONE_TERMINAL', retryAllowed: false, executionMayHaveStarted: true, reason: 'terminal-result-recorded' };
  }
  if (recovery.state !== 'RESUME_REQUIRED' || !recovery.checkpoint) {
    return { ok: false, action: 'BLOCKED_NO_EVIDENCE', retryAllowed: false, executionMayHaveStarted: null, reason: 'no-durable-recovery-evidence' };
  }

  const checkpoint = recovery.checkpoint;
  if (checkpoint.schemaVersion !== 'moe.managed-task-checkpoint.v1') {
    return { ok: false, action: 'BLOCKED_UNSUPPORTED_EVIDENCE', retryAllowed: false, executionMayHaveStarted: null, reason: 'unsupported-checkpoint-schema' };
  }

  const disposition = recoveryDisposition(checkpoint);
  if (disposition.disposition === 'SAFE_RESTART') {
    return { ok: true, action: 'SAFE_RESTART', retryAllowed: true, executionMayHaveStarted: false, reason: disposition.reason };
  }
  if (disposition.disposition === 'RECONCILED_APPLIED') {
    return { ok: true, action: 'NONE_APPLIED_CONFIRMED', retryAllowed: false, executionMayHaveStarted: true, reason: disposition.reason };
  }

  if (checkpoint.stage === 'resume-claimed') {
    const claimId = String(checkpoint.recoveryClaimId || '');
    if (!claimId) return { ok: false, action: 'BLOCKED_INVALID_CLAIM_EVIDENCE', retryAllowed: false, executionMayHaveStarted: false, reason: 'recovery-claim-identity-missing' };
    return { ok: true, action: 'VERIFY_CLAIM_OWNER', retryAllowed: false, executionMayHaveStarted: false, claimId, reason: 'durable-recovery-claim-must-be-resolved-before-retry' };
  }

  // A persisted UNKNOWN remains frozen. Re-querying a provider automatically would turn
  // an explicit uncertain state into an implicit retry loop; a later policy may opt in.
  if (checkpoint.reconciliationOutcome === 'UNKNOWN') {
    return { ok: false, action: 'FREEZE_UNKNOWN', retryAllowed: false, executionMayHaveStarted: true, reason: 'authoritative-outcome-unknown' };
  }

  return { ok: true, action: 'VERIFY_AUTHORITATIVE_OUTCOME', retryAllowed: false, executionMayHaveStarted: disposition.executionMayHaveStarted, reason: 'side-effect-boundary-may-have-been-crossed' };
}

module.exports = { managedRecoveryReconciliation };
