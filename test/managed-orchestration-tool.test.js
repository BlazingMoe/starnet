/* node test/managed-orchestration-tool.test.js — managed wrapper around inherited team.dispatch. */
'use strict';
const A = require('./_assert.js');
const { makeManagedOrchestrationTool } = require('../sidecar/tools/builtin/managed-orchestration.js');

function workerEnvelope(taskId, agentId, pass) {
  return {
    taskId, agentId, status: 'completed', summary: 'done', output: 'answer', artifacts: [], sources: ['s1', 's2'], blockers: [],
    acceptance: [{ criterion: 'two sources', passed: pass !== false, evidence: pass === false ? 'one source' : 's1 + s2' }], provenance: {}
  };
}

(async () => {
  const roster = new Map([
    ['lead', { role: 'orchestrator', orgRole: 'commander', system: 'lead' }],
    ['worker', { role: 'specialist', orgRole: 'specialist', system: 'worker' }],
    ['auditor', { role: 'specialist', orgRole: 'specialist', system: 'auditor' }]
  ]);
  const calls = [];
  let workerPass = true;
  const dispatchTool = {
    timeoutMs: 10000,
    run: async (args) => {
      calls.push(args);
      const w = args.workers[0];
      if (w.agentId === 'auditor') {
        return { content: JSON.stringify([{ agentId: 'auditor', reason: 'done', usd: 0.05, result: JSON.stringify({ taskId: 't1', workerAgentId: 'worker', verdict: 'accept', score: 94, rationale: 'sound', findings: [], failedCriteria: [], riskFlags: [] }) }]) };
      }
      return { content: JSON.stringify([{ agentId: 'worker', reason: 'done', usd: 0.2, result: JSON.stringify(workerEnvelope('t1', 'worker', workerPass)) }]) };
    }
  };
  const clock = { now: () => 1700000000000 };
  const { managedDispatchTool } = makeManagedOrchestrationTool({ dispatchTool, roster: () => roster, clock });
  A.eq(managedDispatchTool.capability, 'orchestrator', 'managed tool keeps inherited orchestrator capability gate');
  A.eq(managedDispatchTool.scope, 'execute', 'managed tool is execute-scoped');
  A.eq(managedDispatchTool.requiresConsent, true, 'managed delegation remains consent-gated');

  const stages = [];
  const ctx = {
    agentId: 'lead',
    runId: 'lead-run',
    reportManagedTaskStage(stage, patch) { stages.push({ stage, patch: patch || {} }); }
  };
  const out = await managedDispatchTool.run({ taskId: 't1', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], requireAudit: true, auditorAgentId: 'auditor' }, ctx);
  const parsed = JSON.parse(out.content);
  A.eq(parsed.accepted, true, 'worker plus independent accepting auditor passes');
  A.eq(parsed.stage, 'accepted', 'accepted managed task exposes a terminal accepted lifecycle stage');
  A.eq(parsed.qualityStage, 'audit', 'accepted result preserves the quality-pipeline stage separately');
  A.eq(parsed.usd, 0.25, 'managed total spend includes worker and independent auditor');
  A.eq(parsed.workerUsd, 0.2, 'managed result exposes cumulative worker spend');
  A.eq(parsed.auditUsd, 0.05, 'managed result exposes independent audit spend');
  A.eq(calls.length, 2, 'one worker run plus one independent audit run');
  A.eq(calls[0].workers[0].resultSchema.required.indexOf('acceptance') >= 0, true, 'worker is forced into strict result envelope');
  A.eq(calls[1].workers[0].agentId, 'auditor', 'audit is dispatched to distinct auditor agent');
  A.eq(stages.map(x => x.stage), ['contract', 'dispatch', 'formal-review', 'audit', 'accepted'], 'managed execution reports authoritative lifecycle transitions in order');
  A.eq(stages.find(x => x.stage === 'audit').patch.auditorAgentId, 'auditor', 'audit lifecycle identifies the active independent auditor');

  calls.length = 0;
  const sameAuditorStages = [];
  const sameAuditor = await managedDispatchTool.run(
    { taskId: 't1', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], requireAudit: true, auditorAgentId: 'worker' },
    { agentId: 'lead', runId: 'lead-run', reportManagedTaskStage(stage, patch) { sameAuditorStages.push({ stage, patch: patch || {} }); } }
  );
  A.eq(JSON.parse(sameAuditor.content).accepted, false, 'worker cannot audit its own work');
  A.eq(calls.length, 1, 'self-audit is refused after worker result and before audit dispatch');
  A.eq(sameAuditorStages.at(-1).stage, 'audit', 'invalid independent-auditor configuration fails while visibly in audit stage');

  calls.length = 0; workerPass = false;
  const revisionStages = [];
  const revised = await managedDispatchTool.run(
    { taskId: 't1', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], maxRevisions: 1 },
    { agentId: 'lead', runId: 'lead-run', reportManagedTaskStage(stage, patch) { revisionStages.push({ stage, patch: patch || {} }); } }
  );
  const revisedParsed = JSON.parse(revised.content);
  A.eq(revisedParsed.accepted, false, 'still-failing replacement remains rejected after bounded revision');
  A.eq(revisedParsed.usd, 0.4, 'managed spend accumulates the original worker run plus its revision');
  A.eq(revisedParsed.workerUsd, 0.4, 'worker spend is cumulative across bounded revisions');
  A.eq(revisedParsed.auditUsd, 0, 'non-audited revisions report zero audit spend');
  A.eq(calls.length, 2, 'exactly one bounded revision is attempted');
  A.ok(revisionStages.map(x => x.stage).includes('revision'), 'bounded repair is exposed as a live revision stage');
  A.eq(revisionStages.at(-1).stage, 'formal-review', 'terminal rejection remains on the normalized formal-review lifecycle stage');

  calls.length = 0; workerPass = true;
  const budgetTerminal = JSON.parse((await managedDispatchTool.run(
    { taskId: 't1', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], budgetUsd: 0.1, maxRevisions: 3 },
    ctx
  )).content);
  A.eq(budgetTerminal.accepted, false, 'worker result that exceeds the task budget is rejected');
  A.eq(budgetTerminal.reason, 'task-budget-exceeded', 'budget rejection has a machine-readable reason');
  A.eq(budgetTerminal.action, 'reject', 'spent budget is terminal instead of requesting a cost-increasing revision');
  A.eq(budgetTerminal.usd, 0.2, 'budget rejection reports the actual first-attempt spend');
  A.eq(calls.length, 1, 'already-exceeded budget prevents all further managed revisions');

  calls.length = 0;
  const auditBudget = JSON.parse((await managedDispatchTool.run(
    { taskId: 't1', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], budgetUsd: 0.22, requireAudit: true, auditorAgentId: 'auditor' },
    ctx
  )).content);
  A.eq(auditBudget.accepted, false, 'audit cost can push an otherwise valid task over its total budget');
  A.eq(auditBudget.stage, 'audit', 'post-audit budget failure remains attributable to the audit stage');
  A.eq(auditBudget.reason, 'task-budget-exceeded', 'post-audit overrun is explicit');
  A.eq(auditBudget.usd, 0.25, 'post-audit budget check uses worker plus auditor spend');
  A.eq(auditBudget.workerUsd, 0.2, 'post-audit result retains worker spend separately');
  A.eq(auditBudget.auditUsd, 0.05, 'post-audit result retains audit spend separately');
  A.eq(calls.length, 2, 'budget that is still available after worker review permits exactly the requested audit');

  const infrastructureReasons = ['timeout', 'refused', 'not-dispatched', 'error'];
  for (const reason of infrastructureReasons) {
    let failureCalls = 0;
    const failureDispatch = {
      timeoutMs: 10000,
      run: async () => {
        failureCalls++;
        return { content: JSON.stringify([{ agentId: 'worker', reason, usd: reason === 'timeout' ? 0.13 : 0, result: 'explicit ' + reason + ' from inherited dispatch' }]) };
      }
    };
    const { managedDispatchTool: failing } = makeManagedOrchestrationTool({ dispatchTool: failureDispatch, roster: () => roster, clock });
    const failed = JSON.parse((await failing.run(
      { taskId: 'fail-' + reason, agentId: 'worker', objective: 'exercise ' + reason },
      { agentId: 'lead', runId: 'failure-run' }
    )).content);
    A.eq(failed.accepted, false, reason + ' cannot be misreported as a valid managed result');
    A.eq(failed.stage, 'dispatch', reason + ' remains a dispatch-stage failure');
    A.eq(failed.reason, reason, reason + ' survives as the machine-readable failure reason');
    A.ok(String(failed.error).includes(reason), reason + ' keeps the inherited diagnostic text');
    A.eq(failed.usd, reason === 'timeout' ? 0.13 : 0, reason + ' preserves authoritative dispatch spend');
    A.eq(failureCalls, 1, reason + ' is not blindly retried by managed orchestration');
  }

  const invalidEnvelopeDispatch = {
    timeoutMs: 10000,
    run: async () => ({ content: JSON.stringify([{ agentId: 'worker', reason: 'done', usd: 0.07, result: 'not-json' }]) })
  };
  const { managedDispatchTool: invalidEnvelopeTool } = makeManagedOrchestrationTool({ dispatchTool: invalidEnvelopeDispatch, roster: () => roster, clock });
  const invalidEnvelope = JSON.parse((await invalidEnvelopeTool.run(
    { taskId: 'bad-envelope', agentId: 'worker', objective: 'return structured data' },
    { agentId: 'lead', runId: 'bad-envelope-run' }
  )).content);
  A.eq(invalidEnvelope.reason, 'invalid-result-envelope', 'malformed worker JSON is distinct from infrastructure dispatch failure');
  A.eq(invalidEnvelope.usd, 0.07, 'invalid structured output still preserves work already billed');

  let auditFailureCalls = 0;
  const auditFailureDispatch = {
    timeoutMs: 10000,
    run: async (args) => {
      auditFailureCalls++;
      const w = args.workers[0];
      if (w.agentId === 'auditor') {
        return { content: JSON.stringify([{ agentId: 'auditor', reason: 'timeout', usd: 0.03, result: 'auditor exceeded wall clock' }]) };
      }
      return { content: JSON.stringify([{ agentId: 'worker', reason: 'done', usd: 0.2, result: JSON.stringify(workerEnvelope('audit-fail', 'worker', true)) }]) };
    }
  };
  const { managedDispatchTool: auditFailureTool } = makeManagedOrchestrationTool({ dispatchTool: auditFailureDispatch, roster: () => roster, clock });
  const auditFailure = JSON.parse((await auditFailureTool.run(
    { taskId: 'audit-fail', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], requireAudit: true, auditorAgentId: 'auditor' },
    { agentId: 'lead', runId: 'audit-failure-run' }
  )).content);
  A.eq(auditFailure.accepted, false, 'required auditor infrastructure failure fails closed');
  A.eq(auditFailure.stage, 'audit', 'auditor infrastructure failure remains an audit-stage failure');
  A.eq(auditFailure.reason, 'timeout', 'auditor dispatch timeout survives quality-pipeline wrapping');
  A.ok(String(auditFailure.error).includes('auditor exceeded wall clock'), 'auditor timeout keeps inherited diagnostic text');
  A.eq(auditFailureCalls, 2, 'auditor failure does not trigger an unbounded retry loop');

  const upwardRoster = new Map([
    ['lead', { role: 'specialist', orgRole: 'worker' }],
    ['manager', { role: 'specialist', orgRole: 'manager' }]
  ]);
  const { managedDispatchTool: upward } = makeManagedOrchestrationTool({ dispatchTool, roster: () => upwardRoster, clock });
  const deniedStages = [];
  const denied = await upward.run(
    { taskId: 't2', agentId: 'manager', objective: 'manage me' },
    { agentId: 'lead', reportManagedTaskStage(stage) { deniedStages.push(stage); } }
  );
  const deniedParsed = JSON.parse(denied.content);
  A.eq(deniedParsed.accepted, false, 'upward delegation is rejected before inherited dispatch');
  A.eq(deniedParsed.stage, 'contract', 'hierarchy refusal is a contract-stage failure');
  A.eq(deniedStages, ['contract'], 'contract rejection never claims a later runtime stage');

  A.report('managed-orchestration-tool.test');
})().catch(e => { console.error(e); process.exit(1); });
