'use strict';
const A = require('./_assert.js');
const gate = require('../sidecar/orchestration/review-gate.js');

const contract = {
  id: 'task_1', objective: 'Research X', requestedBy: 'boss', assignedTo: 'worker1',
  fromRole: 'manager', toRole: 'specialist',
  acceptanceCriteria: ['Two independent sources', 'State uncertainty'], tags: ['research'],
  budgetUsd: 2, deadlineAt: 2000, provenance: { parent: 'root' }
};

const good = {
  taskId: 'task_1', agentId: 'worker1', status: 'completed', summary: 'done', output: 'answer',
  sources: ['a', 'b'], artifacts: [], blockers: [], provenance: {},
  acceptance: [
    { criterion: 'Two independent sources', passed: true, evidence: 'sources a and b' },
    { criterion: 'State uncertainty', passed: true, evidence: 'confidence disclosed' }
  ]
};

let r = gate.review(contract, good, { completedAt: 1500, spentUsd: 1.5 });
A.ok(r.ok && r.accepted, 'complete evidenced result is accepted');
A.eq(r.verdict, 'accept', 'accepted verdict');

r = gate.review(contract, Object.assign({}, good, { status: 'partial' }));
A.ok(!r.accepted && r.failures.some(x => /status/.test(x)), 'partial result is rejected');

r = gate.review(contract, Object.assign({}, good, { agentId: 'other' }));
A.ok(!r.accepted && r.failures.some(x => /agentId/.test(x)), 'wrong agent is rejected');

const missing = Object.assign({}, good, { acceptance: [good.acceptance[0]] });
r = gate.review(contract, missing);
A.ok(!r.accepted && r.failures.some(x => /missing acceptance criterion/.test(x)), 'missing criterion is rejected');

const noEvidence = JSON.parse(JSON.stringify(good));
noEvidence.acceptance[0].evidence = '';
r = gate.review(contract, noEvidence);
A.ok(!r.accepted && r.failures.some(x => /missing acceptance evidence/.test(x)), 'passed criterion needs evidence by default');
A.ok(gate.review(contract, noEvidence, { requireEvidence: false }).accepted, 'evidence requirement can be disabled explicitly');

r = gate.review(contract, good, { spentUsd: 2.01 });
A.ok(!r.accepted && r.failures.some(x => /budget/.test(x)), 'budget excess rejects');
A.eq(r.retryable, false, 'spent budget cannot be repaired by spending more on a revision');
A.eq(r.verdict, 'reject', 'budget excess is a terminal rejection rather than a revision request');
A.eq(r.terminalFailures, ['task budget exceeded'], 'terminal budget failure is explicit for orchestration policy');

r = gate.review(contract, good, { completedAt: 2001 });
A.ok(r.accepted && r.warnings.some(x => /deadline/.test(x)), 'late completion warns but does not erase valid work');

const repairable = gate.review(contract, missing);
A.eq(repairable.retryable, true, 'content acceptance failure remains eligible for bounded revision');
A.eq(repairable.verdict, 'revise', 'repairable content failure requests revision');
const rev = gate.revisionBrief(repairable);
A.ok(/REVISION REQUIRED/.test(rev) && /missing acceptance criterion/.test(rev), 'revision brief carries exact failures');

A.report('review-gate.test');
