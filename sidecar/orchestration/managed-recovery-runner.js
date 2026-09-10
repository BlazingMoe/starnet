'use strict';

const {
  claimManagedSafeRestart,
  executeClaimedManagedRestart
} = require('./task-recovery.js');

/* One narrow orchestration seam for SAFE_RESTART execution. Preflight every host primitive
   needed after a claim before touching durable recovery state, so configuration errors cannot
   strand a resume-claimed checkpoint. The task-history store remains the sole recovery
   authority; this module owns no queue, lease table, or execution telemetry. */
async function restartManagedTask(opts) {
  opts = opts || {};
  const registry = opts.registry;
  const store = opts.store;
  const taskId = String(opts.taskId || '');
  const claimId = String(opts.claimId || '');

  if (!registry || typeof registry.dispatch !== 'function') {
    return { ok: false, phase: 'preflight', reason: 'managed-registry-unavailable', executionMayHaveStarted: false };
  }
  if (!store ||
      typeof store.recovery !== 'function' ||
      typeof store.claimSafeRestart !== 'function' ||
      typeof store.fenceSafeRestartClaim !== 'function' ||
      typeof store.releaseSafeRestartClaim !== 'function') {
    return { ok: false, phase: 'preflight', reason: 'recovery-authority-unavailable', executionMayHaveStarted: false };
  }
  if (!taskId || !claimId) {
    return { ok: false, phase: 'preflight', reason: 'claim-identity-required', executionMayHaveStarted: false };
  }

  const plan = claimManagedSafeRestart(store, taskId, claimId, opts.ambientCtx || {});
  if (!plan || plan.ok !== true) {
    return Object.assign({ phase: 'claim', executionMayHaveStarted: false }, plan || { ok: false, reason: 'recovery-claim-failed' });
  }

  const executed = await executeClaimedManagedRestart(registry, store, plan);
  return Object.assign({ phase: 'dispatch' }, executed || { ok: false, reason: 'managed-recovery-dispatch-failed' });
}

module.exports = { restartManagedTask };
