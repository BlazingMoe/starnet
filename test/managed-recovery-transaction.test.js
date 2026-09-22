'use strict';
const A = require('./_assert.js');
const { reconcileAndPersistManagedRecovery } = require('../sidecar/orchestration/managed-recovery-transaction.js');

const schema = 'moe.managed-task-checkpoint.v1';
function recovery(taskId, stage, extra) {
  return { state: 'RESUME_REQUIRED', checkpoint: Object.assign({ schemaVersion: schema, taskId, stage }, extra || {}) };
}

(async () => {
  const writes = [];
  const store = {
    recovery(id) { return recovery(id, 'dispatch'); },
    async commitRecoveryReconciliation(record) { writes.push(record); return { ok: true, record }; }
  };

  let out = await reconcileAndPersistManagedRecovery({
    store, taskId: 'not-applied',
    async verifyOutcome(request) {
      return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED', providerRef: 'provider:not-applied' };
    }
  });
  A.eq(out.decision, 'RETRY_ALLOWED', 'confirmed not-applied outcome survives durable transaction');
  A.eq(out.persisted, true, 'post-boundary retry decision is durably committed');
  A.eq(out.retryAllowed, true, 'retry is exposed only after commit succeeds');
  A.eq(writes.length, 1, 'transaction performs exactly one reconciliation commit');

  out = await reconcileAndPersistManagedRecovery({
    store, taskId: 'applied',
    async verifyOutcome(request) {
      return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'APPLIED_CONFIRMED', providerRef: 'provider:applied' };
    }
  });
  A.eq(out.decision, 'CONTINUE_CONFIRMED', 'confirmed applied outcome is durable');
  A.eq(out.persisted, true, 'applied confirmation is committed before continuation');
  A.eq(out.retryAllowed, false, 'applied action is never replayed');

  const refusingStore = {
    recovery(id) { return recovery(id, 'dispatch'); },
    async commitRecoveryReconciliation() { return { ok: false, reason: 'stale-recovery-state' }; }
  };
  out = await reconcileAndPersistManagedRecovery({
    store: refusingStore, taskId: 'stale',
    async verifyOutcome(request) {
      return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: 'NOT_APPLIED_CONFIRMED' };
    }
  });
  A.eq(out.decision, 'FREEZE_UNKNOWN', 'stale atomic commit converts tentative retry into freeze');
  A.eq(out.retryAllowed, false, 'failed commit cannot leak retry permission');
  A.eq(out.reason, 'stale-recovery-state', 'atomic refusal remains visible');

  let commits = 0;
  out = await reconcileAndPersistManagedRecovery({
    store: {
      recovery(id) { return recovery(id, 'resume-claimed', { recoveryClaimId: 'claim-1' }); },
      async commitRecoveryReconciliation() { commits++; return { ok: true }; }
    },
    taskId: 'claimed', async verifyOutcome() { throw new Error('must not run'); }
  });
  A.eq(out.decision, 'VERIFY_CLAIM_OWNER', 'active claim stays on claim-resolution path');
  A.eq(commits, 0, 'claim ownership does not create reconciliation records');
  A.eq(out.retryAllowed, false, 'active claim cannot retry');

  const safeStore = {
    recovery(id) { return recovery(id, 'contract'); },
    async commitRecoveryReconciliation() { throw new Error('safe restart should not write'); }
  };
  out = await reconcileAndPersistManagedRecovery({ store: safeStore, taskId: 'safe' });
  A.eq(out.decision, 'RETRY_ALLOWED', 'safe pre-dispatch recovery remains restartable');
  A.eq(out.persisted, false, 'safe restart needs no reconciliation write');
  A.eq(out.retryAllowed, true, 'existing durable contract is sufficient for safe restart');

  A.report('managed-recovery-transaction.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
