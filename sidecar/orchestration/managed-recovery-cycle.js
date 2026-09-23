'use strict';

const { runManagedRecoveryBatch } = require('./managed-recovery-scheduler.js');
const { reconcileAndPersistManagedRecovery } = require('./managed-recovery-transaction.js');

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

function leadId(opts) {
  const explicit = String(opts && opts.leadAgentId || '').trim();
  if (explicit) return explicit;
  return String(opts && opts.ambientCtx && opts.ambientCtx.agentId || '').trim();
}

/* One bounded lifecycle cycle. If the host has an authoritative outcome verifier, first
   reconcile uncertain post-boundary tasks in the same task-history store. Then run the
   existing SAFE_RESTART scheduler, which can immediately consume a newly persisted
   NOT_APPLIED confirmation. Without a verifier this is exactly the legacy safe-only path. */
async function runManagedRecoveryCycle(opts) {
  opts = opts || {};
  if (typeof opts.verifyOutcome !== 'function') return runManagedRecoveryBatch(opts);

  const store = opts.store;
  const activeLead = leadId(opts);
  const limit = clampLimit(opts.limit);
  if (!store || typeof store.listRecoveries !== 'function' || typeof store.recovery !== 'function' || typeof store.commitRecoveryReconciliation !== 'function') {
    return { ok: false, phase: 'preflight', reason: 'recovery-reconciliation-authority-unavailable', executionMayHaveStarted: false, items: [] };
  }
  if (!activeLead) return { ok: false, phase: 'preflight', reason: 'recovery-lead-agent-required', executionMayHaveStarted: false, items: [] };

  let discovered;
  try {
    discovered = await store.listRecoveries({ disposition: 'RECONCILE_BEFORE_RETRY', leadAgentId: activeLead }, { limit });
  } catch (error) {
    return { ok: false, phase: 'preflight', reason: 'recovery-reconciliation-discovery-failed', executionMayHaveStarted: false, error: String(error && error.message || error), items: [] };
  }
  if (!discovered || typeof discovered !== 'object' || !Array.isArray(discovered.items)) {
    return { ok: false, phase: 'preflight', reason: 'recovery-reconciliation-discovery-invalid', executionMayHaveStarted: false, items: [] };
  }

  const reconciled = [];
  for (const candidate of discovered.items.slice(0, limit)) {
    const taskId = String(candidate && candidate.taskId || '').trim();
    const checkpoint = candidate && candidate.checkpoint;
    if (!taskId || !checkpoint || String(checkpoint.taskId || '').trim() !== taskId) {
      reconciled.push({ taskId, ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, reason: 'recovery-candidate-task-identity-mismatch' });
      continue;
    }
    if (String(checkpoint.leadAgentId || '').trim() !== activeLead) {
      reconciled.push({ taskId, ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, reason: 'recovery-lead-authority-mismatch' });
      continue;
    }
    const result = await reconcileAndPersistManagedRecovery({
      store,
      taskId,
      verifyOutcome(request) { return opts.verifyOutcome(request, candidate); }
    });
    reconciled.push(Object.assign({ taskId }, result || { ok: false, decision: 'FREEZE_UNKNOWN', retryAllowed: false, reason: 'reconciliation-empty-result' }));
  }

  const execution = await runManagedRecoveryBatch(opts);
  return {
    ok: reconciled.every(row => row && row.ok === true) && execution.ok === true,
    phase: 'cycle',
    executionMayHaveStarted: execution.items && execution.items.some(row => row && row.executionMayHaveStarted === true) || false,
    reconciliation: { discovered: discovered.items.slice(0, limit).length, truncated: discovered.truncated === true, items: reconciled },
    execution
  };
}

module.exports = { runManagedRecoveryCycle };
