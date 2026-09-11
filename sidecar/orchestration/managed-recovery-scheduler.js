'use strict';

const { restartManagedTask } = require('./managed-recovery-runner.js');

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

/* Execute a bounded snapshot of SAFE_RESTART candidates directly from the authoritative
   task-history store. This is intentionally not a queue: it owns no durable state, timers,
   retries, leases, or telemetry. Every candidate is claimed again by restartManagedTask(),
   so stale discovery results cannot bypass the atomic recovery claim. */
async function runManagedRecoveryBatch(opts) {
  opts = opts || {};
  const store = opts.store;
  const registry = opts.registry;
  const claimIdFor = opts.claimIdFor;
  const limit = clampLimit(opts.limit);

  if (!store || typeof store.listRecoveries !== 'function') {
    return { ok: false, phase: 'preflight', reason: 'recovery-discovery-unavailable', executionMayHaveStarted: false, items: [] };
  }
  if (!registry || typeof registry.dispatch !== 'function') {
    return { ok: false, phase: 'preflight', reason: 'managed-registry-unavailable', executionMayHaveStarted: false, items: [] };
  }
  if (typeof claimIdFor !== 'function') {
    return { ok: false, phase: 'preflight', reason: 'recovery-claim-id-authority-required', executionMayHaveStarted: false, items: [] };
  }

  const discovered = store.listRecoveries({ disposition: 'SAFE_RESTART' }, { limit });
  const candidates = discovered && Array.isArray(discovered.items) ? discovered.items.slice(0, limit) : [];
  const results = [];

  for (const candidate of candidates) {
    const taskId = candidate && String(candidate.taskId || '');
    if (!taskId) continue;

    let claimId = '';
    try {
      claimId = String(claimIdFor(candidate) || '');
    } catch (error) {
      results.push({ taskId, ok: false, phase: 'preflight', reason: 'recovery-claim-id-failed', executionMayHaveStarted: false, error: String(error && error.message || error) });
      continue;
    }
    if (!claimId) {
      results.push({ taskId, ok: false, phase: 'preflight', reason: 'recovery-claim-id-required', executionMayHaveStarted: false });
      continue;
    }

    const ambientCtx = typeof opts.ambientCtxFor === 'function'
      ? (opts.ambientCtxFor(candidate) || {})
      : (opts.ambientCtx || {});
    const result = await restartManagedTask({ registry, store, taskId, claimId, ambientCtx });
    results.push(Object.assign({ taskId, claimId }, result || { ok: false, reason: 'managed-recovery-runner-empty-result' }));
  }

  return {
    ok: results.every(row => row && row.ok === true),
    phase: 'batch',
    discovered: candidates.length,
    processed: results.length,
    truncated: discovered ? discovered.truncated === true : false,
    items: results
  };
}

module.exports = { runManagedRecoveryBatch };
