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

    invoked = true;
    return runManagedRecoveryBatch({
      store: opts.store,
      registry: opts.registry,
      claimIdFor: opts.claimIdFor,
      limit: opts.limit,
      leadAgentId: opts.leadAgentId,
      ambientCtx: ambientCtx || opts.ambientCtx || {},
      ambientCtxFor: opts.ambientCtxFor
    });
  };
}

module.exports = { makeManagedRecoveryLifecycleHook };
