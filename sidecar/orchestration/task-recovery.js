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

module.exports = { buildManagedResumeRequest, buildManagedResumeContext };
