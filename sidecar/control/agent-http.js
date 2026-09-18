/* sidecar/control/agent-http.js — bounded GET-only HTTP surface for the Control Mode organization view. */
'use strict';

const { projectAgentOrganization } = require('./agent-view.js');

function makeAgentControlHttp(opts) {
  opts = opts || {};
  const roster = typeof opts.roster === 'function' ? opts.roster : null;
  const statusByAgent = opts.statusByAgent;
  const respondJson = opts.respondJson;
  if (!roster) throw new Error('agent control http requires roster');
  if (typeof respondJson !== 'function') throw new Error('agent control http requires respondJson');

  function send(res, code, body) { return respondJson(res, code, body); }

  function serve(req, res) {
    try {
      const url = new URL(String(req && req.url || ''), 'http://127.0.0.1');
      if (url.pathname !== '/api/control/agents') return send(res, 404, { ok: false, error: 'not found' });
      const method = String(req && req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') return send(res, 405, { ok: false, error: 'read-only endpoint' });
      const current = roster();
      const organization = projectAgentOrganization(current, { statusByAgent });
      return send(res, 200, { ok: true, organization });
    } catch (e) {
      return send(res, 500, { ok: false, error: 'could not read agent organization: ' + String((e && e.message) || e) });
    }
  }

  return Object.freeze({ serve });
}

module.exports = { makeAgentControlHttp };
