'use strict';

const { runManagedRecoveryBatch } = require('./managed-recovery-scheduler.js');

/*
  Lifecycle adapter for one bounded recovery pass after the host has finished
  constructing the authoritative task-history store and tool registry.

  This owns no recovery truth, queue, retry state, timer, or telemetry. The
  closure only prevents one lifecycle hook instance from executing twice in the
  same process. Every task still comes from task-history discovery and is
  atomically re-claimed by the existing recovery runner before dispatch.
*/
function makeManagedRecoveryLifecycleHook(opts) {
  opts = opts || {};
  let invoked = false;

  return async function runLifecycleRecovery(ambientCtx) {
    if (invoked) {
      return {
        ok: true,
        phase: 'lifecycle',
        skipped: true,
        reason: 'managed-recovery-lifecycle-already-invoked',
        executionMayHaveStarted: false,
        items: []
      };
    }

    if (opts.enabled !== true) {
      invoked = true;
      return {
        ok: true,
        phase: 'lifecycle',
        skipped: true,
        reason: 'managed-recovery-lifecycle-disabled',
        executionMayHaveStarted: false,
        items: []
      };
    }

    if (!opts.store || typeof opts.store.listRecoveries !== 'function') {
      return {
        ok: false,
        phase: 'preflight',
        reason: 'recovery-discovery-unavailable',
        executionMayHaveStarted: false,
        items: []
      };
    }
    if (!opts.registry || typeof opts.registry.dispatch !== 'function') {
      return {
        ok: false,
        phase: 'preflight',
        reason: 'managed-registry-unavailable',
        executionMayHaveStarted: false,
        items: []
      };
    }
    if (typeof opts.claimIdFor !== 'function') {
      return {
        ok: false,
        phase: 'preflight',
        reason: 'recovery-claim-id-authority-required',
        executionMayHaveStarted: false,
        items: []
      };
    }

    // Reserve the hook before entering scheduler code. Unknown exceptions stay consumed
    // conservatively because execution may have progressed farther than the thrown error
    // proves. Only an explicit scheduler preflight result that says execution could not
    // have started is safe to release for a later lifecycle retry.
    invoked = true;
    const result = await runManagedRecoveryBatch({
      store: opts.store,
      registry: opts.registry,
      claimIdFor: opts.claimIdFor,
      limit: opts.limit,
      leadAgentId: opts.leadAgentId,
      ambientCtx: ambientCtx || opts.ambientCtx || {},
      ambientCtxFor: opts.ambientCtxFor
    });
    if (result && result.phase === 'preflight' && result.executionMayHaveStarted === false) invoked = false;
    return result;
  };
}

module.exports = { makeManagedRecoveryLifecycleHook };
