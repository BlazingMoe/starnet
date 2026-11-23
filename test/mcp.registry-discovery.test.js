'use strict';
const assert = require('assert');
const Registry = require('../sidecar/mcp/registry-discovery.js');

let n = 0;
const ok = (value, message) => { assert.ok(value, message); n++; };
const eq = (actual, expected, message) => { assert.strictEqual(actual, expected, message); n++; };
const deep = (actual, expected, message) => { assert.deepStrictEqual(actual, expected, message); n++; };

function record(overrides) {
  const value = overrides || {};
  return {
    server: Object.assign({
      name: 'io.example/weather', title: 'Weather', description: 'Weather data', version: '1.2.3',
      websiteUrl: 'https://example.test/weather',
      repository: { url: 'https://github.com/example/weather', source: 'github' },
      remotes: [{ type: 'streamable-http', url: 'https://mcp.example.test/mcp' }]
    }, value.server || {}),
    _meta: { 'io.modelcontextprotocol.registry/official': Object.assign({ status: 'active', isLatest: true }, value.meta || {}) }
  };
}

function response(payload, options) {
  const opts = options || {};
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: opts.ok !== false,
    status: opts.status || 200,
    headers: { get: key => String(key).toLowerCase() === 'content-length' ? String(opts.contentLength == null ? Buffer.byteLength(body) : opts.contentLength) : null },
    text: async () => body
  };
}

(async () => {
  eq(Registry.normalizeQuery('  weather  '), 'weather', 'query is trimmed');
  assert.throws(() => Registry.normalizeQuery('ab'), error => error && error.code === 'INVALID_QUERY'); n++;
  assert.throws(() => Registry.normalizeQuery('bad\nquery'), error => error && error.code === 'INVALID_QUERY'); n++;
  assert.throws(() => Registry.normalizeQuery('x'.repeat(81)), error => error && error.code === 'INVALID_QUERY'); n++;

  const projected = Registry.projectRecord(record());
  eq(projected.name, 'io.example/weather', 'active latest entry is projected');
  eq(projected.remoteUrl, 'https://mcp.example.test/mcp', 'fixed HTTPS Streamable-HTTP URL is retained');
  eq(projected.canPrefill, true, 'header-free compatible remote can prefill');
  eq(projected.suggestedId, 'weather', 'bounded local id is suggested');
  eq(projected.repositoryUrl, 'https://github.com/example/weather', 'safe source link is retained');
  eq(Registry.projectRecord(record({ meta: { status: 'deprecated' } })), null, 'deprecated latest entry is excluded');
  eq(Registry.projectRecord(record({ meta: { isLatest: false } })), null, 'non-latest entry is excluded');

  const headerRemote = Registry.projectRecord(record({ server: { remotes: [{ type: 'streamable-http', url: 'https://mcp.example.test/mcp', headers: [{ name: 'Authorization', isSecret: true }] }] } }));
  eq(headerRemote.canPrefill, false, 'remote requiring headers is display-only');
  ok(headerRemote.unavailableReason.includes('header setup'), 'header refusal is explained');
  const templated = Registry.projectRecord(record({ server: { remotes: [{ type: 'streamable-http', url: 'https://{tenant}.example.test/mcp' }] } }));
  eq(templated.canPrefill, false, 'templated remote is not prefilled');
  const cleartext = Registry.projectRecord(record({ server: { remotes: [{ type: 'streamable-http', url: 'http://mcp.example.test/mcp' }] } }));
  eq(cleartext.canPrefill, false, 'cleartext remote is not prefilled');
  const sse = Registry.projectRecord(record({ server: { remotes: [{ type: 'sse', url: 'https://mcp.example.test/sse' }] } }));
  eq(sse.canPrefill, false, 'legacy SSE remote is not prefilled');
  const credentialUrl = Registry.projectRecord(record({ server: { websiteUrl: 'https://user:pass@example.test/', remotes: [] } }));
  eq(credentialUrl.websiteUrl, '', 'embedded credentials are removed from links');

  let seenUrl = '', seenOptions = null;
  const payload = { servers: [record(), record({ meta: { status: 'deprecated' } })], metadata: { nextCursor: 'opaque' } };
  const result = await Registry.search({ query: 'weather', fetchImpl: async (url, options) => { seenUrl = url; seenOptions = options; return response(payload); } });
  eq(seenUrl, Registry.ORIGIN + '/v0.1/servers?search=weather&version=latest&limit=10', 'search uses one fixed official latest-only endpoint');
  eq(seenOptions.method, 'GET', 'registry discovery is read-only');
  eq(seenOptions.redirect, 'error', 'redirects are refused');
  deep(result.entries.map(x => x.name), ['io.example/weather'], 'only active latest projected entries are returned');
  eq(result.moreAvailable, true, 'bounded first-page truncation remains visible');
  ok(result.notice.includes('not trust or liveness evidence'), 'response carries the trust boundary');

  await assert.rejects(() => Registry.search({ query: 'weather', fetchImpl: async () => response('{}', { status: 503, ok: false }) }), error => error && error.code === 'REGISTRY_UNAVAILABLE'); n++;
  await assert.rejects(() => Registry.search({ query: 'weather', fetchImpl: async () => response('{bad') }), error => error && error.code === 'REGISTRY_INVALID_RESPONSE'); n++;
  await assert.rejects(() => Registry.search({ query: 'weather', fetchImpl: async () => response({ servers: [] }, { contentLength: Registry.MAX_RESPONSE_BYTES + 1 }) }), error => error && error.code === 'REGISTRY_RESPONSE_TOO_LARGE'); n++;
  await assert.rejects(() => Registry.search({ query: 'weather', fetchImpl: async () => ({
    ok: true, status: 200, headers: { get: () => null },
    body: (async function * () { yield Buffer.alloc(Registry.MAX_RESPONSE_BYTES); yield Buffer.from('x'); })()
  }) }), error => error && error.code === 'REGISTRY_RESPONSE_TOO_LARGE'); n++;

  let calls = 0;
  await Registry.search({ query: 'weather service', fetchImpl: async () => { calls++; return response({ servers: Array.from({ length: 30 }, (_, i) => record({ server: { name: 'io.example/weather-' + i } })), metadata: {} }); } });
  eq(calls, 1, 'one search produces exactly one registry request');

  console.log('mcp.registry-discovery.test: OK (' + n + ' assertions)');
})().catch(error => { console.error(error); process.exit(1); });
