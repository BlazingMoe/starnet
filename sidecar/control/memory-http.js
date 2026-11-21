/* sidecar/control/memory-http.js — bounded GET-only memory metadata surface for Control Mode. */
'use strict';

const { projectMemoryOverview } = require('./memory-view.js');

function clamp(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(50, Math.floor(n))) : 12;
}
function rosterEntries(roster) {
  if (roster instanceof Map) return Array.from(roster.entries());
  if (roster && typeof roster === 'object') return Object.keys(roster).map(k => [k, roster[k]]);
  return [];
}
function makeMemoryControlHttp(opts) {
  opts = opts || {};
  const roster = typeof opts.roster === 'function' ? opts.roster : null;
  const recordsForAgent = typeof opts.recordsForAgent === 'function' ? opts.recordsForAgent : null;
  const respondJson = opts.respondJson;
  if (!roster) throw new Error('memory control http requires roster');
  if (!recordsForAgent) throw new Error('memory control http requires recordsForAgent');
  if (typeof respondJson !== 'function') throw new Error('memory control http requires respondJson');

  function send(res, code, body) { return respondJson(res, code, body); }
  function serve(req, res) {
    try {
      const url = new URL(String(req && req.url || ''), 'http://127.0.0.1');
      if (url.pathname !== '/api/control/memory') return send(res, 404, { ok:false, error:'not found' });
      const method = String(req && req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') return send(res, 405, { ok:false, error:'read-only endpoint' });
      const rows = [];
      for (const [agentId, rec] of rosterEntries(roster())) {
        let records = null;
        try {
          const value = recordsForAgent(String(agentId));
          records = Array.isArray(value) ? value : null;
        } catch (_) { records = null; }
        rows.push({ agentId:String(agentId), name:rec && rec.name, records });
      }
      const overview = projectMemoryOverview(rows, { perAgentLimit: clamp(url.searchParams.get('perAgent')) });
      return send(res, 200, { ok:true, overview });
    } catch (e) {
      return send(res, 500, { ok:false, error:'could not read memory overview: ' + String((e && e.message) || e) });
    }
  }
  return Object.freeze({ serve });
}

module.exports = { makeMemoryControlHttp, clamp };
