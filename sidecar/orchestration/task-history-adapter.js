'use strict';

const { note: failNote } = require('../failopen.js');

function statusFor(result) {
  if (!result || typeof result !== 'object') return 'dispatch_error';
  if (result.accepted === true) return 'accepted';
  if (result.stage === 'contract') return 'contract_error';
  if (result.stage === 'dispatch' || result.stage === 'revision') return 'dispatch_error';
  if (result.stage === 'audit') return 'audit_error';
  if (result.action === 'revise') return 'revised';
  return 'rejected';
}

function rowFromManaged(args, ctx, result, startedAt, completedAt) {
  args = args || {}; ctx = ctx || {}; result = result || {};
  const envelope = result.result && typeof result.result === 'object' ? result.result : {};
  return {
    taskId: String(result.taskId || args.taskId || ''),
    parentTaskId: String(args.parentTaskId || ''),
    parentRunId: String(ctx.runId || ''),
    leadAgentId: String(ctx.agentId || ''),
    workerAgentId: String(result.workerAgentId || args.agentId || ''),
    auditorAgentId: String(result.auditorAgentId || args.auditorAgentId || ''),
    objective: String(args.objective || ''),
    status: statusFor(result),
    stage: String(result.stage || (result.accepted ? 'accepted' : 'formal-review')),
    accepted: result.accepted === true,
    attempts: Number(result.attempts || 0),
    usd: Number(result.usd || 0),
    workerUsd: Number(result.workerUsd || 0),
    auditUsd: Number(result.auditUsd || 0),
    budgetUsd: result.budgetUsd == null ? null : Number(result.budgetUsd),
    budgetExceeded: result.budgetExceeded === true,
    findings: Array.isArray(result.findings) ? result.findings : [],
    riskFlags: Array.isArray(result.riskFlags) ? result.riskFlags : [],
    reason: String(result.reason || ''),
    error: String(result.error || ''),
    acceptanceCriteria: Array.isArray(args.acceptanceCriteria) ? args.acceptanceCriteria : [],
    artifacts: Array.isArray(envelope.artifacts) ? envelope.artifacts : [],
    sources: Array.isArray(envelope.sources) ? envelope.sources : [],
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt)
  };
}

function liveEntry(args, ctx, startedAt) {
  args = args || {}; ctx = ctx || {};
  return {
    taskId: String(args.taskId || ''),
    parentTaskId: String(args.parentTaskId || ''),
    parentRunId: String(ctx.runId || ''),
    leadAgentId: String(ctx.agentId || ''),
    workerAgentId: String(args.agentId || ''),
    auditorAgentId: String(args.auditorAgentId || ''),
    objective: String(args.objective || ''),
    stage: 'dispatch',
    startedAt
  };
}

function attachTaskHistory(tool, store, clock) {
  if (!tool || typeof tool.run !== 'function') throw new Error('managed tool required');
  if (!store || typeof store.record !== 'function') return tool;
  if (!clock || typeof clock.now !== 'function') throw new Error('task history adapter requires injected clock');
  const originalRun = tool.run.bind(tool);
  return Object.assign({}, tool, {
    run: async (args, ctx) => {
      const startedAt = Number(clock.now());
      let liveToken = '';
      if (typeof store.activeBegin === 'function') {
        try { liveToken = store.activeBegin(liveEntry(args, ctx, startedAt)) || ''; }
        catch (error) { failNote('managed.history.active_begin', error); }
      }

      const executionCtx = Object.assign({}, ctx || {});
      if (liveToken && typeof store.activeUpdate === 'function') {
        executionCtx.reportManagedTaskStage = (stage, patch) => {
          const next = Object.assign({}, patch || {}, { stage: String(stage || '') });
          try { store.activeUpdate(liveToken, next); }
          catch (error) { failNote('managed.history.active_update', error); }
        };
      }

      let out;
      try {
        try {
          out = await originalRun(args, executionCtx);
        } catch (error) {
          const completedAt = Number(clock.now());
          try { store.record(rowFromManaged(args, ctx, { accepted: false, stage: 'dispatch', error: String(error && error.message || error) }, startedAt, completedAt)); }
          catch (recordError) { failNote('managed.history.record_error', recordError); }
          throw error;
        }
        const completedAt = Number(clock.now());
        let parsed = null;
        try { parsed = out && typeof out.content === 'string' ? JSON.parse(out.content) : null; }
        catch (_) { parsed = null; }
        try { store.record(rowFromManaged(args, ctx, parsed || { accepted: false, stage: 'dispatch' }, startedAt, completedAt)); }
        catch (recordError) { failNote('managed.history.record_complete', recordError); }
        return out;
      } finally {
        if (liveToken && typeof store.activeEnd === 'function') {
          try { store.activeEnd(liveToken); }
          catch (error) { failNote('managed.history.active_end', error); }
        }
      }
    }
  });
}

module.exports = { statusFor, rowFromManaged, liveEntry, attachTaskHistory };
