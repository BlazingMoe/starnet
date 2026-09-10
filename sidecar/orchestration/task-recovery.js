'use strict';

const { recoveryDisposition } = require('./task-history.js');

function buildManagedResumeRequest(recovery) {
  recovery = recovery || {};
  const checkpoint = recovery.checkpoint;
  if (recovery.state !== 'RESUME_REQUIRED' || !checkpoint || typeof checkpoint !== 'object') {
    return { ok: false, reason: recovery.state === 'TERMINAL' ? 'terminal-task' : 'no-resumable-checkpoint' };
  }

  const disposition = recoveryDisposition(checkpoint);
  if (disposition.disposition !== 'SAFE_RESTART') {
    return {
      ok: false,
      reason: 'reconciliation-required',
      disposition: disposition.disposition,
      executionMayHaveStarted: disposition.executionMayHaveStarted
    };
  }

  if (checkpoint.schemaVersion !== 'moe.managed-task-checkpoint.v1') {
    return { ok: false, reason: 'unsupported-checkpoint-schema' };
  }

  const taskId = String(checkpoint.taskId || '');
  const leadAgentId = String(checkpoint.leadAgentId || '');
  const workerAgentId = String(checkpoint.workerAgentId || '');
  const objective = String(checkpoint.objective || '');
  if (!taskId || !leadAgentId || !workerAgentId || !objective) {
    return { ok: false, reason: 'incomplete-recovery-contract' };
  }

  const args = {
    taskId,
    parentTaskId: String(checkpoint.parentTaskId || ''),
    agentId: workerAgentId,
    objective,
    acceptanceCriteria: Array.isArray(checkpoint.acceptanceCriteria) ? checkpoint.acceptanceCriteria.slice() : [],
    tags: Array.isArray(checkpoint.tags) ? checkpoint.tags.slice() : [],
    requireAudit: checkpoint.requireAudit === true,
    maxRevisions: Number.isFinite(Number(checkpoint.maxRevisions)) ? Number(checkpoint.maxRevisions) : 0
  };
  if (checkpoint.deadlineAt != null) args.deadlineAt = Number(checkpoint.deadlineAt);
  if (checkpoint.budgetUsd != null) args.budgetUsd = Number(checkpoint.budgetUsd);
  if (checkpoint.auditorAgentId) args.auditorAgentId = String(checkpoint.auditorAgentId);

  return {
    ok: true,
    disposition: 'SAFE_RESTART',
    executionMayHaveStarted: false,
    taskId,
    leadAgentId,
    originalParentRunId: String(checkpoint.parentRunId || ''),
    args,
    derivedFrom: 'moe.managed-task-checkpoint.v1'
  };
}

function buildManagedResumeContext(request, ambientCtx) {
  request = request || {};
  if (request.ok !== true || request.disposition !== 'SAFE_RESTART') {
    return { ok: false, reason: 'invalid-resume-request' };
  }

  const leadAgentId = String(request.leadAgentId || '');
  const parentRunId = String(request.originalParentRunId || '');
  if (!leadAgentId || !parentRunId) {
    return { ok: false, reason: 'incomplete-resume-provenance' };
  }

  const ctx = Object.assign({}, ambientCtx || {}, {
    agentId: leadAgentId,
    runId: parentRunId,
    managedRecovery: Object.freeze({
      taskId: String(request.taskId || ''),
      disposition: 'SAFE_RESTART',
      derivedFrom: String(request.derivedFrom || '')
    })
  });

  return {
    ok: true,
    ctx,
    provenance: {
      leadAgentId,
      parentRunId,
      source: String(request.derivedFrom || '')
    }
  };
}

/* Build the exact replay contract/provenance first, then atomically claim the same task in
   the authoritative history store. This closes the read -> claim TOCTOU window without
   inventing a second recovery queue. The returned plan is intentionally side-effect free:
   callers must still pass it through the normal registry/capability/consent path. */
function claimManagedSafeRestart(store, taskId, claimId, ambientCtx) {
  if (!store || typeof store.recovery !== 'function' || typeof store.claimSafeRestart !== 'function') {
    return { ok: false, reason: 'recovery-authority-unavailable' };
  }

  taskId = String(taskId || '');
  claimId = String(claimId || '');
  if (!taskId || !claimId) return { ok: false, reason: 'claim-identity-required' };

  let recovery;
  try { recovery = store.recovery(taskId); }
  catch (_) { return { ok: false, reason: 'recovery-read-failed' }; }

  const request = buildManagedResumeRequest(recovery);
  if (!request.ok) return request;
  const context = buildManagedResumeContext(request, ambientCtx);
  if (!context.ok) return context;

  let claim;
  try { claim = store.claimSafeRestart(taskId, claimId); }
  catch (_) { return { ok: false, reason: 'recovery-claim-failed' }; }
  if (!claim || claim.ok !== true) {
    return {
      ok: false,
      reason: (claim && claim.reason) || 'recovery-claim-failed',
      recovery: claim && claim.recovery ? claim.recovery : null
    };
  }

  const checkpoint = claim.checkpoint;
  if (!checkpoint || checkpoint.stage !== 'resume-claimed' || String(checkpoint.recoveryClaimId || '') !== claimId || String(checkpoint.taskId || '') !== taskId) {
    return { ok: false, reason: 'claimed-state-unverified' };
  }

  const managedRecovery = Object.freeze(Object.assign({}, context.ctx.managedRecovery || {}, { claimId }));
  return {
    ok: true,
    disposition: 'SAFE_RESTART',
    taskId,
    claimId,
    args: request.args,
    ctx: Object.assign({}, context.ctx, { managedRecovery }),
    provenance: context.provenance,
    claimedCheckpoint: Object.assign({}, checkpoint),
    executionMayHaveStarted: false,
    next: 'dispatch-through-authoritative-managed-tool'
  };
}

function recoveryBoundaryError(reason) {
  return {
    ok: false,
    isError: true,
    content: 'managed recovery dispatch blocked: ' + String(reason || 'recovery fence failed'),
    summary: 'managed-recovery-fence-failed',
    control: { final: true, reason: 'error', text: 'Managed recovery stopped before the tool ran because its durable dispatch fence failed.' }
  };
}

/* Execute an already-claimed SAFE_RESTART through the ordinary tool registry. The durable
   claim -> dispatch transition happens inside registry's final pre-tool boundary, so all
   capability/consent/pre-tool-hook refusals occur before we change the durable recovery
   disposition. Claims are released only when that boundary was provably never crossed. */
async function executeClaimedManagedRestart(registry, store, plan) {
  plan = plan || {};
  if (!registry || typeof registry.dispatch !== 'function') return { ok: false, reason: 'managed-registry-unavailable' };
  if (!store || typeof store.recovery !== 'function' || typeof store.fenceSafeRestartClaim !== 'function' || typeof store.releaseSafeRestartClaim !== 'function') {
    return { ok: false, reason: 'recovery-authority-unavailable' };
  }
  if (plan.ok !== true || plan.disposition !== 'SAFE_RESTART') return { ok: false, reason: 'invalid-claimed-restart' };

  const taskId = String(plan.taskId || '');
  const claimId = String(plan.claimId || '');
  if (!taskId || !claimId || !plan.args || String(plan.args.taskId || '') !== taskId || !plan.ctx) {
    return { ok: false, reason: 'invalid-claimed-restart' };
  }

  let current;
  try { current = store.recovery(taskId); }
  catch (_) { return { ok: false, reason: 'recovery-read-failed' }; }
  const checkpoint = current && current.checkpoint;
  if (!checkpoint || checkpoint.stage !== 'resume-claimed' || String(checkpoint.recoveryClaimId || '') !== claimId) {
    return { ok: false, reason: 'claim-not-owned', recovery: current || null };
  }

  let boundaryCrossed = false;
  const inheritedBoundary = typeof plan.ctx.beforeToolExecute === 'function' ? plan.ctx.beforeToolExecute : null;
  const dispatchCtx = Object.assign({}, plan.ctx, {
    beforeToolExecute: async (call, tool) => {
      if (!call || call.name !== 'team.delegate_managed' || !call.args || String(call.args.taskId || '') !== taskId) {
        return recoveryBoundaryError('managed recovery call identity changed');
      }

      let fenced;
      try { fenced = store.fenceSafeRestartClaim(taskId, claimId); }
      catch (_) { fenced = { ok: false, reason: 'recovery-fence-write-failed' }; }
      if (!fenced || fenced.ok !== true) return recoveryBoundaryError((fenced && fenced.reason) || 'recovery-fence-write-failed');
      boundaryCrossed = true;

      if (inheritedBoundary) {
        const inherited = await inheritedBoundary(call, tool);
        if (inherited && inherited.ok === false) return inherited;
      }
      return undefined;
    }
  });

  let result;
  try {
    result = await registry.dispatch({ name: 'team.delegate_managed', args: plan.args }, dispatchCtx);
  } catch (error) {
    result = { ok: false, isError: true, content: String(error && error.message || error), summary: 'managed-recovery-dispatch-threw' };
  }

  let claimReleased = false;
  let release = null;
  if (!boundaryCrossed) {
    try {
      release = store.releaseSafeRestartClaim(taskId, claimId);
      claimReleased = !!(release && release.ok === true);
    } catch (_) {
      release = { ok: false, reason: 'recovery-claim-release-failed' };
    }
  }

  let recovery = null;
  try { recovery = store.recovery(taskId); } catch (_) {}
  return {
    ok: !!(result && result.ok === true),
    taskId,
    claimId,
    result,
    claimReleased,
    release,
    boundaryCrossed,
    recovery,
    executionMayHaveStarted: recovery ? recovery.executionMayHaveStarted : (boundaryCrossed ? true : false)
  };
}

module.exports = { buildManagedResumeRequest, buildManagedResumeContext, claimManagedSafeRestart, executeClaimedManagedRestart };