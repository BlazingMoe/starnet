'use strict';

const { reconcileManagedRecovery } = require('./managed-recovery-reconciliation-runner.js');
const { persistManagedRecoveryDecision } = require('./managed-recovery-persistence.js');

/* End-to-end reconciliation seam: verification first, durable atomic commit second.
   A post-boundary retry is never returned as allowed unless its NOT_APPLIED decision has
   been accepted by the authoritative store. This function still does not execute retry. */
async function reconcileAndPersistManagedRecovery(opts) {
  opts = opts || {};
  const decision = await reconcileManagedRecovery(opts);

  // Non-reconciliation states (claim ownership, missing evidence, terminal) are already
  // durable or blocked and must not be converted into new records here.
  if (decision.decision !== 'CONTINUE_CONFIRMED' && decision.decision !== 'RETRY_ALLOWED' && decision.decision !== 'FREEZE_UNKNOWN') {
    return Object.assign({}, decision, { persisted: false, retryAllowed: false });
  }

  const persisted = await persistManagedRecoveryDecision({ store: opts.store, taskId: opts.taskId, decision });
  if (!persisted.ok) {
    return {
      ok: false,
      decision: 'FREEZE_UNKNOWN',
      persisted: false,
      retryAllowed: false,
      executionMayHaveStarted: decision.executionMayHaveStarted,
      outcome: decision.outcome || 'UNKNOWN',
      reason: persisted.reason
    };
  }

  return Object.assign({}, decision, {
    persisted: persisted.persisted,
    retryAllowed: persisted.retryAllowed,
    durableRecord: persisted.record || null
  });
}

module.exports = { reconcileAndPersistManagedRecovery };
