/* node test/orchestration-quality-pipeline.test.js — formal gate + optional independent auditor. */
'use strict';
const A = require('./_assert.js');
const pipeline = require('../sidecar/orchestration/quality-pipeline.js');

const contract = {
  id: 'task_1', objective: 'Research X', requestedBy: 'lead', assignedTo: 'researcher',
  fromRole: 'commander', toRole: 'specialist', acceptanceCriteria: ['Use two sources'], tags: [], provenance: {}
};
function envelope(passed) {
  return {
    taskId: 'task_1', agentId: 'researcher', status: 'completed', summary: 'done', output: 'answer',
    artifacts: [], sources: ['a', 'b'], blockers: [],
    acceptance: [{ criterion: 'Use two sources', passed: passed !== false, evidence: passed === false ? 'only one source' : 'sources a and b' }], provenance: {}
  };
}

(async () => {
  const formalFail = await pipeline.evaluate({ contract, envelope: envelope(false), requireAudit: true, runAuditor: async () => { throw new Error('must not run'); } });
  A.eq(formalFail.stage, 'formal', 'formal failure stops before auditor');
  A.eq(formalFail.accepted, false, 'formal failure is not accepted');

  let called = 0;
  const accepted = await pipeline.evaluate({
    contract, envelope: envelope(true), requireAudit: true,
    runAuditor: async () => { called++; return { taskId: 'task_1', workerAgentId: 'researcher', verdict: 'accept', score: 93, rationale: 'sound', findings: [], failedCriteria: [], riskFlags: [] }; }
  });
  A.eq(called, 1, 'auditor runs after formal gate passes');
  A.eq(accepted.stage, 'audit', 'final stage records independent audit');
  A.eq(accepted.accepted, true, 'accepting auditor approves result');

  const revise = await pipeline.evaluate({
    contract, envelope: envelope(true), requireAudit: true,
    runAuditor: async () => ({ taskId: 'task_1', workerAgentId: 'researcher', verdict: 'revise', score: 61, rationale: 'source quality weak', findings: ['source quality weak'], failedCriteria: [], riskFlags: ['weak-provenance'] })
  });
  A.eq(revise.accepted, false, 'revise verdict is not accepted');
  A.eq(revise.action, 'revise', 'revision action survives the pipeline');

  const noAuditor = await pipeline.evaluate({ contract, envelope: envelope(true), requireAudit: true });
  A.eq(noAuditor.reason, 'auditor-unavailable', 'required audit fails closed when no auditor runner exists');

  const formalOnly = await pipeline.evaluate({ contract, envelope: envelope(true), requireAudit: false });
  A.eq(formalOnly.accepted, true, 'formal-only mode can accept without LLM audit');

  A.report('orchestration-quality-pipeline.test');
})().catch(e => { console.error(e); process.exit(1); });
