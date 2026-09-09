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

  function money(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

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
      if (!parsed.ok) return { ok: false, reason: 'invalid-dispatch-response', error: parsed.error, raw: out, usd: 0 };
      const row = parsed.rows[0];
      if (!row) return { ok: false, reason: 'missing-dispatch-row', error: 'worker dispatch returned no row', row: null, usd: 0 };
      const reason = String(row.reason || 'unknown');
      const usd = money(row.usd);
      if (reason !== 'done') {
        return {
          ok: false,
          reason,
          error: String(row.result || ('worker dispatch ended with reason ' + reason)),
          row,
          usd
        };
      }
      return { ok: true, row, usd };
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
        args = args || {};
        ctx = ctx || {};
        reportStage(ctx, 'contract');

        const leadId = String(ctx.agentId || '');
        const workerId = String(args.agentId || '');
        const roster = rosterFn() || new Map();
        const lead = agentRecord(roster, leadId, 'orchestrator');
        const worker = agentRecord(roster, workerId, 'specialist');

        if (!leadId) {
          return { content: JSON.stringify({ accepted: false, stage: 'contract', error: 'lead agentId missing' }), summary: 'contract rejected' };
        }
        if (!workerId || !roster.has(workerId)) {
          return { content: JSON.stringify({ accepted: false, stage: 'contract', error: 'target worker is not in the live roster' }), summary: 'contract rejected' };
        }

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

        if (!prepared.ok) {
          return { content: JSON.stringify({ accepted: false, stage: 'contract', errors: prepared.errors || ['invalid contract'] }), summary: 'contract rejected' };
        }

        const contract = prepared.value.taskContract;
        const budgetUsd = contract.budgetUsd == null ? null : Number(contract.budgetUsd);
        const maxRevisions = Math.max(0, Math.min(3, Number.isFinite(Number(args.maxRevisions)) ? Math.floor(Number(args.maxRevisions)) : 1));

        let workerUsd = 0;
        let auditUsd = 0;

        function spendState() {
          const usd = workerUsd + auditUsd;
          return {
            usd,
            workerUsd,
            auditUsd,
            budgetUsd,
            budgetExceeded: budgetUsd != null && Number.isFinite(budgetUsd) && usd > budgetUsd
          };
        }

        async function runWorker(prompt, context, stage) {
          reportStage(ctx, stage || 'dispatch');
          const d = await dispatchOne({ agentId: workerId, prompt, context, resultSchema: RESULT_ENVELOPE_SCHEMA }, ctx);
          if (!d.ok) return d;
          const env = parseEnvelope(d.row);
          if (!env.ok) {
            return {
              ok: false,
              reason: 'invalid-result-envelope',
              error: env.error,
              row: d.row,
              usd: d.usd
            };
          }
          return { ok: true, row: d.row, envelope: env.value, usd: d.usd };
        }

        let attempt = 0;
        let current = await runWorker(prepared.value.prompt, prepared.value.context, 'dispatch');
        workerUsd += money(current.usd);

        if (!current.ok) {
          const spend = spendState();
          return {
            content: JSON.stringify(Object.assign({
              accepted: false,
              stage: 'dispatch',
              reason: current.reason || 'dispatch-failed',
              error: current.error,
              taskId: contract.id,
              workerAgentId: workerId,
              auditorAgentId: null,
              attempts: 1
            }, spend)),
            summary: 'managed dispatch failed'
          };
        }

        while (true) {
          reportStage(ctx, 'formal-review');
          const formal = reviewGate.review(contract, current.envelope, {
            spentUsd: workerUsd,
            completedAt: completedAt()
          });

          if ((formal && formal.accepted) || attempt >= maxRevisions || (formal && formal.retryable === false)) break;

          const brief = reviewGate.revisionBrief(formal);
          attempt++;
          const revisionPrompt = contract.objective + '\n\n' + brief + '\n\nReturn a COMPLETE replacement result envelope for taskId ' + contract.id + ', not a patch or commentary.';
          current = await runWorker(revisionPrompt, prepared.value.context, 'revision');
          workerUsd += money(current.usd);

          if (!current.ok) {
            const spend = spendState();
            return {
              content: JSON.stringify(Object.assign({
                accepted: false,
                stage: 'revision',
                reason: current.reason || 'revision-dispatch-failed',
                error: current.error,
                taskId: contract.id,
                workerAgentId: workerId,
                auditorAgentId: null,
                attempts: attempt + 1
              }, spend)),
              summary: 'managed revision failed'
            };
          }
        }

        const requireAudit = args.requireAudit === true;
        const auditorId = String(args.auditorAgentId || '');
        let auditConfigReason = '';
        let auditConfigError = '';

        if (requireAudit && (!auditorId || !roster.has(auditorId))) {
          auditConfigReason = 'auditor-unavailable';
          auditConfigError = 'required auditor is not in the live roster';
        } else if (requireAudit && (auditorId === workerId || auditorId === leadId)) {
          auditConfigReason = 'auditor-not-independent';
          auditConfigError = 'auditor must be independent from lead and worker';
        }

        let auditDispatchReason = '';
        const runAuditor = requireAudit ? async (auditReq) => {
          reportStage(ctx, 'audit', { auditorAgentId: auditorId });

          if (auditConfigReason) {
            auditDispatchReason = auditConfigReason;
            throw new Error(auditConfigError);
          }

          const d = await dispatchOne({
            agentId: auditorId,
            prompt: auditReq.prompt,
            resultSchema: auditReq.resultSchema
          }, ctx);
          auditUsd += money(d.usd);

          if (!d.ok) {
            auditDispatchReason = d.reason || 'auditor-dispatch-failed';
            throw new Error(d.error || 'auditor dispatch failed');
          }

          let value;
          try { value = JSON.parse(String(d.row.result || '')); }
          catch (_) {
            auditDispatchReason = 'invalid-auditor-envelope';
            throw new Error('auditor returned invalid JSON');
          }
          return value;
        } : null;

        const quality = await qualityPipeline.evaluate({
          contract,
          envelope: current.envelope,
          spentUsd: workerUsd,
          completedAt: completedAt(),
          requireAudit,
          runAuditor
        });

        const spend = spendState();
        const qualityStage = quality.stage;
        const projectedStage = qualityStage === 'formal' ? 'formal-review' : qualityStage;
        const finalAccepted = !!quality.accepted && !spend.budgetExceeded;
        const finalAction = quality.accepted && spend.budgetExceeded ? 'reject' : quality.action;
        const finalReason = auditDispatchReason || quality.reason || (spend.budgetExceeded ? 'task-budget-exceeded' : null);
        const finalError = quality.error || (spend.budgetExceeded
          ? ('managed task spent $' + spend.usd.toFixed(6) + ' against budget $' + Number(budgetUsd).toFixed(6))
          : null);
        const finalStage = finalAccepted ? 'accepted' : projectedStage;

        reportStage(ctx, finalStage, requireAudit ? { auditorAgentId: auditorId } : null);

        return {
          content: JSON.stringify(Object.assign({
            accepted: finalAccepted,
            stage: finalStage,
            qualityStage,
            action: finalAction,
            taskId: contract.id,
            workerAgentId: workerId,
            auditorAgentId: requireAudit ? auditorId : null,
            attempts: attempt + 1,
            result: current.envelope,
            formal: quality.formal,
            audit: quality.audit && quality.audit.ok ? quality.audit.value : null,
            findings: quality.findings || [],
            riskFlags: quality.riskFlags || [],
            reason: finalReason,
            error: finalError
          }, spend)),
          summary: finalAccepted ? 'managed task accepted' : ('managed task ' + (finalAction || 'rejected'))
        };
      }
    };

    return { managedDispatchTool: tool, RESULT_ENVELOPE_SCHEMA };
  }

  return { makeManagedOrchestrationTool, RESULT_ENVELOPE_SCHEMA };
});
