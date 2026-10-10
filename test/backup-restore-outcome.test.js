'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/app/backup.js'), 'utf8');
const { mergeNotes } = require('../sidecar/notebookrestore.js');
async function run({ mode = 'ok', mirror = true, notes = true, repeat = false } = {}) {
  const store = new Map(); let persisted = [], pushed = null, calls = 0;
  const ctx = {
    module: { exports: {} }, AbortController, console,
    setTimeout: fn => setTimeout(fn, 15), clearTimeout,
    localStorage: { setItem: (k,v) => store.set(k,String(v)), getItem: k => store.get(k) || null },
    FileReader: class { readAsText(text) { this.result = text; this.onload(); } },
    CloudSave: { push: d => { pushed = d; }, flush: async options => {
      assert.equal(options.force, true); assert.ok(pushed.updatedAt > 1);
      if (mirror === 'throw') throw Error('offline'); return mirror;
    } },
    fetch: async (url, options) => {
      calls++; assert.equal(url, '/api/notebook/restore');
      if (mode === 'offline') throw Error('offline');
      if (mode === 'timeout') return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted'))));
      if (mode === 'http') return { ok: false };
      if (mode === 'json') return { ok: true, json: async () => { throw Error('json'); } };
      if (mode === 'bad') return { ok: true, json: async () => ({ ok: true, added: '0', total: 1 }) };
      const incoming = JSON.parse(options.body).notes, before = persisted.length;
      persisted = mergeNotes(persisted, incoming);
      return { ok: true, json: async () => ({ ok: true, added: persisted.length-before, total: persisted.length }) };
    }
  };
  vm.runInNewContext(source,ctx);
  const text = JSON.stringify({ schema: 'starnet.backup', version: 1, store: {
    'starnet.save': JSON.stringify({ schema: 'starnet.save', updatedAt: 1, agent: { name: 'Moe' } }),
    'starnet.byok.key': 'NEVER_IMPORT'
  }, notebook: notes ? [{ id: 'note1', title: 'Keep', body: 'Evidence' }] : [] });
  const result = await ctx.module.exports.importFile(text);
  assert.equal(store.has('starnet.byok.key'), false);
  assert.equal(JSON.parse(store.get('starnet.save')).agent.name, 'Moe');
  if (repeat) {
    const again = await ctx.module.exports.importFile(text);
    assert.equal(again.partial, false); assert.equal(again.memoriesRestored, 0);
    assert.equal(again.notebookRestore.status, 'confirmed'); assert.equal(persisted.length, 1);
  }
  return { result, calls };
}
(async () => {
  const { result: full } = await run({ repeat: true });
  assert.equal(full.partial, false); assert.equal(full.durableSave, 'confirmed'); assert.equal(full.memoriesRestored, 1);
  for (const mode of ['offline','timeout','http','json','bad']) {
    const { result } = await run({ mode });
    assert.equal(result.ok,true); assert.equal(result.partial,true);
    assert.equal(result.notebookRestore.status,'unconfirmed');
    assert.equal(Object.hasOwn(result,'memoriesRestored'),false);
  }
  for (const mirror of [false, 'throw']) {
    const { result } = await run({ mirror });
    assert.equal(result.partial,true); assert.equal(result.durableSave,'unconfirmed'); assert.equal(result.memoriesRestored,1);
  }
  const empty = await run({ notes:false });
  assert.equal(empty.calls,0); assert.equal(empty.result.partial,false);
  assert.equal(empty.result.notebookRestore.status,'not-requested');
  const app = fs.readFileSync(path.join(__dirname,'../frontend/app/app.js'),'utf8');
  assert.match(app,/if \(r\.partial\) \{[\s\S]*?Keep your backup[\s\S]*?return;[\s\S]*?SFX\.boot/);
  console.log('backup-restore-outcome: confirmed, partial, timeout, retry and secret exclusion passed');
})().catch(e => { console.error(e); process.exitCode=1; });
