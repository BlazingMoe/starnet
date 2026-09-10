'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');

const disk = [];
const io = {
  readAll() { return disk.slice(); },
  append(row) { disk.push(JSON.parse(JSON.stringify(row))); }
};
let now = 1000;
const clock = { now() { return now++; } };

const store = makeTaskHistoryStore({ io, clock, ramMax: 3, limit: 10 });
const first = store.record({
  taskId: 't1', parentTaskId: 'root', parentRunId: 'r1', leadAgentId: 'lead', workerAgentId: 'worker',
  auditorAgentId: 'auditor', objective: 'research', status: 'accepted', stage: 'accepted', accepted: true,
  attempts: 1, usd: 0.2, workerUsd: 0.2, auditUsd: 0, budgetUsd: 1, budgetExceeded: false, acceptanceCriteria: ['two sources'], findings: [], riskFlags: [], sources: ['s1','s2'], artifacts: ['a.md'],
  reason: '', error: ''
});
A.eq(first.schemaVersion, 'moe.managed-task-history.v1', 'history rows are versioned');
A.eq(store.count(), 1, 'record is mirrored in RAM');
A.eq(disk.length, 1, 'record is appended durably');
A.eq(store.list({ taskId: 't1' })[0].workerAgentId, 'worker', 'task lookup returns worker provenance');
A.eq(first.workerUsd, 0.2, 'history sanitization preserves worker spend');
A.eq(first.auditUsd, 0, 'history sanitization preserves zero audit spend');
A.eq(first.budgetUsd, 1, 'history sanitization preserves task budget');
A.eq(first.budgetExceeded, false, 'history sanitization preserves non-overrun budget state');
A.eq(store.list({ agentId: 'auditor' }).length, 1, 'agent lookup includes auditor role');

const cp = store.recordCheckpoint({ taskId: 'resume-me', parentRunId: 'run-x', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'long task', stage: 'audit', startedAt: 900 });
A.eq(cp.schemaVersion, 'moe.managed-task-checkpoint.v1', 'checkpoint rows use a distinct schema in the same append-only log');
A.eq(store.count(), 1, 'checkpoint rows do not become completed managed tasks');
A.eq(store.latestCheckpoint('resume-me').stage, 'audit', 'latest durable stage checkpoint is queryable');
A.eq(store.recovery('resume-me').state, 'RESUME_REQUIRED', 'checkpoint without a later terminal result requires recovery after restart');

store.record({ taskId: 't2', leadAgentId: 'lead', workerAgentId: 'w2', objective: 'code', status: 'rejected', stage: 'formal-review', attempts: 2, usd: 0.3 });
const failed = store.record({ taskId: 't3', leadAgentId: 'lead', workerAgentId: 'w3', objective: 'write', status: 'dispatch_error', stage: 'dispatch', attempts: 1, usd: 0.12, workerUsd: 0.12, auditUsd: 0, budgetUsd: 0.1, budgetExceeded: true, reason: 'timeout', error: 'worker exceeded wall clock' });
A.eq(failed.reason, 'timeout', 'history row retains machine-readable failure reason');
A.eq(failed.error, 'worker exceeded wall clock', 'history row retains bounded diagnostic text');
A.eq(failed.workerUsd, 0.12, 'failed history row keeps billed worker spend');
A.eq(failed.budgetUsd, 0.1, 'failed history row keeps budget context');
A.eq(failed.budgetExceeded, true, 'failed history row keeps verified budget-overrun state');
store.record({ taskId: 't4', leadAgentId: 'lead', workerAgentId: 'w4', objective: 'analyze', status: 'accepted', stage: 'accepted', accepted: true, attempts: 1, usd: 0.5 });
A.eq(store.count(), 3, 'RAM mirror is bounded independently from durable log');
A.eq(disk.length, 5, 'durable append log retains terminal rows plus checkpoint evidence');
A.eq(store.list({}, { limit: 2 })[0].taskId, 't4', 'listing is newest-first and bounded');
const s = store.summary();
A.eq(s.total, 3, 'summary reflects completed-task window only');
A.eq(s.accepted, 1, 'summary counts accepted rows');
A.eq(s.rejected, 2, 'summary counts non-accepted rows');
A.ok(Math.abs(s.usd - 0.92) < 1e-9, 'summary aggregates managed task spend without checkpoint inflation');

const restarted = makeTaskHistoryStore({ io, clock, ramMax: 10 });
A.eq(restarted.count(), 4, 'restart reloads terminal history without counting checkpoint rows');
A.eq(restarted.list({ status: 'accepted' }).length, 2, 'status filters survive restart');
A.eq(restarted.latestCheckpoint('resume-me').stage, 'audit', 'restart reconstructs latest checkpoint from the same durable log');
A.eq(restarted.recovery('resume-me').state, 'RESUME_REQUIRED', 'restart exposes an unfinished checkpoint as recovery-required');

restarted.record({ taskId: 'resume-me', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'long task', status: 'accepted', stage: 'accepted', accepted: true });
A.eq(restarted.recovery('resume-me').state, 'TERMINAL', 'a later authoritative terminal row suppresses replay of the durable checkpoint');

let threw = false;
try { restarted.record({ taskId: 'bad', leadAgentId: 'lead' }); } catch (_) { threw = true; }
A.eq(threw, true, 'incomplete provenance fails closed at persistence boundary');

A.report('managed-task-history.test');
