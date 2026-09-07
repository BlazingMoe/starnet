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
  const { managedDispatchTool } = makeManagedOrchestrationTool({ dispatchTool, roster: () => roster });
  A.eq(managedDispatchTool.capability, 'orchestrator', 'managed tool keeps inherited orchestrator capability gate');
  A.eq(managedDispatchTool.scope, 'execute', 'managed tool is execute-scoped');
  A.eq(managedDispatchTool.requiresConsent, true, 'managed delegation remains consent-gated');

  const ctx = { agentId: 'lead', runId: 'lead-run' };
  const out = await managedDispatchTool.run({ taskId: 't1', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], requireAudit: true, auditorAgentId: 'auditor' }, ctx);
  const parsed = JSON.parse(out.content);
  A.eq(parsed.accepted, true, 'worker plus independent accepting auditor passes');
  A.eq(calls.length, 2, 'one worker run plus one independent audit run');
  A.eq(calls[0].workers[0].resultSchema.required.indexOf('acceptance') >= 0, true, 'worker is forced into strict result envelope');
  A.eq(calls[1].workers[0].agentId, 'auditor', 'audit is dispatched to distinct auditor agent');

  calls.length = 0;
  const sameAuditor = await managedDispatchTool.run({ taskId: 't1', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], requireAudit: true, auditorAgentId: 'worker' }, ctx);
  A.eq(JSON.parse(sameAuditor.content).accepted, false, 'worker cannot audit its own work');
  A.eq(calls.length, 1, 'self-audit is refused after worker result and before audit dispatch');

  calls.length = 0; workerPass = false;
  const revised = await managedDispatchTool.run({ taskId: 't1', agentId: 'worker', objective: 'research x', acceptanceCriteria: ['two sources'], maxRevisions: 1 }, ctx);
  A.eq(JSON.parse(revised.content).accepted, false, 'still-failing replacement remains rejected after bounded revision');
  A.eq(calls.length, 2, 'exactly one bounded revision is attempted');

  const upwardRoster = new Map([
    ['lead', { role: 'specialist', orgRole: 'worker' }],
    ['manager', { role: 'specialist', orgRole: 'manager' }]
  ]);
  const { managedDispatchTool: upward } = makeManagedOrchestrationTool({ dispatchTool, roster: () => upwardRoster });
  const denied = await upward.run({ taskId: 't2', agentId: 'manager', objective: 'manage me' }, { agentId: 'lead' });
  const deniedParsed = JSON.parse(denied.content);
  A.eq(deniedParsed.accepted, false, 'upward delegation is rejected before inherited dispatch');
  A.eq(deniedParsed.stage, 'contract', 'hierarchy refusal is a contract-stage failure');

  A.report('managed-orchestration-tool.test');
})().catch(e => { console.error(e); process.exit(1); });
