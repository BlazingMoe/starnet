'use strict';
const A = require('./_assert.js');
const { summarizeManagedTasks } = require('../sidecar/orchestration/task-metrics.js');

const rows = [
  {
    taskId: 'a', workerAgentId: 'researcher', auditorAgentId: 'auditor', status: 'accepted', stage: 'accepted', accepted: true,
    attempts: 1, usd: 0.5, durationMs: 1000, riskFlags: ['citation'], findings: ['minor style']
  },
  {
    taskId: 'b', workerAgentId: 'researcher', auditorAgentId: 'auditor', status: 'rejected', stage: 'audit', accepted: false,
    attempts: 2, usd: 0.7, durationMs: 3000, riskFlags: ['citation', 'logic'], findings: ['missing source']
  },
  {
    taskId: 'c', workerAgentId: 'engineer', status: 'dispatch_error', stage: 'dispatch', accepted: false,
    attempts: 1, usd: 0.1, durationMs: 2000, riskFlags: [], findings: ['tool failure']
  }
];

const s = summarizeManagedTasks(rows, { windowCapacity: 10, truncated: true });
A.eq(s.schemaVersion, 'moe.managed-task-summary.v2', 'summary schema is versioned');
A.eq(s.total, 3, 'summary counts rows');
A.eq(s.accepted, 1, 'accepted count is exact');
A.eq(s.rejected, 2, 'rejected count is exact');
A.ok(Math.abs(s.acceptanceRate - (1 / 3)) < 1e-12, 'acceptance rate is exact');
A.ok(Math.abs(s.usd - 1.3) < 1e-12, 'cost is aggregated');
A.eq(s.attempts, 4, 'attempts are aggregated');
A.ok(Math.abs(s.averageAttempts - (4 / 3)) < 1e-12, 'average attempts is reported');
A.eq(s.averageDurationMs, 2000, 'duration average uses measured samples');
A.eq(s.revisedTasks, 1, 'multi-attempt task is counted as revised');
A.ok(Math.abs(s.revisionRate - (1 / 3)) < 1e-12, 'revision rate is reported');
A.eq(s.auditedTasks, 2, 'audit coverage is explicit');
A.eq(s.auditedRejected, 1, 'audited rejection is explicit');
A.eq(s.auditedRejectRate, 0.5, 'audited reject rate uses audited tasks only');
A.eq(s.errorTasks, 1, 'error statuses are counted');
A.eq(s.statusCounts.dispatch_error, 1, 'status breakdown is stable');
A.eq(s.stageCounts.audit, 1, 'stage breakdown is stable');
A.eq(s.topRiskFlags[0], { value: 'citation', count: 2 }, 'risk flags are ranked deterministically');
A.eq(s.workers[0].workerAgentId, 'researcher', 'worker metrics rank by task count');
A.eq(s.workers[0].tasks, 2, 'worker task count is exposed');
A.eq(s.workers[0].acceptanceRate, 0.5, 'worker acceptance rate is computed');
A.ok(Math.abs(s.workers[0].usd - 1.2) < 1e-12, 'worker spend is aggregated');
A.eq(s.window, { rows: 3, capacity: 10, truncated: true }, 'summary discloses bounded-window semantics');

const empty = summarizeManagedTasks([], { windowCapacity: 100 });
A.eq(empty.acceptanceRate, 0, 'empty rates never produce NaN');
A.eq(empty.averageDurationMs, 0, 'empty duration is zero');
A.eq(empty.workers, [], 'empty worker metrics are stable');

A.report('managed-task-metrics.test');
