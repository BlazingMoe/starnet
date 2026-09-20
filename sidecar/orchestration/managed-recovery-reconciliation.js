'use strict';

/*
  Derive the next reconciliation action from durable managed-task recovery evidence.
  This module is intentionally read-only: it never releases claims, retries work, or
  invents provider outcomes. Mutating reconciliation must remain a separate explicit
  operation against the authoritative task-history store.
*/
function managedRecoveryReconciliation(recovery) {
  recovery = recovery || {};

  if (recovery.state === 'TERMINAL') {
    return {
      ok: true,
      action: 'NONE_TERMINAL',
      retryAllowed: false,
      executionMayHaveStarted: true,
      reason: 'terminal-result-recorded'
    };
  }

  if (recovery.state !== 'RESUME_REQUIRED' || !recovery.checkpoint) {
    return {
      ok: false,
      action: 'BLOCKED_NO_EVIDENCE',
      retryAllowed: false,
      executionMayHaveStarted: null,
      reason: 'no-durable-recovery-evidence'
    };
  }

  const checkpoint = recovery.checkpoint;
  const stage = String(checkpoint.stage || '');

  if (stage === 'contract') {
    return {
      ok: true,
      action: 'SAFE_RESTART',
      retryAllowed: true,
      executionMayHaveStarted: false,
      reason: 'last-durable-stage-pre-dispatch'
    };
  }

  if (stage === 'resume-claimed') {
    return {
      ok: true,
      action: 'VERIFY_CLAIM_OWNER',
      retryAllowed: false,
      executionMayHaveStarted: false,
      claimId: String(checkpoint.recoveryClaimId || ''),
      reason: 'durable-recovery-claim-must-be-resolved-before-retry'
    };
  }

  return {
    ok: true,
    action: 'VERIFY_AUTHORITATIVE_OUTCOME',
    retryAllowed: false,
    executionMayHaveStarted: true,
    reason: 'side-effect-boundary-may-have-been-crossed'
  };
}

module.exports = { managedRecoveryReconciliation };
