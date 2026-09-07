'use strict';

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
    findings: Array.isArray(result.findings) ? result.findings : [],
    riskFlags: Array.isArray(result.riskFlags) ? result.riskFlags : [],
    acceptanceCriteria: Array.isArray(args.acceptanceCriteria) ? args.acceptanceCriteria : [],
    artifacts: Array.isArray(envelope.artifacts) ? envelope.artifacts : [],
    sources: Array.isArray(envelope.sources) ? envelope.sources : [],
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt)
  };
}

function attachTaskHistory(tool, store, clock) {
  if (!tool || typeof tool.run !== 'function') throw new Error('managed tool required');
  if (!store || typeof store.record !== 'function') return tool;
  clock = clock || { now() { return Date.now(); } };
  const originalRun = tool.run.bind(tool);
  return Object.assign({}, tool, {
    run: async (args, ctx) => {
      const startedAt = Number(clock.now());
      let out;
      try {
        out = await originalRun(args, ctx);
      } catch (error) {
        const completedAt = Number(clock.now());
        try { store.record(rowFromManaged(args, ctx, { accepted: false, stage: 'dispatch', error: String(error && error.message || error) }, startedAt, completedAt)); } catch (_) {}
        throw error;
      }
      const completedAt = Number(clock.now());
      let parsed = null;
      try { parsed = out && typeof out.content === 'string' ? JSON.parse(out.content) : null; } catch (_) {}
      try { store.record(rowFromManaged(args, ctx, parsed || { accepted: false, stage: 'dispatch' }, startedAt, completedAt)); } catch (_) {}
      return out;
    }
  });
}

module.exports = { statusFor, rowFromManaged, attachTaskHistory };
