/* sidecar/orchestration/task-history.js — append-only managed delegation history.
   Pure store: injected io + clock, bounded RAM mirrors, no network/model access. */
'use strict';

const { summarizeManagedTasks } = require('./task-metrics.js');

const STATUS = new Set(['accepted', 'revised', 'rejected', 'dispatch_error', 'audit_error', 'contract_error']);
const STAGE = new Set(['contract', 'dispatch', 'revision', 'formal-review', 'audit', 'accepted']);
const MAX_ROWS = 10000;
const DEFAULT_LIMIT = 200;

function str(v, max) {
  const s = v == null ? '' : String(v);
  return max ? s.slice(0, max) : s;
}
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function list(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxItems).map(x => str(x, maxLen)).filter(Boolean);
}
function sanitize(entry, now) {
  entry = entry || {};
  return {
    schemaVersion: 'moe.managed-task-history.v1',
    taskId: str(entry.taskId, 120),
    parentTaskId: str(entry.parentTaskId, 120),
    parentRunId: str(entry.parentRunId, 120),
    leadAgentId: str(entry.leadAgentId, 80),
    workerAgentId: str(entry.workerAgentId, 80),
    auditorAgentId: str(entry.auditorAgentId, 80),
    objective: str(entry.objective, 2000),
    status: STATUS.has(entry.status) ? entry.status : 'rejected',
    stage: STAGE.has(entry.stage) ? entry.stage : 'formal-review',
    accepted: entry.accepted === true,
    attempts: Math.max(0, Math.floor(num(entry.attempts))),
    usd: Math.max(0, num(entry.usd)),
    workerUsd: Math.max(0, num(entry.workerUsd)),
    auditUsd: Math.max(0, num(entry.auditUsd)),
    budgetUsd: entry.budgetUsd == null ? null : Math.max(0, num(entry.budgetUsd)),
    budgetExceeded: entry.budgetExceeded === true,
    findings: list(entry.findings, 50, 500),
    riskFlags: list(entry.riskFlags, 50, 120),
    reason: str(entry.reason, 120),
    error: str(entry.error, 1000),
    acceptanceCriteria: list(entry.acceptanceCriteria, 50, 500),
    artifacts: list(entry.artifacts, 50, 500),
    sources: list(entry.sources, 100, 1000),
    startedAt: Math.max(0, num(entry.startedAt)),
    completedAt: Math.max(0, num(entry.completedAt)) || now,
    durationMs: Math.max(0, num(entry.durationMs)),
    ts: now
  };
}

function sanitizeCheckpoint(entry, now) {
  entry = entry || {};
  return {
    schemaVersion: 'moe.managed-task-checkpoint.v1',
    taskId: str(entry.taskId, 120),
    parentTaskId: str(entry.parentTaskId, 120),
    parentRunId: str(entry.parentRunId, 120),
    leadAgentId: str(entry.leadAgentId, 80),
    workerAgentId: str(entry.workerAgentId, 80),
    auditorAgentId: str(entry.auditorAgentId, 80),
    objective: str(entry.objective, 2000),
    acceptanceCriteria: list(entry.acceptanceCriteria, 50, 500),
    tags: list(entry.tags, 50, 120),
    deadlineAt: entry.deadlineAt == null ? null : Math.max(0, num(entry.deadlineAt)),
    budgetUsd: entry.budgetUsd == null ? null : Math.max(0, num(entry.budgetUsd)),
    requireAudit: entry.requireAudit === true,
    maxRevisions: Math.max(0, Math.min(3, Math.floor(num(entry.maxRevisions)))),
    stage: STAGE.has(entry.stage) ? entry.stage : 'dispatch',
    startedAt: Math.max(0, num(entry.startedAt)),
    ts: now
  };
}

function recoveryDisposition(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return { disposition: 'BLOCKED_NO_EVIDENCE', executionMayHaveStarted: null, reason: 'no-durable-checkpoint' };
  }
  if (checkpoint.stage === 'contract') {
    return { disposition: 'SAFE_RESTART', executionMayHaveStarted: false, reason: 'last-durable-stage-pre-dispatch' };
  }
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
  let truncated = false;
  try {
    const loaded = io.readAll();
    if (Array.isArray(loaded)) {
      const terminal = [];
      for (const row of loaded) {
        if (!row || typeof row !== 'object') continue;
        const taskId = str(row.taskId, 120);
        if (row.schemaVersion === 'moe.managed-task-checkpoint.v1') {
          if (taskId) {
            checkpoints.delete(taskId);
            checkpoints.set(taskId, row);
          }
        } else {
          terminal.push(row);
          if (taskId) checkpoints.delete(taskId);
        }
      }
      truncated = terminal.length > ramMax;
      rows = terminal.slice(-ramMax);
      while (checkpoints.size > ramMax) checkpoints.delete(checkpoints.keys().next().value);
    }
  } catch (_) { rows = []; checkpoints.clear(); }

  function record(entry) {
    const row = sanitize(entry, num(clock.now()));
    if (!row.taskId || !row.leadAgentId || !row.workerAgentId) throw new Error('task history requires taskId, leadAgentId, workerAgentId');
    io.append(row);
    checkpoints.delete(row.taskId);
    rows.push(row);
    if (rows.length > ramMax) {
      truncated = true;
      rows.splice(0, rows.length - ramMax);
    }
    return row;
  }

  function recordCheckpoint(entry) {
    const row = sanitizeCheckpoint(entry, num(clock.now()));
    if (!row.taskId || !row.leadAgentId || !row.workerAgentId) throw new Error('task checkpoint requires taskId, leadAgentId, workerAgentId');
    io.append(row);
    checkpoints.delete(row.taskId);
    checkpoints.set(row.taskId, row);
    while (checkpoints.size > ramMax) checkpoints.delete(checkpoints.keys().next().value);
    return Object.assign({}, row);
  }

  function latestCheckpoint(taskId) {
    const row = checkpoints.get(str(taskId, 120));
    return row ? Object.assign({}, row) : null;
  }

  function recovery(taskId) {
    taskId = str(taskId, 120);
    if (!taskId) return { state: 'UNKNOWN_TASK', checkpoint: null, terminal: null, disposition: 'BLOCKED_NO_EVIDENCE', executionMayHaveStarted: null, reason: 'task-id-missing' };
    const checkpoint = latestCheckpoint(taskId);
    let terminal = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].taskId === taskId) { terminal = Object.assign({}, rows[i]); break; }
    }
    if (terminal) {
      return {
        state: 'TERMINAL', checkpoint: null, terminal,
        disposition: 'NOT_APPLICABLE', executionMayHaveStarted: true, reason: 'terminal-result-recorded'
      };
    }
    if (checkpoint) {
      return Object.assign({ state: 'RESUME_REQUIRED', checkpoint, terminal: null }, recoveryDisposition(checkpoint));
    }
    return { state: 'UNKNOWN_TASK', checkpoint: null, terminal: null, disposition: 'BLOCKED_NO_EVIDENCE', executionMayHaveStarted: null, reason: 'no-durable-task-evidence' };
  }

  function listRows(filter, options) {
    filter = filter || {};
    options = options || {};
    const cap = Math.max(1, Math.min(1000, Math.floor(num(options.limit) || defaultLimit)));
    let out = rows;
    if (filter.taskId) out = out.filter(r => r.taskId === filter.taskId);
    if (filter.agentId) out = out.filter(r => r.leadAgentId === filter.agentId || r.workerAgentId === filter.agentId || r.auditorAgentId === filter.agentId);
    if (filter.status) out = out.filter(r => r.status === filter.status);
    return out.slice(-cap).reverse().map(r => Object.assign({}, r));
  }

  function summary() {
    return summarizeManagedTasks(rows, { windowCapacity: ramMax, truncated });
  }

  return {
    record,
    recordCheckpoint,
    latestCheckpoint,
    recovery,
    list: listRows,
    all: () => rows.map(r => Object.assign({}, r)),
    count: () => rows.length,
    summary
  };
}

module.exports = { makeTaskHistoryStore, sanitize, sanitizeCheckpoint, recoveryDisposition };
