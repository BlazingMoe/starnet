'use strict';
const A = require('./_assert.js');
const { makeActionControlHttp } = require('../sidecar/control/action-http.js');

const states = [{
  runId: 'run-1', status: 'resumable', corrupt: false,
  meta: { agentId: 'worker', startedAt: 200, trigger: 'manual', privateTitle: 'do-not-leak-title' },
  completed: [{
    intent: { callId: 'c1', name: 'fs.read', argsRaw: '{"path":"/secret.txt"}', replayFingerprint: 'do-not-leak-fingerprint', mutating: false },
    dispatch: { callId: 'c1', name: 'fs.read', mutating: false },
    result: { callId: 'c1', ok: true, isError: false, summary: 'read complete', content: 'do-not-leak-content' }
  }],
  replayablePrepared: [{ callId: 'c2', name: 'browser.open', mutating: false, argsRaw: 'private-url' }],
  replayableReads: [{ callId: 'c3', name: 'web.fetch', mutating: false, argsRaw: 'private-token' }],
  uncertain: [{ callId: 'c4', name: 'fs.write', mutating: true, argsRaw: 'private-write' }]
}];

function responseSink() {
  const calls = [];
  return {
    calls,
    respondJson(res, code, body) { const out = { res, code, body }; calls.push(out); return out; }
  };
}

const reads = [];
const sink = responseSink();
const http = makeActionControlHttp({
  recoverPage(options) { reads.push(options); return { rows: states, total: 7, offset: options.offset, limit: options.limit }; },
  respondJson: sink.respondJson
});

let out = http.serve({ method: 'GET', url: '/api/control/actions' }, {});
A.eq(out.code, 200, 'GET succeeds');
A.eq(JSON.stringify(reads[0]), JSON.stringify({ offset: 0, limit: 100 }), 'missing query parameters preserve bounded journal defaults');
A.eq(out.body.ok, true, 'GET response is explicit success');
A.eq(out.body.trace.schemaVersion, 'moe.control-actions.v1', 'existing action projection is reused');
A.eq(out.body.trace.evidence.source, 'run-journal', 'durable journal remains the named source');
A.eq(out.body.trace.evidence.journalTotal, 7, 'journal total is preserved');
A.eq(out.body.trace.rows.length, 4, 'journal-backed action states are projected');

const serialized = JSON.stringify(out.body);
for (const forbidden of ['do-not-leak-title', '/secret.txt', 'do-not-leak-fingerprint', 'do-not-leak-content', 'private-url', 'private-token', 'private-write']) {
  A.ok(!serialized.includes(forbidden), 'HTTP surface must not leak sensitive journal data: ' + forbidden);
}
A.ok(!serialized.includes('argsRaw'), 'raw arguments are not exposed');
A.ok(!serialized.includes('replayFingerprint'), 'replay fingerprints are not exposed');

out = http.serve({ method: 'GET', url: '/api/control/actions?offset=-4&runs=999&limit=2' }, {});
A.eq(out.code, 200, 'bounded GET succeeds');
A.eq(JSON.stringify(reads[1]), JSON.stringify({ offset: 0, limit: 500 }), 'journal pagination is clamped to safe bounds');
A.eq(out.body.trace.rows.length, 2, 'action projection limit is independently bounded');
A.eq(out.body.trace.evidence.bounded, true, 'action truncation remains explicit');

const readsBeforeHead = reads.length;
out = http.serve({ method: 'HEAD', url: '/api/control/actions?runs=1&limit=1' }, {});
A.eq(out.code, 200, 'HEAD is read-only and supported');
A.eq(reads.length, readsBeforeHead + 1, 'HEAD reads the authoritative journal exactly once');

const readsBeforePost = reads.length;
out = http.serve({ method: 'POST', url: '/api/control/actions' }, {});
A.eq(out.code, 405, 'mutating method is rejected');
A.eq(reads.length, readsBeforePost, 'rejected mutation never touches journal source');

out = http.serve({ method: 'GET', url: '/api/control/not-actions' }, {});
A.eq(out.code, 404, 'unrelated path is rejected');

const failingSink = responseSink();
const failing = makeActionControlHttp({
  recoverPage() { throw new Error('journal unavailable'); },
  respondJson: failingSink.respondJson
});
out = failing.serve({ method: 'GET', url: '/api/control/actions' }, {});
A.eq(out.code, 500, 'journal failure does not masquerade as an empty trace');
A.ok(String(out.body.error).includes('journal unavailable'), 'source failure is reported truthfully');

A.report('control-action-http.test');
