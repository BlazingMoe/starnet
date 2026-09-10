'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');
const { buildManagedResumeRequest } = require('../sidecar/orchestration/task-recovery.js');

const disk = [];
const io = {
  readAll() { return disk.slice(); },
  append(row) { disk.push(JSON.parse(JSON.stringify(row))); }
};
let now = 5000;
const clock = { now() { return now++; } };
const store = makeTaskHistoryStore({ io, clock });

store.recordCheckpoint({
  taskId: 'safe-1', parentTaskId: 'root-1', parentRunId: 'run-1', leadAgentId: 'lead', workerAgentId: 'worker',
  auditorAgentId: 'auditor', objective: 'resume this exact contract', acceptanceCriteria: ['artifact exists', 'two sources'],
  tags: ['research', 'daily-driver'], deadlineAt: 9000, budgetUsd: 1.25, requireAudit: true, maxRevisions: 2,
  stage: 'contract', startedAt: 4900
});

const recovery = store.recovery('safe-1');
const built = buildManagedResumeRequest(recovery);
A.eq(built.ok, true, 'pre-dispatch durable checkpoint can produce a resume request');
A.eq(built.disposition, 'SAFE_RESTART', 'resume request preserves the conservative recovery disposition');
A.eq(built.executionMayHaveStarted, false, 'safe resume request proves execution had not crossed the dispatch fence');
A.eq(built.taskId, 'safe-1', 'resume request preserves task identity');
A.eq(built.leadAgentId, 'lead', 'resume request preserves the original lead identity separately from tool args');
A.eq(built.originalParentRunId, 'run-1', 'resume request preserves original run provenance for a later executor');
A.eq(built.args, {
  taskId: 'safe-1', parentTaskId: 'root-1', agentId: 'worker', objective: 'resume this exact contract',
  acceptanceCriteria: ['artifact exists', 'two sources'], tags: ['research', 'daily-driver'], requireAudit: true,
  maxRevisions: 2, deadlineAt: 9000, budgetUsd: 1.25, auditorAgentId: 'auditor'
}, 'resume request reconstructs the original managed contract without widening it');
A.eq(built.derivedFrom, 'moe.managed-task-checkpoint.v1', 'resume request declares its authoritative derivation source');

store.recordCheckpoint({
  taskId: 'unsafe-1', parentRunId: 'run-2', leadAgentId: 'lead', workerAgentId: 'worker',
  objective: 'may already have run', stage: 'dispatch', startedAt: 4950
});
const unsafe = buildManagedResumeRequest(store.recovery('unsafe-1'));
A.eq(unsafe.ok, false, 'post-dispatch recovery cannot produce a replay request');
A.eq(unsafe.reason, 'reconciliation-required', 'unsafe recovery is blocked on reconciliation rather than guessed');
A.eq(unsafe.disposition, 'RECONCILE_BEFORE_RETRY', 'unsafe recovery keeps the authoritative disposition');
A.eq(unsafe.executionMayHaveStarted, true, 'unsafe recovery preserves possible prior execution');

store.record({ taskId: 'done-1', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'finished', status: 'accepted', stage: 'accepted', accepted: true });
const terminal = buildManagedResumeRequest(store.recovery('done-1'));
A.eq(terminal.ok, false, 'terminal task never produces a resume request');
A.eq(terminal.reason, 'terminal-task', 'terminal replay refusal is machine-readable');

const unknown = buildManagedResumeRequest(store.recovery('missing'));
A.eq(unknown.ok, false, 'unknown task never becomes resumable by inference');
A.eq(unknown.reason, 'no-resumable-checkpoint', 'missing durable evidence is explicit');

const forged = buildManagedResumeRequest({
  state: 'RESUME_REQUIRED',
  disposition: 'SAFE_RESTART',
  checkpoint: { schemaVersion: 'moe.managed-task-checkpoint.v1', taskId: 'forged', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'x', stage: 'dispatch' }
});
A.eq(forged.ok, false, 'caller-supplied SAFE_RESTART cannot override the checkpoint stage');
A.eq(forged.reason, 'reconciliation-required', 'resume safety is recomputed from authoritative checkpoint evidence');

A.report('managed-task-recovery.test');
