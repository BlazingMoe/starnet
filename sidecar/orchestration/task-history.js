/* sidecar/orchestration/task-history.js — append-only managed delegation history.
   Pure store: injected io + clock, bounded RAM mirrors, no network/model access. */
'use strict';

const { summarizeManagedTasks } = require('./task-metrics.js');

const STATUS = new Set(['accepted', 'revised', 'rejected', 'dispatch_error', 'audit_error', 'contract_error']);
const STAGE = new Set(['contract', 'resume-claimed', 'dispatch', 'revision', 'formal-review', 'audit', 'accepted']);
const RECON_DECISION = new Set(['CONTINUE_CONFIRMED', 'RETRY_ALLOWED', 'FREEZE_UNKNOWN']);
const RECON_OUTCOME = new Set(['APPLIED_CONFIRMED', 'NOT_APPLIED_CONFIRMED', 'UNKNOWN']);
const MAX_ROWS = 10000;
const DEFAULT_LIMIT = 200;

function str(v, max) { const s = v == null ? '' : String(v); return max ? s.slice(0, max) : s; }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function list(v, maxItems, maxLen) { return Array.isArray(v) ? v.slice(0, maxItems).map(x => str(x, maxLen)).filter(Boolean) : []; }

function sanitize(entry, now) {
  entry = entry || {};
  return {
    schemaVersion: 'moe.managed-task-history.v1', taskId: str(entry.taskId, 120), parentTaskId: str(entry.parentTaskId, 120),
    parentRunId: str(entry.parentRunId, 120), leadAgentId: str(entry.leadAgentId, 80), workerAgentId: str(entry.workerAgentId, 80),
    auditorAgentId: str(entry.auditorAgentId, 80), objective: str(entry.objective, 2000),
    status: STATUS.has(entry.status) ? entry.status : 'rejected', stage: STAGE.has(entry.stage) ? entry.stage : 'formal-review',
    accepted: entry.accepted === true, attempts: Math.max(0, Math.floor(num(entry.attempts))), usd: Math.max(0, num(entry.usd)),
    workerUsd: Math.max(0, num(entry.workerUsd)), auditUsd: Math.max(0, num(entry.auditUsd)),
    budgetUsd: entry.budgetUsd == null ? null : Math.max(0, num(entry.budgetUsd)), budgetExceeded: entry.budgetExceeded === true,
    findings: list(entry.findings, 50, 500), riskFlags: list(entry.riskFlags, 50, 120), reason: str(entry.reason, 120),
    error: str(entry.error, 1000), acceptanceCriteria: list(entry.acceptanceCriteria, 50, 500), artifacts: list(entry.artifacts, 50, 500),
    sources: list(entry.sources, 100, 1000), startedAt: Math.max(0, num(entry.startedAt)), completedAt: Math.max(0, num(entry.completedAt)) || now,
    durationMs: Math.max(0, num(entry.durationMs)), ts: now
  };
}

function sanitizeCheckpoint(entry, now) {
  entry = entry || {};
  return {
    schemaVersion: 'moe.managed-task-checkpoint.v1', taskId: str(entry.taskId, 120), parentTaskId: str(entry.parentTaskId, 120),
    parentRunId: str(entry.parentRunId, 120), leadAgentId: str(entry.leadAgentId, 80), workerAgentId: str(entry.workerAgentId, 80),
    auditorAgentId: str(entry.auditorAgentId, 80), objective: str(entry.objective, 2000), acceptanceCriteria: list(entry.acceptanceCriteria, 50, 500),
    tags: list(entry.tags, 50, 120), deadlineAt: entry.deadlineAt == null ? null : Math.max(0, num(entry.deadlineAt)),
    budgetUsd: entry.budgetUsd == null ? null : Math.max(0, num(entry.budgetUsd)), requireAudit: entry.requireAudit === true,
    maxRevisions: Math.max(0, Math.min(3, Math.floor(num(entry.maxRevisions)))), stage: STAGE.has(entry.stage) ? entry.stage : 'dispatch',
    recoveryClaimId: str(entry.recoveryClaimId, 120), recoveryClaimedAt: entry.recoveryClaimedAt == null ? null : Math.max(0, num(entry.recoveryClaimedAt)),
    startedAt: Math.max(0, num(entry.startedAt)), ts: now
  };
}

function sanitizeReconciliation(entry, now) {
  entry = entry || {};
  return {
    schemaVersion: 'moe.managed-recovery-reconciliation.v1', taskId: str(entry.taskId, 120), actionId: str(entry.actionId, 160),
    decision: RECON_DECISION.has(entry.decision) ? entry.decision : 'FREEZE_UNKNOWN',
    outcome: RECON_OUTCOME.has(entry.outcome) ? entry.outcome : 'UNKNOWN', providerRef: str(entry.providerRef, 500), reason: str(entry.reason, 160),
    expectedCheckpointStage: STAGE.has(entry.expectedCheckpointStage) ? entry.expectedCheckpointStage : '',
    expectedCheckpointTs: Math.max(0, num(entry.expectedCheckpointTs)), ts: now
  };
}

function recoveryDisposition(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return { disposition: 'BLOCKED_NO_EVIDENCE', executionMayHaveStarted: null, reason: 'no-durable-checkpoint' };
  if (checkpoint.reconciliationOutcome === 'NOT_APPLIED_CONFIRMED') return { disposition: 'SAFE_RESTART', executionMayHaveStarted: false, reason: 'authoritative-not-applied-confirmed' };
  if (checkpoint.reconciliationOutcome === 'APPLIED_CONFIRMED') return { disposition: 'RECONCILED_APPLIED', executionMayHaveStarted: true, reason: 'authoritative-applied-confirmed' };
  if (checkpoint.reconciliationOutcome === 'UNKNOWN') return { disposition: 'RECONCILE_BEFORE_RETRY', executionMayHaveStarted: true, reason: 'authoritative-outcome-unknown' };
  if (checkpoint.stage === 'contract') return { disposition: 'SAFE_RESTART', executionMayHaveStarted: false, reason: 'last-durable-stage-pre-dispatch' };
  if (checkpoint.stage === 'resume-claimed') return { disposition: 'RECONCILE_BEFORE_RETRY', executionMayHaveStarted: false, reason: 'recovery-claim-active' };
  return { disposition: 'RECONCILE_BEFORE_RETRY', executionMayHaveStarted: true, reason: 'checkpoint-at-or-after-side-effect-boundary' };
}

function makeTaskHistoryStore(opts) {
  opts = opts || {};
  const io = opts.io || { readAll() { return []; }, append() {} };
  const clock = opts.clock;
  if (!clock || typeof clock.now !== 'function') throw new Error('task history store requires injected clock');
  const ramMax = Math.max(1, Math.floor(num(opts.ramMax) || MAX_ROWS));
  const defaultLimit = Math.max(1, Math.floor(num(opts.limit) || DEFAULT_LIMIT));
  let rows = [];
  const checkpoints = new Map();
  const reconciliations = new Map();
  let truncated = false;
  let checkpointTruncated = false;

  try {
    const loaded = io.readAll();
    if (Array.isArray(loaded)) {
      const terminal = [];
      for (const row of loaded) {
        if (!row || typeof row !== 'object') continue;
        const taskId = str(row.taskId, 120);
        if (row.schemaVersion === 'moe.managed-task-checkpoint.v1') {
          if (taskId) { checkpoints.delete(taskId); checkpoints.set(taskId, row); reconciliations.delete(taskId); }
        } else if (row.schemaVersion === 'moe.managed-recovery-reconciliation.v1') {
          if (taskId) reconciliations.set(taskId, row);
        } else {
          terminal.push(row);
          if (taskId) { checkpoints.delete(taskId); reconciliations.delete(taskId); }
        }
      }
      truncated = terminal.length > ramMax;
      rows = terminal.slice(-ramMax);
      checkpointTruncated = checkpoints.size > ramMax;
      while (checkpoints.size > ramMax) { const id = checkpoints.keys().next().value; checkpoints.delete(id); reconciliations.delete(id); }
    }
  } catch (_) { rows = []; checkpoints.clear(); reconciliations.clear(); checkpointTruncated = false; }

  function record(entry) {
    const row = sanitize(entry, num(clock.now()));
    if (!row.taskId || !row.leadAgentId || !row.workerAgentId) throw new Error('task history requires taskId, leadAgentId, workerAgentId');
    io.append(row); checkpoints.delete(row.taskId); reconciliations.delete(row.taskId); rows.push(row);
    if (rows.length > ramMax) { truncated = true; rows.splice(0, rows.length - ramMax); }
    return row;
  }

  function recordCheckpoint(entry) {
    const row = sanitizeCheckpoint(entry, num(clock.now()));
    if (!row.taskId || !row.leadAgentId || !row.workerAgentId) throw new Error('task checkpoint requires taskId, leadAgentId, workerAgentId');
    io.append(row); checkpoints.delete(row.taskId); checkpoints.set(row.taskId, row); reconciliations.delete(row.taskId);
    if (checkpoints.size > ramMax) checkpointTruncated = true;
    while (checkpoints.size > ramMax) { const id = checkpoints.keys().next().value; checkpoints.delete(id); reconciliations.delete(id); }
    return Object.assign({}, row);
  }

  function latestCheckpoint(taskId) { const row = checkpoints.get(str(taskId, 120)); return row ? Object.assign({}, row) : null; }

  function checkpointWithReconciliation(taskId) {
    const checkpoint = latestCheckpoint(taskId);
    if (!checkpoint) return null;
    const recon = reconciliations.get(str(taskId, 120));
    if (recon && recon.expectedCheckpointTs === checkpoint.ts && recon.expectedCheckpointStage === checkpoint.stage) {
      checkpoint.reconciliationOutcome = recon.outcome;
      checkpoint.reconciliationDecision = recon.decision;
      checkpoint.reconciliationActionId = recon.actionId;
      checkpoint.reconciliationTs = recon.ts;
    }
    return checkpoint;
  }

  function recovery(taskId) {
    taskId = str(taskId, 120);
    if (!taskId) return { state: 'UNKNOWN_TASK', checkpoint: null, terminal: null, disposition: 'BLOCKED_NO_EVIDENCE', executionMayHaveStarted: null, reason: 'task-id-missing' };
    const checkpoint = checkpointWithReconciliation(taskId);
    let terminal = null;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].taskId === taskId) { terminal = Object.assign({}, rows[i]); break; }
    if (terminal) return { state: 'TERMINAL', checkpoint: null, terminal, disposition: 'NOT_APPLICABLE', executionMayHaveStarted: true, reason: 'terminal-result-recorded' };
    if (checkpoint) return Object.assign({ state: 'RESUME_REQUIRED', checkpoint, terminal: null }, recoveryDisposition(checkpoint));
    return { state: 'UNKNOWN_TASK', checkpoint: null, terminal: null, disposition: 'BLOCKED_NO_EVIDENCE', executionMayHaveStarted: null, reason: 'no-durable-task-evidence' };
  }

  function listRecoveries(filter, options) {
    filter = filter || {}; options = options || {};
    const cap = Math.max(1, Math.min(1000, Math.floor(num(options.limit) || defaultLimit)));
    const out = [];
    for (const raw of Array.from(checkpoints.values()).reverse()) {
      if (filter.taskId && raw.taskId !== filter.taskId) continue;
      if (filter.leadAgentId && raw.leadAgentId !== filter.leadAgentId) continue;
      if (filter.agentId && raw.leadAgentId !== filter.agentId && raw.workerAgentId !== filter.agentId && raw.auditorAgentId !== filter.agentId) continue;
      const checkpoint = checkpointWithReconciliation(raw.taskId);
      const disposition = recoveryDisposition(checkpoint);
      if (filter.disposition && disposition.disposition !== filter.disposition) continue;
      out.push(Object.assign({ state: 'RESUME_REQUIRED', taskId: checkpoint.taskId, checkpoint, terminal: null }, disposition));
      if (out.length >= cap) break;
    }
    return { items: out, truncated: checkpointTruncated };
  }

  function claimSafeRestart(taskId, claimId) {
    taskId = str(taskId, 120); claimId = str(claimId, 120);
    if (!taskId || !claimId) return { ok: false, reason: 'claim-identity-required', recovery: recovery(taskId) };
    const current = recovery(taskId);
    if (current.state !== 'RESUME_REQUIRED' || current.disposition !== 'SAFE_RESTART' || !current.checkpoint) return { ok: false, reason: 'not-safe-to-claim', recovery: current };
    const checkpoint = recordCheckpoint(Object.assign({}, current.checkpoint, { stage: 'resume-claimed', recoveryClaimId: claimId, recoveryClaimedAt: num(clock.now()) }));
    return { ok: true, claimId, checkpoint, recovery: recovery(taskId) };
  }

  function releaseSafeRestartClaim(taskId, claimId) {
    taskId = str(taskId, 120); claimId = str(claimId, 120);
    const checkpoint = latestCheckpoint(taskId);
    if (!taskId || !claimId || !checkpoint || checkpoint.stage !== 'resume-claimed' || checkpoint.recoveryClaimId !== claimId) return { ok: false, reason: 'claim-not-owned', recovery: recovery(taskId) };
    const released = recordCheckpoint(Object.assign({}, checkpoint, { stage: 'contract', recoveryClaimId: '', recoveryClaimedAt: null }));
    return { ok: true, checkpoint: released, recovery: recovery(taskId) };
  }

  function fenceSafeRestartClaim(taskId, claimId) {
    taskId = str(taskId, 120); claimId = str(claimId, 120);
    const checkpoint = latestCheckpoint(taskId);
    if (!taskId || !claimId || !checkpoint || checkpoint.stage !== 'resume-claimed' || checkpoint.recoveryClaimId !== claimId) return { ok: false, reason: 'claim-not-owned', recovery: recovery(taskId) };
    const fenced = recordCheckpoint(Object.assign({}, checkpoint, { stage: 'dispatch' }));
    return { ok: true, checkpoint: fenced, recovery: recovery(taskId) };
  }

  function commitRecoveryReconciliation(entry) {
    const taskId = str(entry && entry.taskId, 120);
    const current = latestCheckpoint(taskId);
    if (!taskId || !current) return { ok: false, reason: 'reconciliation-checkpoint-missing' };
    const expectedActionId = 'team.delegate_managed:' + taskId;
    const candidate = sanitizeReconciliation(entry, num(clock.now()));
    if (candidate.actionId !== expectedActionId) return { ok: false, reason: 'reconciliation-action-identity-mismatch' };
    if (!candidate.expectedCheckpointStage || !candidate.expectedCheckpointTs) return { ok: false, reason: 'reconciliation-checkpoint-token-required' };
    if (current.stage !== candidate.expectedCheckpointStage || current.ts !== candidate.expectedCheckpointTs) return { ok: false, reason: 'stale-recovery-state' };
    if (current.stage === 'contract' || current.stage === 'resume-claimed') return { ok: false, reason: 'reconciliation-not-required' };
    if (candidate.decision === 'CONTINUE_CONFIRMED' && candidate.outcome !== 'APPLIED_CONFIRMED') return { ok: false, reason: 'applied-confirmation-required' };
    if (candidate.decision === 'RETRY_ALLOWED' && candidate.outcome !== 'NOT_APPLIED_CONFIRMED') return { ok: false, reason: 'not-applied-confirmation-required' };
    if (candidate.decision === 'FREEZE_UNKNOWN' && candidate.outcome !== 'UNKNOWN') return { ok: false, reason: 'unknown-outcome-required' };

    const prior = reconciliations.get(taskId);
    if (prior && prior.expectedCheckpointTs === current.ts && prior.expectedCheckpointStage === current.stage) {
      if (prior.actionId === candidate.actionId && prior.decision === candidate.decision && prior.outcome === candidate.outcome && prior.providerRef === candidate.providerRef) {
        return { ok: true, duplicate: true, record: Object.assign({}, prior) };
      }
      return { ok: false, reason: 'reconciliation-conflict' };
    }
    io.append(candidate);
    reconciliations.set(taskId, candidate);
    return { ok: true, duplicate: false, record: Object.assign({}, candidate) };
  }

  function listRows(filter, options) {
    filter = filter || {}; options = options || {};
    const cap = Math.max(1, Math.min(1000, Math.floor(num(options.limit) || defaultLimit)));
    let out = rows;
    if (filter.taskId) out = out.filter(r => r.taskId === filter.taskId);
    if (filter.agentId) out = out.filter(r => r.leadAgentId === filter.agentId || r.workerAgentId === filter.agentId || r.auditorAgentId === filter.agentId);
    if (filter.status) out = out.filter(r => r.status === filter.status);
    return out.slice(-cap).reverse().map(r => Object.assign({}, r));
  }

  function summary() { return summarizeManagedTasks(rows, { windowCapacity: ramMax, truncated }); }

  return { record, recordCheckpoint, latestCheckpoint, recovery, listRecoveries, claimSafeRestart, releaseSafeRestartClaim, fenceSafeRestartClaim,
    commitRecoveryReconciliation, list: listRows, all: () => rows.map(r => Object.assign({}, r)), count: () => rows.length, summary };
}

module.exports = { makeTaskHistoryStore, sanitize, sanitizeCheckpoint, sanitizeReconciliation, recoveryDisposition };
