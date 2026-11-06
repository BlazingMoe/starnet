'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore, recoveryDisposition } = require('../sidecar/orchestration/task-history.js');

const disk = [];
const io = {
  readAll() { return disk.slice(); },
  append(row) { disk.push(JSON.parse(JSON.stringify(row))); }
};
let now = 1000;
const clock = { now() { return now++; } };

A.eq(recoveryDisposition({ stage: 'contract' }).disposition, 'SAFE_RESTART', 'pre-dispatch contract checkpoint is the only automatically restartable recovery boundary');
A.eq(recoveryDisposition({ stage: 'resume-claimed' }).disposition, 'RECONCILE_BEFORE_RETRY', 'an active recovery claim blocks competing restart attempts');
A.eq(recoveryDisposition({ stage: 'resume-claimed' }).executionMayHaveStarted, false, 'claim boundary blocks duplicates without falsely claiming worker execution');
A.eq(recoveryDisposition({ stage: 'dispatch' }).disposition, 'RECONCILE_BEFORE_RETRY', 'dispatch checkpoint is treated as possible execution rather than replay permission');
A.eq(recoveryDisposition({ stage: 'revision' }).disposition, 'RECONCILE_BEFORE_RETRY', 'revision checkpoint requires reconciliation before retry');
A.eq(recoveryDisposition({ stage: 'audit' }).disposition, 'RECONCILE_BEFORE_RETRY', 'audit checkpoint requires reconciliation before retry');
A.eq(recoveryDisposition(null).disposition, 'BLOCKED_NO_EVIDENCE', 'missing durable evidence never becomes resumable by inference');

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

const cp = store.recordCheckpoint({
  taskId: 'resume-me', parentRunId: 'run-x', leadAgentId: 'lead', workerAgentId: 'worker', auditorAgentId: 'auditor',
  objective: 'long task', acceptanceCriteria: ['two sources', 'artifact saved'], tags: ['research'], deadlineAt: 5000,
  budgetUsd: 2.5, requireAudit: true, maxRevisions: 2, stage: 'audit', startedAt: 900
});
A.eq(cp.schemaVersion, 'moe.managed-task-checkpoint.v1', 'checkpoint rows use a distinct schema in the same append-only log');
A.eq(store.count(), 1, 'checkpoint rows do not become completed managed tasks');
A.eq(store.latestCheckpoint('resume-me').stage, 'audit', 'latest durable stage checkpoint is queryable');
A.eq(cp.acceptanceCriteria, ['two sources', 'artifact saved'], 'checkpoint preserves immutable acceptance criteria needed for safe recovery');
A.eq(cp.tags, ['research'], 'checkpoint preserves task tags needed for safe recovery');
A.eq(cp.deadlineAt, 5000, 'checkpoint preserves the original deadline');
A.eq(cp.budgetUsd, 2.5, 'checkpoint preserves the original budget bound');
A.eq(cp.requireAudit, true, 'checkpoint preserves whether independent audit was required');
A.eq(cp.maxRevisions, 2, 'checkpoint preserves the original revision bound');
const auditRecovery = store.recovery('resume-me');
A.eq(auditRecovery.state, 'RESUME_REQUIRED', 'checkpoint without a later terminal result requires recovery after restart');
A.eq(auditRecovery.disposition, 'RECONCILE_BEFORE_RETRY', 'post-dispatch recovery never grants blind replay');
A.eq(auditRecovery.executionMayHaveStarted, true, 'post-dispatch checkpoint conservatively records possible execution');

const safeCp = store.recordCheckpoint({
  taskId: 'safe-restart', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'not dispatched yet', stage: 'contract', startedAt: 901
});
const safeRecovery = store.recovery('safe-restart');
A.eq(safeRecovery.state, 'RESUME_REQUIRED', 'pre-dispatch interruption is still recovery-required');
A.eq(safeRecovery.disposition, 'SAFE_RESTART', 'contract checkpoint is explicitly safe to restart');
A.eq(safeRecovery.executionMayHaveStarted, false, 'safe restart is backed by a durable pre-dispatch boundary');

const claimed = store.claimSafeRestart('safe-restart', 'claim-a');
A.eq(claimed.ok, true, 'safe restart can be atomically claimed in the authoritative history store');
A.eq(claimed.checkpoint.stage, 'resume-claimed', 'claim is persisted as a distinct pre-dispatch recovery boundary');
A.eq(claimed.checkpoint.recoveryClaimId, 'claim-a', 'durable claim carries its owner identity');
A.eq(claimed.recovery.disposition, 'RECONCILE_BEFORE_RETRY', 'claimed task is no longer available for a competing restart');
A.eq(claimed.recovery.executionMayHaveStarted, false, 'claim does not invent worker execution telemetry');
const duplicateClaim = store.claimSafeRestart('safe-restart', 'claim-b');
A.eq(duplicateClaim.ok, false, 'second claimant cannot acquire the same safe restart');
A.eq(duplicateClaim.reason, 'not-safe-to-claim', 'duplicate claim refusal is machine-readable');
A.eq(store.releaseSafeRestartClaim('safe-restart', 'claim-b').ok, false, 'non-owner cannot release an active recovery claim');
const released = store.releaseSafeRestartClaim('safe-restart', 'claim-a');
A.eq(released.ok, true, 'claim owner can release before dispatch when execution never started');
A.eq(released.recovery.disposition, 'SAFE_RESTART', 'released pre-dispatch claim returns to the original safe boundary');
A.eq(released.checkpoint.recoveryClaimId, '', 'released claim does not leave stale ownership metadata');

store.recordCheckpoint({
  taskId: 'claimed-on-restart', parentRunId: 'run-claim', leadAgentId: 'lead', workerAgentId: 'worker',
  objective: 'serialize recovery across process restart', stage: 'contract', startedAt: 902
});
A.eq(store.claimSafeRestart('claimed-on-restart', 'claim-persisted').ok, true, 'claim can be durably acquired before restart');

store.record({ taskId: 't2', leadAgentId: 'lead', workerAgentId: 'w2', objective: 'code', status: 'rejected', stage: 'formal-review', attempts: 2, usd: 0.3 });
const failed = store.record({ taskId: 't3', leadAgentId: 'lead', workerAgentId: 'w3', objective: 'write', status: 'dispatch_error', stage: 'dispatch', attempts: 1, usd: 0.12, workerUsd: 0.12, auditUsd: 0, budgetUsd: 0.1, budgetExceeded: true, reason: 'timeout', error: 'worker exceeded wall clock' });
A.eq(failed.reason, 'timeout', 'history row retains machine-readable failure reason');
A.eq(failed.error, 'worker exceeded wall clock', 'history row retains bounded diagnostic text');
A.eq(failed.workerUsd, 0.12, 'failed history row keeps billed worker spend');
A.eq(failed.budgetUsd, 0.1, 'failed history row keeps budget context');
A.eq(failed.budgetExceeded, true, 'failed history row keeps verified budget-overrun state');
store.record({ taskId: 't4', leadAgentId: 'lead', workerAgentId: 'w4', objective: 'analyze', status: 'accepted', stage: 'accepted', accepted: true, attempts: 1, usd: 0.5 });
A.eq(store.count(), 3, 'RAM mirror is bounded independently from durable log');
A.eq(disk.length, 10, 'durable append log retains terminal rows plus checkpoint and recovery-claim evidence');
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
A.eq(restarted.latestCheckpoint('resume-me').acceptanceCriteria, ['two sources', 'artifact saved'], 'restart reconstructs the immutable acceptance contract from the same durable checkpoint');
A.eq(restarted.latestCheckpoint('resume-me').budgetUsd, 2.5, 'restart reconstructs the original budget bound without another state store');
A.eq(restarted.latestCheckpoint('resume-me').requireAudit, true, 'restart reconstructs the audit requirement without guessing');
A.eq(restarted.recovery('resume-me').state, 'RESUME_REQUIRED', 'restart exposes an unfinished checkpoint as recovery-required');
A.eq(restarted.recovery('resume-me').disposition, 'RECONCILE_BEFORE_RETRY', 'restart retains conservative post-dispatch recovery policy');
A.eq(restarted.recovery('safe-restart').disposition, 'SAFE_RESTART', 'restart retains a released durable pre-dispatch safe boundary');
A.eq(restarted.recovery('claimed-on-restart').disposition, 'RECONCILE_BEFORE_RETRY', 'restart reconstructs active claim and blocks duplicate execution');
A.eq(restarted.recovery('claimed-on-restart').reason, 'recovery-claim-active', 'persisted claim has an explicit recovery reason after restart');
A.eq(restarted.recovery('claimed-on-restart').executionMayHaveStarted, false, 'persisted claim does not misreport worker execution as fact');
A.eq(restarted.latestCheckpoint('claimed-on-restart').recoveryClaimId, 'claim-persisted', 'claim owner survives restart in the same authoritative checkpoint log');

restarted.record({ taskId: 'resume-me', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'long task', status: 'accepted', stage: 'accepted', accepted: true });
const terminalRecovery = restarted.recovery('resume-me');
A.eq(terminalRecovery.state, 'TERMINAL', 'a later authoritative terminal row suppresses replay of the durable checkpoint');
A.eq(terminalRecovery.disposition, 'NOT_APPLICABLE', 'terminal tasks never surface as resumable');
A.eq(restarted.recovery('does-not-exist').disposition, 'BLOCKED_NO_EVIDENCE', 'unknown tasks never receive a guessed recovery path');

let threw = false;
try { restarted.record({ taskId: 'bad', leadAgentId: 'lead' }); } catch (_) { threw = true; }
A.eq(threw, true, 'incomplete provenance fails closed at persistence boundary');

A.report('managed-task-history.test');
