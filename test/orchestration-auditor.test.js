/* node test/orchestration-auditor.test.js — independent qualitative audit contract. */
'use strict';
const A = require('./_assert.js');
const auditor = require('../sidecar/orchestration/auditor.js');

const contract = {
  id: 'task_1', objective: 'Research X', requestedBy: 'lead', assignedTo: 'researcher',
  fromRole: 'commander', toRole: 'specialist', acceptanceCriteria: ['Use two sources'],
  tags: [], provenance: {}
};
const envelope = {
  taskId: 'task_1', agentId: 'researcher', status: 'completed', summary: 'done', output: 'answer',
  artifacts: [], sources: ['a', 'b'], blockers: [],
  acceptance: [{ criterion: 'Use two sources', passed: true, evidence: 'sources a and b' }], provenance: {}
};

const req = auditor.buildAuditPrompt(contract, envelope);
A.ok(req.ok, 'valid task/result produces an audit request');
A.ok(/INDEPENDENT AUDITOR/.test(req.prompt), 'audit prompt names the independent role');
A.eq(req.schema.properties.verdict.enum, ['accept', 'revise', 'reject'], 'audit verdict schema is bounded');

const good = auditor.validateAudit({
  taskId: 'task_1', workerAgentId: 'researcher', verdict: 'accept', score: 95,
  rationale: 'meets the task', findings: [], failedCriteria: [], riskFlags: []
}, contract, envelope);
A.ok(good.ok, 'valid audit accepted');
A.eq(auditor.decision(good).accepted, true, 'accept verdict maps to accepted');

const wrongTask = auditor.validateAudit({
  taskId: 'other', workerAgentId: 'researcher', verdict: 'accept', score: 95,
  rationale: 'x', findings: [], failedCriteria: [], riskFlags: []
}, contract, envelope);
A.ok(!wrongTask.ok && wrongTask.errors.indexOf('taskIdMismatch') >= 0, 'auditor cannot approve another task id');

const wrongWorker = auditor.validateAudit({
  taskId: 'task_1', workerAgentId: 'other', verdict: 'accept', score: 95,
  rationale: 'x', findings: [], failedCriteria: [], riskFlags: []
}, contract, envelope);
A.ok(!wrongWorker.ok && wrongWorker.errors.indexOf('workerAgentMismatch') >= 0, 'auditor cannot silently switch worker identity');

const badScore = auditor.validateAudit({
  taskId: 'task_1', workerAgentId: 'researcher', verdict: 'accept', score: 101,
  rationale: 'x', findings: [], failedCriteria: [], riskFlags: []
}, contract, envelope);
A.ok(!badScore.ok && badScore.errors.indexOf('score') >= 0, 'score is bounded to 0..100');

A.report('orchestration-auditor.test');
