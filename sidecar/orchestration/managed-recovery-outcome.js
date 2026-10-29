'use strict';

/*
  Normalize authoritative provider reconciliation without guessing from task state.
  Only an explicit provider verdict may classify a possible side effect as applied or
  not applied. Missing, malformed, mismatched, or unknown evidence remains UNKNOWN.
*/
function str(v, max) {
  const s = v == null ? '' : String(v);
  return max ? s.slice(0, max) : s;
}

function reconcileAuthoritativeOutcome(request, evidence) {
  request = request || {};
  evidence = evidence || {};
  const taskId = str(request.taskId, 120);
  const expectedActionId = str(request.actionId, 160);
  const evidenceTaskId = str(evidence.taskId, 120);
  const evidenceActionId = str(evidence.actionId, 160);

  if (!taskId || !expectedActionId) {
    return { ok: false, outcome: 'UNKNOWN', retryAllowed: false, reason: 'reconciliation-identity-required' };
  }
  if (!evidenceTaskId || !evidenceActionId || evidenceTaskId !== taskId || evidenceActionId !== expectedActionId) {
    return { ok: false, outcome: 'UNKNOWN', retryAllowed: false, reason: 'authoritative-evidence-identity-mismatch' };
  }
  if (evidence.authoritative !== true) {
    return { ok: false, outcome: 'UNKNOWN', retryAllowed: false, reason: 'authoritative-evidence-required' };
  }

  const verdict = str(evidence.verdict, 80).toUpperCase();
  if (verdict === 'APPLIED_CONFIRMED') {
    return {
      ok: true,
      outcome: 'APPLIED_CONFIRMED',
      retryAllowed: false,
      reason: 'authoritative-provider-confirms-applied',
      providerRef: str(evidence.providerRef, 500)
    };
  }
  if (verdict === 'NOT_APPLIED_CONFIRMED') {
    return {
      ok: true,
      outcome: 'NOT_APPLIED_CONFIRMED',
      retryAllowed: true,
      reason: 'authoritative-provider-confirms-not-applied',
      providerRef: str(evidence.providerRef, 500)
    };
  }

  return {
    ok: false,
    outcome: 'UNKNOWN',
    retryAllowed: false,
    reason: 'authoritative-outcome-not-confirmed',
    providerRef: str(evidence.providerRef, 500)
  };
}

module.exports = { reconcileAuthoritativeOutcome };
