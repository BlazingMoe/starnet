/* sidecar/tools/builtin/managed-orchestration.js — contract/review wrapper around inherited team.dispatch.
   Security invariant: this tool carries the SAME orchestrator capability + execute scope + consent requirement as
   team.dispatch. It does not call runOnce directly, grant capabilities, or bypass worker tool permissions. */
'use strict';
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../../orchestration/delegation-adapter.js') : (root.SK && root.SK.delegationAdapter),
    typeof require === 'function' ? require('../../orchestration/quality-pipeline.js') : (root.SK && root.SK.qualityPipeline),
    typeof require === 'function' ? require('../../orchestration/auditor.js') : (root.SK && root.SK.auditor),
    typeof require === 'function' ? require('../../orchestration/review-gate.js') : (root.SK && root.SK.reviewGate)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SK = root.SK || {}; root.SK.tools = root.SK.tools || {}; (root.SK.tools.builtin = root.SK.tools.builtin || {}).managedOrchestration = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (delegationAdapter, qualityPipeline, auditor, reviewGate) {
  'use strict';

  const RESULT_ENVELOPE_SCHEMA = Object.freeze({
    type: 'object', additionalProperties: false,
    required: ['taskId', 'agentId', 'status', 'summary', 'output', 'artifacts', 'sources', 'blockers', 'acceptance', 'provenance'],
    properties: {
      taskId: { type: 'string' },
      agentId: { type: 'string' },
      status: { type: 'string', enum: ['completed', 'partial', 'blocked', 'failed'] },
      summary: { type: 'string' },
      output: { type: 'string' },
      artifacts: { type: 'array', items: { type: 'string' } },
      sources: { type: 'array', items: { type: 'string' } },
      blockers: { type: 'array', items: { type: 'string' } },
      acceptance: {
        type: 'array', items: {
          type: 'object', additionalProperties: false,
          required: ['criterion', 'passed', 'evidence'],
          properties: { criterion: { type: 'string' }, passed: { type: 'boolean' }, evidence: { type: 'string' } }
        }
      },
      provenance: { type: 'object' }
    }
  });

  function parseRows(out) {
    if (!out || typeof out.content !== 'string') return { ok: false, error: 'dispatch returned no content' };
    let rows;
    try { rows = JSON.parse(out.content); } catch (e) { return { ok: false, error: 'dispatch result is not JSON: ' + ((e && e.message) || e) }; }
    if (!Array.isArray(rows) || !rows.length) return { ok: false, error: 'dispatch returned no worker rows' };
    return { ok: true, rows };
  }

  function parseEnvelope(row) {
    if (!row || typeof row.result !== 'string') return { ok: false, error: 'worker returned no structured result' };
    try { return { ok: true, value: JSON.parse(row.result) }; }
    catch (e) { return { ok: false, error: 'worker result is not strict JSON: ' + ((e && e.message) || e) }; }
  }

  function agentRecord(roster, id, fallbackRole) {
    const raw = roster && typeof roster.get === 'function' ? roster.get(id) : null;
    return Object.assign({ id: id, agentId: id, role: fallbackRole || 'specialist' }, raw || {});
  }

  function reportStage(ctx, stage, patch) {
    if (!ctx || typeof ctx.reportManagedTaskStage !== 'function') return;
    try { ctx.reportManagedTaskStage(stage, patch || {}); } catch (_) {}
  }

  function makeManagedOrchestrationTool(deps) {
    deps = deps || {};
    const dispatchTool = deps.dispatchTool;
    const rosterFn = typeof deps.roster === 'function' ? deps.roster : function () { return new Map(); };
    const clock = deps.clock || null;
    if (!dispatchTool || typeof dispatchTool.run !== 'function') throw new Error('managed orchestration requires inherited dispatchTool');
    function completedAt() {
      if (!clock || typeof clock.now !== 'function') throw new Error('managed orchestration requires injected clock');
      const value = Number(clock.now());
      if (!Number.isFinite(value)) throw new Error('managed orchestration clock returned non-finite time');
      return value;
    }

    async function dispatchOne(worker, ctx) {
      const out = await dispatchTool.run({ workers: [worker], parallel: false, background: false }, ctx);
      const parsed = parseRows(out);
      if (!parsed.ok) return { ok: false, error: parsed.error, raw: out };
      const row = parsed.rows[0];
      if (!row || row.reason === 'error' || row.reason === 'not-dispatched') {
        return { ok: false, error: String((row && row.result) || 'worker dispatch failed'), row };
      }
      return { ok: true, row };
    }

    const tool = {
      name: 'team.delegate_managed', capability: 'orchestrator', scope: 'execute', requiresConsent: true,
      timeoutMs: Number(dispatchTool.timeoutMs) || 0,
      description: 'Delegate one consequential subtask under a typed task contract. The worker must return a strict result envelope; the host checks acceptance criteria and can optionally send the result to a distinct independent auditor. This tool is stricter than team.dispatch and is preferred when correctness, provenance, budget, or review matters.',
      schema: {
        type: 'object', additionalProperties: false,
        required: ['taskId', 'agentId', 'objective'],
        properties: {
          taskId: { type: 'string' },
          parentTaskId: { type: 'string' },
          agentId: { type: 'string' },
          objective: { type: 'string' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          deadlineAt: { type: 'number' },
          budgetUsd: { type: 'number' },
          requireAudit: { type: 'boolean' },
          auditorAgentId: { type: 'string' },
          maxRevisions: { type: 'integer' }
        }
      },
      run: async (args, ctx) => {
        args = args || {}; ctx = ctx || {};
        reportStage(ctx, 'contract');
        const leadId = String(ctx.agentId || '');
        const workerId = String(args.agentId || '');
        const roster = rosterFn() || new Map();
        const lead = agentRecord(roster, leadId, 'orchestrator');
        const worker = agentRecord(roster, workerId, 'specialist');
        if (!leadId) return { content: JSON.stringify({ accepted: false, stage: 'contract', error: 'lead agentId missing' }), summary: 'contract rejected' };
        if (!workerId || !roster.has(workerId)) return { content: JSON.stringify({ accepted: false, stage: 'contract', error: 'target worker is not in the live roster' }), summary: 'contract rejected' };

        const prepared = delegationAdapter.prepareWorker({
          fromAgent: lead,
          toAgent: worker,
          contract: {
            id: args.taskId,
            parentTaskId: args.parentTaskId,
            objective: args.objective,
            acceptanceCriteria: args.acceptanceCriteria || [],
            tags: args.tags || [],
            deadlineAt: args.deadlineAt,
            budgetUsd: args.budgetUsd,
            provenance: { parentRunId: ctx.runId || '', surface: 'team.delegate_managed' }
          }
        });
        if (!prepared.ok) return { content: JSON.stringify({ accepted: false, stage: 'contract', errors: prepared.errors || ['invalid contract'] }), summary: 'contract rejected' };
        const contract = prepared.value.taskContract;
        const maxRevisions = Math.max(0, Math.min(3, Number.isFinite(Number(args.maxRevisions)) ? Math.floor(Number(args.maxRevisions)) : 1));

        async function runWorker(prompt, context) {
          reportStage(ctx, 'dispatch');
          const d = await dispatchOne({ agentId: workerId, prompt, context, resultSchema: RESULT_ENVELOPE_SCHEMA }, ctx);
          if (!d.ok) return d;
          const env = parseEnvelope(d.row);
          if (!env.ok) return { ok: false, error: env.error, row: d.row };
          return { ok: true, row: d.row, envelope: env.value };
        }

        let attempt = 0;
        let current = await runWorker(prepared.value.prompt, prepared.value.context);
        if (!current.ok) return { content: JSON.stringify({ accepted: false, stage: 'dispatch', error: current.error, attempts: 1 }), summary: 'managed dispatch failed' };

        while (true) {
          reportStage(ctx, 'formal-review');
          const formal = reviewGate.review(contract, current.envelope, { spentUsd: current.row.usd, completedAt: completedAt() });
          if ((formal && formal.accepted) || attempt >= maxRevisions) break;
          const brief = reviewGate.revisionBrief(formal);
          attempt++;
          reportStage(ctx, 'revision');
          const revisionPrompt = contract.objective + '\n\n' + brief + '\n\nReturn a COMPLETE replacement result envelope for taskId ' + contract.id + ', not a patch or commentary.';
          current = await runWorker(revisionPrompt, prepared.value.context);
          if (!current.ok) return { content: JSON.stringify({ accepted: false, stage: 'revision', error: current.error, attempts: attempt + 1 }), summary: 'managed revision failed' };
        }

        const requireAudit = args.requireAudit === true;
        let auditorId = String(args.auditorAgentId || '');
        if (requireAudit && (!auditorId || !roster.has(auditorId))) {
          reportStage(ctx, 'audit', { auditorAgentId: auditorId });
          return { content: JSON.stringify({ accepted: false, stage: 'audit', error: 'required auditor is not in the live roster', taskId: contract.id }), summary: 'auditor unavailable' };
        }
        if (requireAudit && (auditorId === workerId || auditorId === leadId)) {
          reportStage(ctx, 'audit', { auditorAgentId: auditorId });
          return { content: JSON.stringify({ accepted: false, stage: 'audit', error: 'auditor must be independent from lead and worker', taskId: contract.id }), summary: 'auditor invalid' };
        }

        const runAuditor = requireAudit ? async (auditReq) => {
          reportStage(ctx, 'audit', { auditorAgentId: auditorId });
          const d = await dispatchOne({ agentId: auditorId, prompt: auditReq.prompt, resultSchema: auditReq.resultSchema }, ctx);
          if (!d.ok) throw new Error(d.error || 'auditor dispatch failed');
          let value;
          try { value = JSON.parse(String(d.row.result || '')); } catch (e) { throw new Error('auditor returned invalid JSON'); }
          return value;
        } : null;

        const quality = await qualityPipeline.evaluate({
          contract,
          envelope: current.envelope,
          spentUsd: current.row.usd,
          completedAt: completedAt(),
          requireAudit,
          runAuditor
        });

        const qualityStage = quality.stage;
        const projectedStage = qualityStage === 'formal' ? 'formal-review' : qualityStage;
        const finalStage = quality.accepted ? 'accepted' : projectedStage;
        reportStage(ctx, finalStage, requireAudit ? { auditorAgentId: auditorId } : null);

        return {
          content: JSON.stringify({
            accepted: !!quality.accepted,
            stage: finalStage,
            qualityStage: qualityStage,
            action: quality.action,
            taskId: contract.id,
            workerAgentId: workerId,
            auditorAgentId: requireAudit ? auditorId : null,
            attempts: attempt + 1,
            usd: Number(current.row.usd || 0),
            result: current.envelope,
            formal: quality.formal,
            audit: quality.audit && quality.audit.ok ? quality.audit.value : null,
            findings: quality.findings || [],
            riskFlags: quality.riskFlags || [],
            reason: quality.reason || null
          }),
          summary: quality.accepted ? 'managed task accepted' : ('managed task ' + (quality.action || 'rejected'))
        };
      }
    };

    return { managedDispatchTool: tool, RESULT_ENVELOPE_SCHEMA };
  }

  return { makeManagedOrchestrationTool, RESULT_ENVELOPE_SCHEMA };
});
