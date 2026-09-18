/* sidecar/control/action-view.js — pure, read-only Control Mode tool/action trace projection.
   The durable run journal remains authoritative. This module deliberately projects only bounded
   execution metadata and never exposes tool arguments, model-visible result content, replay fingerprints,
   hashes, recovery checkpoints, or other journal internals that may contain workspace/user data. */
'use strict';

function text(value, max) {
  const s = value == null ? '' : String(value).trim();
  return s ? s.slice(0, max || 200) : '';
}
function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function bool(value) { return value === true ? true : (value === false ? false : null); }

function safeMeta(state) {
  const meta = state && state.meta && typeof state.meta === 'object' ? state.meta : {};
  return {
    runId: text(state && state.runId, 120),
    agentId: text(meta.agentId, 80),
    startedAt: finite(meta.startedAt),
    trigger: text(meta.trigger, 40),
    runStatus: text(state && state.status, 40),
    corrupt: !!(state && state.corrupt)
  };
}

function rowFrom(meta, phase, payload, result) {
  payload = payload && typeof payload === 'object' ? payload : {};
  result = result && typeof result === 'object' ? result : null;
  const row = {
    runId: meta.runId,
    agentId: meta.agentId,
    startedAt: meta.startedAt,
    trigger: meta.trigger,
    runStatus: meta.runStatus,
    corrupt: meta.corrupt,
    callId: text(payload.callId, 160),
    tool: text(payload.name, 160),
    phase,
    mutating: bool(payload.mutating)
  };
  if (result) {
    row.ok = bool(result.ok);
    row.isError = bool(result.isError);
    const summary = text(result.summary, 240);
    if (summary) row.summary = summary;
  }
  return row;
}

function projectRun(state) {
  if (!state || typeof state !== 'object') return [];
  const meta = safeMeta(state);
  if (!meta.runId) return [];
  const rows = [];
  const completed = Array.isArray(state.completed) ? state.completed : [];
  for (const item of completed) {
    if (!item || typeof item !== 'object') continue;
    const intent = item.intent && typeof item.intent === 'object' ? item.intent : {};
    const dispatch = item.dispatch && typeof item.dispatch === 'object' ? item.dispatch : null;
    const payload = Object.assign({}, intent, dispatch || {});
    const result = item.result && typeof item.result === 'object' ? item.result : {};
    rows.push(rowFrom(meta, 'completed', payload, result));
  }
  const pending = [
    ['prepared', state.replayablePrepared],
    ['dispatched', state.replayableReads],
    ['needs_review', state.uncertain]
  ];
  for (const [phase, list] of pending) {
    for (const item of Array.isArray(list) ? list : []) rows.push(rowFrom(meta, phase, item, null));
  }
  return rows;
}

function projectActionTrace(journalPage, options) {
  options = options || {};
  const page = journalPage && typeof journalPage === 'object' ? journalPage : {};
  const states = Array.isArray(page.rows) ? page.rows : (Array.isArray(journalPage) ? journalPage : []);
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  const all = [];
  for (const state of states) all.push(...projectRun(state));
  all.sort((a, b) => {
    const at = finite(a.startedAt) || 0, bt = finite(b.startedAt) || 0;
    return (bt - at) || a.runId.localeCompare(b.runId) || a.callId.localeCompare(b.callId) || a.phase.localeCompare(b.phase);
  });
  const rows = all.slice(0, limit);
  return {
    schemaVersion: 'moe.control-actions.v1',
    rows,
    evidence: {
      source: 'run-journal',
      journalRuns: states.length,
      journalTotal: finite(page.total),
      projectedRows: all.length,
      returnedRows: rows.length,
      bounded: all.length > rows.length,
      argumentsExposed: false,
      resultContentExposed: false,
      replayFingerprintsExposed: false,
      mutationsExposed: false
    }
  };
}

module.exports = { projectRun, projectActionTrace };
