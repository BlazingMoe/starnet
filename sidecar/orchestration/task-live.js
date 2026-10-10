'use strict';

function str(v, max) {
  const s = v == null ? '' : String(v).trim();
  return max ? s.slice(0, max) : s;
}
function finite(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }

function makeTaskLiveTracker(opts) {
  opts = opts || {};
  const clock = opts.clock;
  if (!clock || typeof clock.now !== 'function') throw new Error('task live tracker requires injected clock');
  const maxActive = Math.max(1, Math.min(10000, Math.floor(finite(opts.maxActive) || 1000)));
  const active = new Map();
  let seq = 0;

  function begin(entry) {
    entry = entry || {};
    const taskId = str(entry.taskId, 120);
    const leadAgentId = str(entry.leadAgentId, 80);
    const workerAgentId = str(entry.workerAgentId, 80);
    if (!taskId || !leadAgentId || !workerAgentId) throw new Error('active task requires taskId, leadAgentId, workerAgentId');
    if (active.size >= maxActive) throw new Error('active task tracker capacity exceeded');
    const startedAt = Math.max(0, finite(entry.startedAt)) || Math.max(0, finite(clock.now()));
    const token = 'live_' + (++seq) + '_' + taskId;
    active.set(token, {
      schemaVersion: 'moe.managed-task-live.v1',
      token,
      taskId,
      parentTaskId: str(entry.parentTaskId, 120),
      parentRunId: str(entry.parentRunId, 120),
      leadAgentId,
      workerAgentId,
      auditorAgentId: str(entry.auditorAgentId, 80),
      objective: str(entry.objective, 2000),
      stage: str(entry.stage || 'dispatch', 40),
      startedAt
    });
    return token;
  }

  function end(token) {
    token = str(token, 240);
    if (!token) return false;
    return active.delete(token);
  }

  function update(token, patch) {
    token = str(token, 240);
    const row = active.get(token);
    if (!row) return false;
    patch = patch || {};
    if (patch.stage != null) row.stage = str(patch.stage, 40);
    if (patch.auditorAgentId != null) row.auditorAgentId = str(patch.auditorAgentId, 80);
    return true;
  }

  function list(filter) {
    filter = filter || {};
    const agentId = str(filter.agentId, 80);
    const taskId = str(filter.taskId, 120);
    const now = Math.max(0, finite(clock.now()));
    let rows = Array.from(active.values());
    if (taskId) rows = rows.filter(r => r.taskId === taskId);
    if (agentId) rows = rows.filter(r => r.leadAgentId === agentId || r.workerAgentId === agentId || r.auditorAgentId === agentId);
    return rows
      .map(r => Object.assign({}, r, { elapsedMs: Math.max(0, now - r.startedAt) }))
      .sort((a, b) => a.startedAt - b.startedAt || a.token.localeCompare(b.token));
  }

  function summary() {
    const rows = list({});
    const byStage = {};
    const byWorker = {};
    for (const row of rows) {
      byStage[row.stage] = (byStage[row.stage] || 0) + 1;
      byWorker[row.workerAgentId] = (byWorker[row.workerAgentId] || 0) + 1;
    }
    return {
      schemaVersion: 'moe.managed-task-live-summary.v1',
      active: rows.length,
      oldestElapsedMs: rows.reduce((m, r) => Math.max(m, r.elapsedMs), 0),
      byStage,
      byWorker
    };
  }

  return { begin, end, update, list, summary, count: () => active.size };
}

module.exports = { makeTaskLiveTracker };
