'use strict';
const A = require('./_assert.js');
const { reconcileManagedRecovery } = require('../sidecar/orchestration/managed-recovery-reconciliation-runner.js');
const { managedRecoveryActionId } = require('../sidecar/orchestration/managed-recovery-identity.js');

const schema = 'moe.managed-task-checkpoint.v1';
function recovery(taskId, stage, extra) {
  return { state: 'RESUME_REQUIRED', checkpoint: Object.assign({ schemaVersion: schema, taskId, stage }, extra || {}) };
}

(async () => {
  let verifierCalls = 0;
  let seenRequest = null;
  const store = { recovery(id) { return recovery(id, 'dispatch'); } };
  const applied = await reconcileManagedRecovery({
    store, taskId: 'task-1',
    async verifyOutcome(request) {
      verifierCalls++;
      seenRequest = request;
      return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'APPLIED_CONFIRMED', providerRef: 'provider:1' };
    }
  });
  A.eq(verifierCalls, 1, 'post-boundary recovery asks the authoritative verifier exactly once');
  A.eq(seenRequest, { taskId: 'task-1', actionId: managedRecoveryActionId('task-1') }, 'runner derives immutable managed action identity from durable task identity');
  A.eq(applied.decision, 'CONTINUE_CONFIRMED', 'authoritative applied evidence prevents replay');
  A.eq(applied.retryAllowed, false, 'confirmed applied action is never retried');

  verifierCalls = 0;
  const safe = await reconcileManagedRecovery({
    store: { recovery(id) { return recovery(id, 'contract'); } }, taskId: 'safe',
    async verifyOutcome() { verifierCalls++; throw new Error('must not run'); }
  });
  A.eq(safe.decision, 'RETRY_ALLOWED', 'pre-dispatch durable state remains directly restartable');
  A.eq(verifierCalls, 0, 'safe restart never calls an external verifier unnecessarily');

  verifierCalls = 0;
  const claimed = await reconcileManagedRecovery({
    store: { recovery(id) { return recovery(id, 'resume-claimed', { recoveryClaimId: 'claim-1' }); } }, taskId: 'claimed',
    async verifyOutcome() { verifierCalls++; }
  });
  A.eq(claimed.decision, 'VERIFY_CLAIM_OWNER', 'active claim stays blocked on claim ownership');
  A.eq(verifierCalls, 0, 'claim ownership is not guessed from provider evidence');

  const noVerifier = await reconcileManagedRecovery({ store, taskId: 'task-2' });
  A.eq(noVerifier.decision, 'FREEZE_UNKNOWN', 'missing verifier freezes post-boundary recovery');
  A.eq(noVerifier.reason, 'authoritative-verifier-unavailable', 'missing verifier is explicit');

  const verifierFailure = await reconcileManagedRecovery({
    store, taskId: 'task-3',
    async verifyOutcome() { throw new Error('provider unavailable'); }
  });
  A.eq(verifierFailure.decision, 'FREEZE_UNKNOWN', 'verifier failure never becomes not-applied');
  A.eq(verifierFailure.retryAllowed, false, 'verifier failure freezes retry');
  A.eq(verifierFailure.reason, 'authoritative-verifier-failed', 'verifier failure is machine-readable');

  const mismatch = await reconcileManagedRecovery({
    store: { recovery() { return recovery('different-task', 'dispatch'); } }, taskId: 'task-4',
    async verifyOutcome() { throw new Error('must not run'); }
  });
  A.eq(mismatch.decision, 'FREEZE_UNKNOWN', 'store identity mismatch freezes before verification');
  A.eq(mismatch.reason, 'recovery-task-identity-mismatch', 'store identity mismatch is explicit');

  const forgedEvidence = await reconcileManagedRecovery({
    store, taskId: 'task-5',
    async verifyOutcome(request) {
      return { taskId: request.taskId, actionId: 'wrong-action', authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED' };
    }
  });
  A.eq(forgedEvidence.decision, 'FREEZE_UNKNOWN', 'mismatched verifier evidence cannot unlock retry');
  A.eq(forgedEvidence.retryAllowed, false, 'mismatched action evidence freezes retry');

  const notApplied = await reconcileManagedRecovery({
    store, taskId: 'task-6',
    async verifyOutcome(request) {
      return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED', providerRef: 'provider:6' };
    }
  });
  A.eq(notApplied.decision, 'RETRY_ALLOWED', 'only authoritative not-applied evidence unlocks post-boundary retry');
  A.eq(notApplied.retryAllowed, true, 'confirmed not-applied result permits controlled retry');

  A.report('managed-recovery-reconciliation-runner.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
