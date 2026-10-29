'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/app/backup.js'), 'utf8');

function fixture() {
  const store = new Map([['starnet.save', JSON.stringify({ schema: 'starnet.save', updatedAt: 5, agent: { name: 'Current' } })]]);
  let writes = 0, pushes = 0, flushes = 0, requests = 0;
  const ctx = {
    module: { exports: {} }, console,
    localStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => { writes++; store.set(key, String(value)); }
    },
    FileReader: class { readAsText(file) { this.result = file.text; this.onload(); } },
    CloudSave: { push: () => { pushes++; }, flush: async () => { flushes++; return true; } },
    fetch: async () => { requests++; return { ok: true, json: async () => ({ ok: true, added: 1, total: 1 }) }; }
  };
  vm.runInNewContext(source, ctx);
  const valid = JSON.stringify({ schema: 'starnet.backup', version: 1, store: {
    'starnet.save': JSON.stringify({ schema: 'starnet.save', updatedAt: 1, agent: { name: 'Incoming' } }),
    'starnet.station.v1': JSON.stringify({ theme: 'amber' })
  }, notebook: [{ id: 'n1', title: 'Incoming memory', body: 'fixture' }] });
  return {
    Backup: ctx.module.exports, valid, store,
    counts: () => ({ writes, pushes, flushes, requests })
  };
}

async function run() {
  const f = fixture();
  const before = Object.fromEntries(f.store);
  const refused = await f.Backup.importFile({ text: f.valid });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /Online restore is unavailable; preserve your backup/);
  assert.match(refused.error, /durable workspace.*browser-local settings/);
  assert.deepEqual(f.counts(), { writes: 0, pushes: 0, flushes: 0, requests: 0 });
  assert.deepEqual(Object.fromEntries(f.store), before, 'valid import leaves existing browser records byte-for-byte unchanged');

  const malformed = await f.Backup.importFile({ text: '{truncated' });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error, 'file is not valid JSON');
  const invalid = await f.Backup.importFile({ text: JSON.stringify({ schema: 'other', version: 1, store: {} }) });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, 'not a StarNet backup file');
  assert.deepEqual(f.counts(), { writes: 0, pushes: 0, flushes: 0, requests: 0 }, 'malformed and invalid files also have no side effects');
  assert.deepEqual(Object.fromEntries(f.store), before);

  const cancelled = await f.Backup.importFile(null);
  assert.equal(cancelled.ok, false);
  assert.deepEqual(f.counts(), { writes: 0, pushes: 0, flushes: 0, requests: 0 }, 'cancel/no selection cannot mutate local or durable state');

  // Keep validation and the legacy low-level application behavior covered for a future gated implementation. This confirms
  // refusal is at the live file entry point, not a weakened parser or loss of legacy migration behavior.
  assert.equal(f.Backup.validate(JSON.parse(f.valid)), null);
  const applied = f.Backup.applyBundle({ schema: 'skynet.backup', version: 1, store: {
    'skynet.save': JSON.stringify({ schema: 'starnet.save', agent: { name: 'Legacy' } }),
    'skynet.station.v1': JSON.stringify({ theme: 'green' })
  } });
  assert.equal(applied.ok, true);
  assert.equal(JSON.parse(f.store.get('starnet.save')).agent.name, 'Legacy');
  const beforeUi = f.counts();

  const app = fs.readFileSync(path.join(__dirname, '../frontend/app/app.js'), 'utf8');
  assert.doesNotMatch(app, /Browser records restored; not confirmed/);
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  assert.match(html, /online restore is unavailable — preserve your file/);
  const handlerStart = app.indexOf('    const dataStatus = m => { const n = el(\'data-status\');');
  const handlerEnd = app.indexOf('    // FORWARD-VERSION GATE (P0.3)', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'production file-import handler is located');
  const runHandler = new Function('el', 'Backup', 'SFX', app.slice(handlerStart, handlerEnd));
  const file = { value: '', files: [], click() {} }, button = { onclick: null };
  const status = { textContent: '' }, sounds = [];
  runHandler(id => id === 'file-import' ? file : id === 'data-status' ? status : button, f.Backup, { click() {}, bad: () => sounds.push('bad') });
  button.onclick();
  file.files = [{ text: f.valid }];
  await file.onchange();
  assert.equal(status.textContent, refused.error, 'live UI displays the refusal beside the restore control');
  assert.deepEqual(sounds, ['bad'], 'live UI marks the refused restore as unsuccessful');
  assert.deepEqual(f.counts(), beforeUi, 'UI refusal does not mutate beyond the independent primitive test');
  file.files = [];
  await file.onchange();
  assert.deepEqual(f.counts(), beforeUi, 'cancelled picker does not invoke restore');
  console.log('backup-restore-outcome: online refusal, zero-mutation boundary, invalid/cancelled input and legacy primitives passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
