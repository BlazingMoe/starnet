/* node test/model-provider-reconcile.test.js — regression for a saved direct-Anthropic model crossing into
   the managed StarNet provider after relink/update. The live catalog is the authority: an exact routed
   equivalent is persisted, while a model absent from a successful catalog is cleared instead of reinserted. */
'use strict';
const A = require('./_assert.js');
const path = require('path');

const dockPath = path.join(__dirname, '..', 'frontend', 'app', 'modeldock.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scenario(savedModel, catalog, switchFrom) {
  let model = savedModel;
  let provider = switchFrom || 'starnet';
  let effort = 'medium';
  const applied = [];
  const old = { document: global.document, localStorage: global.localStorage, Harness: global.Harness, U: global.U };
  global.document = {
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {},
    createElement() { return {}; },
    createDocumentFragment() { return { appendChild() {} }; }
  };
  global.localStorage = { getItem() { return '1'; }, setItem() {} };
  global.U = { esc: s => String(s) };
  global.Harness = {
    getProv: () => provider,
    setProv: v => { provider = v; },
    getModel: () => model,
    setModel: v => { model = v; },
    getReasoningEffort: () => effort,
    setReasoningEffort: v => { effort = v; },
    normalizeReasoningEffort: v => String(v || 'medium'),
    configured: p => p === 'starnet',
    getKey: () => '',
    getBaseUrl: () => '',
    listModels: async () => [],
    apiFetch: async url => {
      if (url === '/api/models/starnet') return new Response(JSON.stringify({ provider: 'starnet', models: catalog }), { status: 200 });
      if (/^\/api\/auth\/(codex|grok|kimi)\/status$/.test(url)) return new Response(JSON.stringify({ connected: false }), { status: 200 });
      return new Response(JSON.stringify({ models: [], error: 'not configured' }), { status: 200 });
    }
  };

  delete require.cache[require.resolve(dockPath)];
  const ModelDock = require(dockPath);
  try {
    ModelDock.init({ apply: change => applied.push(change) });
    if (switchFrom) {
      await sleep(30);
      provider = 'starnet';
      await ModelDock.reconcile();
    }
    for (let i = 0; i < 100 && !applied.length; i++) await sleep(5);
    return { model, provider, effort, applied, internals: ModelDock._internals };
  } finally {
    delete require.cache[require.resolve(dockPath)];
    global.document = old.document;
    global.localStorage = old.localStorage;
    global.Harness = old.Harness;
    global.U = old.U;
  }
}

module.exports = (async () => {
  const live = [{ id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', supported_parameters: ['reasoning_effort', 'tools'] }];
  const mapped = await scenario('claude-sonnet-5', live, 'anthropic');
  A.eq(mapped.model, 'anthropic/claude-sonnet-5', 'direct Anthropic bare id maps to the catalog-confirmed managed id');
  A.eq(mapped.provider, 'starnet', 'provider remains StarNet during reconciliation');
  A.eq(mapped.applied.length, 1, 'the reconciled pair is persisted through the app callback exactly once');
  A.eq(mapped.applied[0].reason, 'catalog_reconcile', 'the UI can explain that it updated the model');
  A.eq(mapped.applied[0].previousModel, 'claude-sonnet-5', 'the notice names the stale saved value');

  const stale = await scenario('claude-sonnet-4-5', live);
  A.eq(stale.model, '', 'a model absent from a successful StarNet catalog is cleared, not silently used');
  A.eq(stale.applied[0].reason, 'catalog_unavailable', 'the app receives the explicit unavailable state');
  A.eq(stale.internals.catalogEquivalent('claude-sonnet-5', 'starnet', live), 'anthropic/claude-sonnet-5', 'mapping requires an exact live-catalog match');
  A.eq(stale.internals.catalogEquivalent('invented-model', 'starnet', live), '', 'mapping never invents a managed slug');

  A.report('model-provider-reconcile.test');
})().catch(e => { console.error(e); process.exitCode = 1; });
