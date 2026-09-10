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

  return {
    ok: true,
    disposition: 'SAFE_RESTART',
    taskId,
    claimId,
    args: request.args,
    ctx: context.ctx,
    provenance: context.provenance,
    claimedCheckpoint: Object.assign({}, checkpoint),
    executionMayHaveStarted: false,
    next: 'dispatch-through-authoritative-managed-tool'
  };
}

module.exports = { buildManagedResumeRequest, buildManagedResumeContext, claimManagedSafeRestart };
