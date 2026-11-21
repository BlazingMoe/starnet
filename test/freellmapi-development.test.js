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
  A.eq(JSON.stringify(M.ROUTES.map(route => route.model)), JSON.stringify(['mistral-small-3.2-24b', 'llama-3.3-70b', 'nemotron-3-ultra-550b']), 'three validated consequence routes stay explicit');
  A.eq(JSON.stringify(M.ROUTES.map(route => route.fallbackModel)), JSON.stringify(['auto:fast', 'auto:balanced', 'auto:smart']), 'availability fallbacks stay explicit');
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

  const routeReadiness = M.routeReadiness({ readyIds: ['mistral-small-3.2-24b', 'nemotron-3-ultra-550b'] });
  A.eq(routeReadiness[0].selectedModel, 'mistral-small-3.2-24b', 'ready preferred model is selected');
  A.eq(routeReadiness[1].selectedModel, 'auto:balanced', 'unavailable preferred model falls back explicitly');
  A.eq(routeReadiness[2].selectedModel, 'nemotron-3-ultra-550b', 'smart route keeps its validated preferred model');

  const desktopCalls = [];
  const desktopKey = await M.desktopApiKey({
    baseUrl: 'http://127.0.0.1:31415',
    fetchImpl: async (url, options = {}) => {
      desktopCalls.push({ url, options });
      if (url.endsWith('/desktop-session')) return { ok: true, status: 200, json: async () => ({ token: 'session-only' }) };
      return { ok: true, status: 200, json: async () => ({ apiKey: 'unified-only' }) };
    }
  });
  A.eq(desktopKey, 'unified-only', 'desktop session resolves the unified key in memory');
  A.eq(desktopCalls.length, 2, 'desktop key resolution uses the two documented loopback calls');
  A.ok(desktopCalls[1].options.headers.authorization === 'Bearer session-only', 'desktop session token stays in an authorization header');

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

  const draftCalls = [];
  const draft = await M.requestDraft({
    routeId: 'mechanical',
    prompt: 'Synthetic task only',
    baseUrl: 'http://127.0.0.1:31415',
    apiKey: 'test-only-placeholder',
    maxTokens: 64,
    fetchImpl: async (url, options = {}) => {
      draftCalls.push({ url, options });
      if (url.includes('/v1/models')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'mistral-small-3.2-24b', available: true }] }) };
      return {
        ok: true,
        status: 200,
        headers: { get: name => name === 'x-routed-via' ? 'ovh/test' : null },
        json: async () => ({ choices: [{ message: { content: 'draft' } }], usage: { total_tokens: 3 } })
      };
    }
  });
  A.eq(draft.requestedModel, 'mistral-small-3.2-24b', 'draft uses a ready validated model');
  A.eq(draft.content, 'draft', 'draft content is returned');
  A.ok(draft.untrustedDraft, 'draft is explicitly marked untrusted');
  const draftBody = JSON.parse(draftCalls[1].options.body);
  A.eq(draftBody.max_tokens, 64, 'draft max token budget is bounded');
  A.ok(draftCalls[1].options.headers.authorization.startsWith('Bearer '), 'draft key stays in authorization header');

  await rejects(() => M.checkGateway({ baseUrl: 'http://127.0.0.1:3001', apiKey: '', fetchImpl: async () => null }), /API_KEY/, 'missing unified key fails before network');
  await rejects(() => M.checkGateway({ baseUrl: 'http://127.0.0.1:3001', apiKey: 'x', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'm', execution_status: 'exhausted' }] }) }) }), /zero ready/, 'zero ready models is not usable');

  console.log('freellmapi-development.test: OK');
  A.report('freellmapi-development.test');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
