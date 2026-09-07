/* node test/orchestration-role-policy.test.js — derivative hierarchy policy + task contracts. */
'use strict';
const A = require('./_assert.js');
const P = require('../sidecar/orchestration/role-policy.js');

A.eq(P.normalizeRole(' Commander '), 'commander', 'role normalization is case/space tolerant');
A.eq(P.normalizeRole('boss'), null, 'unknown role rejected');

A.ok(P.canDelegate('commander', 'manager'), 'commander may delegate to manager');
A.ok(P.canDelegate('commander', 'specialist'), 'commander may delegate directly to specialist');
A.ok(P.canDelegate('commander', 'worker'), 'commander may delegate directly to worker');
A.ok(P.canDelegate('manager', 'specialist'), 'manager may delegate to specialist');
A.ok(P.canDelegate('manager', 'worker'), 'manager may delegate to worker');
A.ok(P.canDelegate('specialist', 'worker'), 'specialist may delegate to worker');
A.ok(!P.canDelegate('worker', 'specialist'), 'worker may not delegate upward');
A.ok(!P.canDelegate('specialist', 'manager'), 'specialist may not delegate upward');
A.ok(!P.canDelegate('manager', 'commander'), 'manager may not delegate upward');
A.ok(!P.canDelegate('commander', 'commander'), 'same-level commander delegation is not a hierarchy edge');

const good = P.validateTaskContract({
  id: 'task-1',
  objective: 'Research three implementation approaches and recommend one.',
  requestedBy: 'agent-commander',
  assignedTo: 'agent-researcher',
  fromRole: 'commander',
  toRole: 'specialist',
  acceptanceCriteria: ['Three distinct approaches', 'Recommendation with evidence'],
  tags: ['research', 'architecture'],
  deadlineAt: 1900000000000,
  budgetUsd: 2.5,
  provenance: { source: 'user-request', runId: 'run-1' }
});
A.ok(good.ok, 'valid task contract accepted');
A.eq(good.value.schemaVersion, 1, 'normalized contract is versioned');
A.eq(good.value.fromRole, 'commander', 'from role normalized');
A.eq(good.value.toRole, 'specialist', 'to role normalized');
A.eq(good.value.acceptanceCriteria.length, 2, 'acceptance criteria preserved');
A.eq(good.value.budgetUsd, 2.5, 'budget normalized');

const upward = P.validateTaskContract({
  id: 'task-2', objective: 'Escalate', requestedBy: 'w', assignedTo: 'm',
  fromRole: 'worker', toRole: 'manager'
});
A.ok(!upward.ok, 'upward delegation rejected');
A.ok(upward.errors.indexOf('delegation') >= 0, 'upward failure names delegation');

const missing = P.validateTaskContract({});
A.ok(!missing.ok, 'empty contract rejected');
for (const key of ['id', 'objective', 'requestedBy', 'assignedTo', 'fromRole', 'toRole']) {
  A.ok(missing.errors.indexOf(key) >= 0, 'missing contract reports ' + key);
}

const badBudget = P.validateTaskContract({
  id: 'task-3', objective: 'Do work', requestedBy: 'c', assignedTo: 'w',
  fromRole: 'commander', toRole: 'worker', budgetUsd: -1
});
A.ok(!badBudget.ok && badBudget.errors.indexOf('budgetUsd') >= 0, 'negative budget rejected');

const badDeadline = P.validateTaskContract({
  id: 'task-4', objective: 'Do work', requestedBy: 'm', assignedTo: 's',
  fromRole: 'manager', toRole: 'specialist', deadlineAt: 'not-a-number'
});
A.ok(!badDeadline.ok && badDeadline.errors.indexOf('deadlineAt') >= 0, 'invalid deadline rejected');

const snap = P.roleSnapshot();
A.eq(snap.map(x => x.role), ['commander', 'manager', 'specialist', 'worker'], 'role snapshot has stable hierarchy order');
A.eq(snap[0].delegatesTo, ['manager', 'specialist', 'worker'], 'snapshot exposes commander edges');

A.report('orchestration-role-policy.test');
