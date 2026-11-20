#!/usr/bin/env node
'use strict';
const A = require('./_assert.js');

(async () => {
  const M = await import('../scripts/freellmapi-development.mjs');
  const rejects = async (fn, pattern, message) => {
    let error = null;
    try { await fn(); } catch (caught) { error = caught; }
    A.ok(error && pattern.test(String(error.message || error)), message);
  };
  const throws = (fn, pattern, message) => {
    let error = null;
    try { fn(); } catch (caught) { error = caught; }
    A.ok(error && pattern.test(String(error.message || error)), message);
  };

  A.eq(M.REVIEWED_VERSION, '0.16.37', 'reviewed upstream release is pinned');
  A.eq(JSON.stringify(M.ROUTES.map(route => route.model)), JSON.stringify(['auto:fast', 'auto:balanced', 'auto:smart']), 'three consequence routes stay explicit');
  A.eq(M.normalizeBaseUrl('http://localhost:3001/v1/'), 'http://localhost:3001', 'normalizes the documented local API URL');
  throws(() => M.normalizeBaseUrl('https://gateway.example/v1'), /loopback/, 'remote gateways are refused');
  throws(() => M.normalizeBaseUrl('http://user:secret@127.0.0.1:3001'), /credential-free/, 'URL credentials are refused');

  const commands = M.setupCommands('http://127.0.0.1:3001');
  A.eq(commands.length, 3, 'one setup preview per route');
  for (const command of commands) {
    A.ok(command.includes('freellmapi@0.16.37'), 'setup CLI is version-pinned');
    A.ok(command.endsWith('--dry-run'), 'setup defaults to non-mutating preview');
    A.ok(!/api[_-]?key|secret|token/i.test(command), 'setup preview carries no credential');
  }

  const catalog = M.summarizeCatalog({ data: [
    { id: 'auto:fast' },
    { id: 'fusion' },
    { id: 'model-ready', execution_status: 'ready' },
    { id: 'model-down', execution_status: 'exhausted' },
    { id: 'model-compatible', available: true }
  ] });
  A.eq(catalog.catalogModels, 3, 'virtual router entries do not inflate real catalog count');
  A.eq(JSON.stringify(catalog.readyIds), JSON.stringify(['model-compatible', 'model-ready']), 'only ready real models are reported');
  throws(() => M.summarizeCatalog({ data: null }), /malformed/, 'malformed catalog fails closed');

  let seen;
  const ready = await M.checkGateway({
    baseUrl: 'http://127.0.0.1:3001/v1',
    apiKey: 'test-only-placeholder',
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'model-ready', execution_status: 'ready' }] }) };
    }
  });
  A.eq(seen.url, 'http://127.0.0.1:3001/v1/models?execution_status=ready', 'probe uses exact ready-model discovery endpoint');
  A.ok(seen.options.authorization == null && seen.options.headers.authorization.startsWith('Bearer '), 'key stays in authorization header');
  A.eq(ready.readyModels, 1, 'ready gateway passes');

  await rejects(() => M.checkGateway({ baseUrl: 'http://127.0.0.1:3001', apiKey: '', fetchImpl: async () => null }), /API_KEY/, 'missing unified key fails before network');
  await rejects(() => M.checkGateway({ baseUrl: 'http://127.0.0.1:3001', apiKey: 'x', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'm', execution_status: 'exhausted' }] }) }) }), /zero ready/, 'zero ready models is not usable');

  console.log('freellmapi-development.test: OK');
  A.report('freellmapi-development.test');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
