/* sidecar/control/action-http.js — bounded GET-only action trace surface for Control Mode. */
'use strict';
const { projectActionTrace } = require('./action-view.js');

function boundedInt(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function makeActionControlHttp(opts) {
  opts = opts || {};
  const recoverPage = typeof opts.recoverPage === 'function' ? opts.recoverPage : null;
  const respondJson = opts.respondJson;
  if (!recoverPage) throw new Error('action control http requires run journal recoverPage');
  if (typeof respondJson !== 'function') throw new Error('action control http requires respondJson');

  function send(res, code, body) { return respondJson(res, code, body); }
  function serve(req, res) {
    try {
      const url = new URL(String(req && req.url || ''), 'http://127.0.0.1');
      if (url.pathname !== '/api/control/actions') return send(res, 404, { ok: false, error: 'not found' });
      const method = String(req && req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') return send(res, 405, { ok: false, error: 'read-only endpoint' });

      const offset = boundedInt(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
      const runLimit = boundedInt(url.searchParams.get('runs'), 100, 1, 500);
      const actionLimit = boundedInt(url.searchParams.get('limit'), 100, 1, 500);
      const page = recoverPage({ offset, limit: runLimit });
      const trace = projectActionTrace(page, { limit: actionLimit });
      return send(res, 200, { ok: true, trace });
    } catch (e) {
      return send(res, 500, { ok: false, error: 'could not read action trace: ' + String((e && e.message) || e) });
    }
  }

  return Object.freeze({ serve });
}

module.exports = { makeActionControlHttp };
