'use strict';

function str(v, max) {
  const s = v == null ? '' : String(v).trim();
  return max ? s.slice(0, max) : s;
}
function normalizeVerdict(v) {
  v = str(v, 40).toUpperCase();
  return v === 'APPLIED_CONFIRMED' || v === 'NOT_APPLIED_CONFIRMED' ? v : 'UNKNOWN';
}

/* Host-owned adapter registry for authoritative outcome verification. Adapters are injected
   by provider/connector composition code; this module performs no network calls and never
   guesses an outcome. A task checkpoint must carry a provider key + provider-owned reference
   before an adapter can be selected. */
function makeManagedRecoveryVerifier(opts) {
  opts = opts || {};
  const adapters = opts.adapters && typeof opts.adapters === 'object' ? opts.adapters : {};

  return async function verifyManagedRecovery(request, recovery) {
    const cp = recovery && recovery.checkpoint || {};
    const taskId = str(request && request.taskId, 120);
    const actionId = str(request && request.actionId, 160);
    const provider = str(cp.recoveryProvider, 80);
    const providerRef = str(cp.recoveryProviderRef, 500);
    if (!taskId || !actionId) return { taskId, actionId, authoritative: false, verdict: 'UNKNOWN', reason: 'recovery-verifier-identity-required' };
    if (!provider || !providerRef) return { taskId, actionId, authoritative: false, verdict: 'UNKNOWN', reason: 'recovery-provider-evidence-missing' };

    const adapter = adapters[provider];
    if (!adapter || typeof adapter.verify !== 'function') {
      return { taskId, actionId, authoritative: false, verdict: 'UNKNOWN', providerRef, reason: 'recovery-provider-adapter-unavailable' };
    }

    let evidence;
    try { evidence = await adapter.verify(Object.freeze({ taskId, actionId, provider, providerRef })); }
    catch (_) { return { taskId, actionId, authoritative: false, verdict: 'UNKNOWN', providerRef, reason: 'recovery-provider-verification-failed' }; }

    const verdict = normalizeVerdict(evidence && evidence.verdict);
    const authoritative = evidence && evidence.authoritative === true && verdict !== 'UNKNOWN';
    return {
      taskId,
      actionId,
      authoritative,
      verdict: authoritative ? verdict : 'UNKNOWN',
      providerRef,
      reason: str(evidence && evidence.reason, 160)
    };
  };
}

module.exports = { makeManagedRecoveryVerifier };
