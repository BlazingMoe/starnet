'use strict';
const A = require('./_assert.js');
const V = require('../frontend/app/controlmodeview.js');

const summary = {
  ok: true,
  summary: {
    total: 4,
    acceptanceRate: 0.75,
    revisionRate: 0.25,
    auditCoverageRate: 0.5,
    auditedRejectRate: 0.5,
    errorRate: 0.25,
    usd: 1.75,
    averageDurationMs: 2500,
    window: { rows: 4, capacity: 100, truncated: true },
    workers: [
      { workerAgentId: 'researcher', tasks: 3, acceptanceRate: 2 / 3, usd: 1.2, averageDurationMs: 2000 }
    ],
    topRiskFlags: [{ value: 'citation', count: 2 }],
    topFindings: [{ value: 'missing source', count: 1 }]
  },
  live: { active: 99 }
};
const active = {
  ok: true,
  summary: { active: 1 },
  tasks: [{ taskId: 'live-1', objective: 'Research', leadAgentId: 'lead', workerAgentId: 'researcher', stage: 'audit', elapsedMs: 1200 }]
};
const recent = {
  ok: true,
  tasks: [{ taskId: 'done-1', objective: 'Write report', leadAgentId: 'lead', workerAgentId: 'writer', auditorAgentId: 'auditor', status: 'accepted', accepted: true, attempts: 2, usd: 0.4, durationMs: 3000, completedAt: 50 }]
};
const runtime = {
  ts: 5000,
  runs: [
    { runId: 'run-1', agentId: 'lead', startedAt: 3000, source: 'interactive' },
    { runId: 'run-2', agentId: 'researcher', startedAt: 4500, source: 'subagent' }
  ],
  queues: [
    { agentId: 'writer', depth: 3 },
    { agentId: 'researcher', depth: 1 }
  ]
};

const p = V.project(summary, active, recent, runtime);
A.eq(p.evidence.historicalKnown, true, 'historical evidence is marked known only from a successful API response');
A.eq(p.evidence.liveKnown, true, 'live evidence is marked known from successful active response');
A.eq(p.evidence.historyWindowTruncated, true, 'bounded-history caveat survives projection');
A.eq(p.evidence.runtimeKnown, true, 'runtime evidence is known only from a structurally valid server snapshot');
A.eq(p.cards.active, 1, 'dedicated active endpoint wins over stale embedded live summary');
A.eq(p.cards.liveRuns, 2, 'live run card counts only authoritative snapshot runs');
A.eq(p.cards.queuedWork, 4, 'queued work card sums authoritative per-agent queue depth');
A.eq(p.cards.completed, 4, 'completed count comes from historical summary');
A.eq(p.cards.acceptancePct, 75, 'acceptance rate is projected to percent');
A.eq(p.cards.revisionPct, 25, 'revision rate is projected to percent');
A.eq(p.cards.auditCoveragePct, 50, 'audit coverage is projected separately');
A.eq(p.cards.auditRejectPct, 50, 'audit rejection is not conflated with overall rejection');
A.eq(p.cards.errorPct, 25, 'error rate remains distinct');
A.eq(p.cards.usd, 1.75, 'cost is preserved without formatting loss');
A.eq(p.activeTasks[0].state, 'audit', 'live task exposes current stage');
A.eq(p.activeTasks[0].accepted, null, 'live task never invents final acceptance');
A.eq(p.runtimeRuns[0].durationMs, 2000, 'runtime duration is derived from the server snapshot timestamp, not ambient browser time');
A.eq(p.runtimeRuns[1].source, 'subagent', 'runtime source provenance survives projection');
A.eq(p.queues[0], { agentId: 'writer', depth: 3 }, 'queue depth is preserved per authoritative agent');
A.eq(p.recentTasks[0].accepted, true, 'completed task keeps recorded acceptance');
A.eq(p.workers[0].acceptancePct, 67, 'worker success projection is deterministic');
A.eq(p.topRiskFlags[0], { value: 'citation', count: 2 }, 'risk evidence is preserved');

const unknown = V.project(null, null, null, null);
A.eq(unknown.cards.active, null, 'unknown live telemetry is null, never fake zero');
A.eq(unknown.cards.liveRuns, null, 'unknown runtime snapshot never becomes fake zero live runs');
A.eq(unknown.cards.queuedWork, null, 'unknown queue snapshot never becomes fake zero queued work');
A.eq(unknown.evidence.runtimeKnown, false, 'missing runtime snapshot remains explicitly unknown');
A.eq(unknown.cards.completed, null, 'unknown historical telemetry is null, never fake zero');
A.eq(unknown.cards.acceptancePct, null, 'unknown rate is not rendered as 0%');
A.eq(unknown.activeTasks, [], 'unknown active rows are an empty presentation list');
A.eq(unknown.evidence.historicalKnown, false, 'unknown evidence remains explicit');

A.eq(V.pct(2), 100, 'percent helper clamps over-range inputs');
A.eq(V.pct(-1), 0, 'percent helper clamps negative inputs');
A.eq(V.pct(NaN), 0, 'percent helper never emits NaN');

A.report('control-mode-view.test');
