/* sidecar/orchestration/task-history-http.js — bounded read-only HTTP surface for Control Mode.
   Pure handler factory: no ambient server/store/global state. The host injects the store + responder. */
'use strict';

const { projectManagedRecoveryList } = require('../control/recovery-view.js');
const ALLOWED_STATUS = new Set(['accepted', 'revised', 'rejected', 'dispatch_error', 'audit_error', 'contract_error']);
function clampLimit(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.max(1, Math.min(500, Math.floor(n)));
}
function clean(v, max) { return v == null ? '' : String(v).trim().slice(0, max); }
function encodeRecoveryCursor(row, filter) {
  const value = { v: 1, taskId: row.taskId, ts: row.checkpoint.ts, agent: filter.agentId, disposition: filter.disposition };
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
function decodeRecoveryCursor(raw, filter) {
  if (raw == null) return { ok: true, after: null };
  if (typeof raw !== 'string' || raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) return { ok: false, error: 'invalid recovery cursor' };
  let value;
  try {
    const bytes = Buffer.from(raw, 'base64url');
    if (!bytes.length || bytes.toString('base64url') !== raw) return { ok: false, error: 'invalid recovery cursor' };
    value = JSON.parse(bytes.toString('utf8'));
  } catch (_) { return { ok: false, error: 'invalid recovery cursor' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 1 ||
      typeof value.taskId !== 'string' || !value.taskId || value.taskId.length > 120 ||
      typeof value.ts !== 'number' || !Number.isFinite(value.ts) || value.ts < 0 ||
      typeof value.agent !== 'string' || typeof value.disposition !== 'string' ||
      Object.keys(value).sort().join(',') !== 'agent,disposition,taskId,ts,v') return { ok: false, error: 'invalid recovery cursor' };
  if (value.agent !== filter.agentId || value.disposition !== filter.disposition) {
    return { ok: false, error: 'recovery cursor does not match the current filters' };
  }
  return { ok: true, after: { taskId: value.taskId, ts: value.ts } };
}

function makeTaskHistoryHttp(opts) {
  opts = opts || {};
  const store = opts.store;
  const respondJson = opts.respondJson;
  if (!store || typeof store.list !== 'function' || typeof store.summary !== 'function') throw new Error('task history http requires store');
  if (typeof respondJson !== 'function') throw new Error('task history http requires respondJson');

  function send(res, code, body) { return respondJson(res, code, body); }
  function taskIdFrom(pathname, prefix) {
    let taskId = '';
    try { taskId = decodeURIComponent(pathname.slice(prefix.length)); }
    catch (_) { return { ok: false, error: 'invalid task id encoding' }; }
    taskId = clean(taskId, 120);
    if (!taskId || taskId.includes('/')) return { ok: false, error: 'invalid task id' };
    return { ok: true, taskId };
  }

  function serve(req, res) {
    try {
      const url = new URL(String(req && req.url || ''), 'http://127.0.0.1');
      const pathname = url.pathname;
      if (pathname === '/api/managed-tasks/summary') {
        return send(res, 200, {
          ok: true,
          summary: store.summary(),
          live: typeof store.activeSummary === 'function' ? store.activeSummary() : null
        });
      }
      if (pathname === '/api/managed-tasks/active') {
        if (typeof store.activeList !== 'function' || typeof store.activeSummary !== 'function') {
          return send(res, 503, { ok: false, error: 'managed task live telemetry unavailable' });
        }
        const agentId = clean(url.searchParams.get('agent'), 80);
        const rows = store.activeList({ agentId }).slice(0, clampLimit(url.searchParams.get('limit')));
        return send(res, 200, { ok: true, tasks: rows, summary: store.activeSummary() });
      }
      if (pathname === '/api/managed-task-recoveries') {
        if (typeof store.listRecoveries !== 'function') {
          return send(res, 503, { ok: false, error: 'managed task recovery listing unavailable' });
        }
        const agentId = clean(url.searchParams.get('agent'), 80);
        const disposition = clean(url.searchParams.get('disposition'), 48);
        const limit = clampLimit(url.searchParams.get('limit'));
        const filter = { agentId, disposition };
        const cursor = decodeRecoveryCursor(url.searchParams.get('cursor'), filter);
        if (!cursor.ok) return send(res, 400, { ok: false, error: cursor.error });
        let page;
        try { page = store.listRecoveries(filter, { limit, after: cursor.after }); }
        catch (error) {
          if (error && error.code === 'RECOVERY_CURSOR_EXPIRED') {
            return send(res, 410, { ok: false, error: 'recovery cursor expired; reload recovery history' });
          }
          throw error;
        }
        const rows = Array.isArray(page.items) ? page.items : [];
        const nextCursor = page.hasMore && rows.length ? encodeRecoveryCursor(rows[rows.length - 1], filter) : '';
        return send(res, 200, { ok: true, recoveries: projectManagedRecoveryList(page, { limit }),
          page: { hasMore: page.hasMore === true, storageTruncated: page.storageTruncated === true, nextCursor } });
      }
      if (pathname === '/api/managed-tasks') {
        const agentId = clean(url.searchParams.get('agent'), 80);
        const status = clean(url.searchParams.get('status'), 40);
        if (status && !ALLOWED_STATUS.has(status)) return send(res, 400, { ok: false, error: 'invalid status filter' });
        const rows = store.list({ agentId, status }, { limit: clampLimit(url.searchParams.get('limit')) });
        return send(res, 200, { ok: true, tasks: rows });
      }
      const recoveryPrefix = '/api/managed-task-recovery/';
      if (pathname.startsWith(recoveryPrefix)) {
        const parsedId = taskIdFrom(pathname, recoveryPrefix);
        if (!parsedId.ok) return send(res, 400, { ok: false, error: parsedId.error });
        if (typeof store.recovery !== 'function') {
          return send(res, 503, { ok: false, error: 'managed task recovery state unavailable' });
        }
        const recovery = store.recovery(parsedId.taskId);
        if (!recovery || recovery.state === 'UNKNOWN_TASK') {
          return send(res, 404, { ok: false, taskId: parsedId.taskId, state: 'UNKNOWN_TASK', recovery: recovery || null });
        }
        return send(res, 200, { ok: true, taskId: parsedId.taskId, state: recovery.state, recovery });
      }
      const prefix = '/api/managed-tasks/';
      if (pathname.startsWith(prefix)) {
        const parsedId = taskIdFrom(pathname, prefix);
        if (!parsedId.ok) return send(res, 400, { ok: false, error: parsedId.error });
        const rows = store.list({ taskId: parsedId.taskId }, { limit: 501 });
        if (!rows.length) return send(res, 404, { ok: false, error: 'managed task not found' });
        const summary = store.summary();
        const history = rows.slice(0, 500);
        const bounded = rows.length > history.length || !summary || !summary.window || summary.window.truncated !== false;
        return send(res, 200, { ok: true, taskId: parsedId.taskId, history,
          historyWindow: { returnedRows: history.length, limit: 500, bounded } });
      }
      return send(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
      return send(res, 500, { ok: false, error: 'could not read managed task history: ' + String((e && e.message) || e) });
    }
  }

  return { serve, clampLimit };
}

module.exports = { makeTaskHistoryHttp, clampLimit, encodeRecoveryCursor, decodeRecoveryCursor };
