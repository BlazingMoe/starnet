'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { projectManagedRecoveryList } = require('../sidecar/control/recovery-view.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');

function harness(base) {
  class Element {
    constructor() { this.children = []; this.textContent = ''; this.hidden = true; this.isConnected = true; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
    querySelector() { return null; }
  }
  const panel = new Element();
  let body;
  const context = vm.createContext({
    document: { createElement: () => new Element(), getElementById: id => id === 'control-mode-panel' ? panel : null },
    MutationObserver: class { observe() {} }, setInterval: () => 1, clearInterval() {},
    Harness: { api: { get: endpoint => { assert.equal(endpoint, '/api/managed-task-recoveries?limit=100'); return body; } } }
  });
  vm.runInContext('window = globalThis', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', base, 'controlrecoveries.js'), 'utf8'), context);
  panel.hidden = false;
  const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  return async value => { body = value; await context.ControlModeRecoveries.refresh(); return text(panel); };
}
const envelope = (items, truncated = false) => ({ ok: true, recoveries: projectManagedRecoveryList({ items, truncated }) });
const safe = { taskId: 'safe', disposition: 'SAFE_RESTART', executionMayHaveStarted: false };
const uncertain = { taskId: 'uncertain', disposition: 'RECONCILE_BEFORE_RETRY', executionMayHaveStarted: true };

for (const base of ['frontend/app', 'website/app/app']) {
  test(`${base}: recovery summary reflects the authoritative returned window`, async () => {
    const render = harness(base);
    const complete = await render(envelope([safe, uncertain]));
    assert.match(complete, /2 SHOWN · 1 SAFE TO RESTART · 1 DO NOT RETRY · 0 REVIEW/);
    assert.doesNotMatch(complete, /2 TOTAL/);
    const bounded = await render(envelope([uncertain], true));
    assert.match(bounded, /1 SHOWN/);
    assert.match(bounded, /Additional recovery records may be omitted/);
    assert.match(bounded, /DO NOT RETRY/);
    const disk = [];
    const store = makeTaskHistoryStore({ clock: { now: () => 1000 }, io: { readAll: () => disk, append: row => disk.push(row) } });
    store.recordCheckpoint({ taskId: 'older', stage: 'contract', leadAgentId: 'lead', workerAgentId: 'worker' });
    store.recordCheckpoint({ taskId: 'newer', stage: 'dispatch', leadAgentId: 'lead', workerAgentId: 'worker' });
    const page = store.listRecoveries({}, { limit: 1 });
    const fromStore = await render({ ok: true, recoveries: projectManagedRecoveryList(page) });
    assert.match(fromStore, /1 SHOWN/);
    assert.match(fromStore, /Additional recovery records may be omitted/);
    const emptyBounded = await render(envelope([], true));
    assert.match(emptyBounded, /No recoveries are shown in this limited window/);
    assert.doesNotMatch(emptyBounded, /No managed tasks currently require recovery/);
    const emptyComplete = await render(envelope([]));
    assert.match(emptyComplete, /No managed tasks currently require recovery/);
    assert.match(emptyComplete, /OBSERVE ONLY/);
  });

  test(`${base}: missing or malformed evidence cannot claim an empty recovery queue`, async () => {
    const render = harness(base);
    const view = envelope([]).recoveries;
    for (const recoveries of [
      { ...view, rows: undefined }, { ...view, rows: {} }, { ...view, rows: [null] },
      { ...view, evidence: undefined }, { ...view, evidence: { ...view.evidence, bounded: undefined } },
      { ...view, evidence: { ...view.evidence, authoritative: false } },
      { ...view, evidence: { ...view.evidence, returnedRows: 9 } }
    ]) {
      const text = await render({ ok: true, recoveries });
      assert.match(text, /Recovery status unavailable/);
      assert.doesNotMatch(text, /RECOVERY QUEUE|No managed tasks currently require recovery/);
    }
    assert.match(await render(envelope([safe])), /1 SAFE TO RESTART/);
  });
}
