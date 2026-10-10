'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const valid = { active: true, away: true, halted: false, inFlight: false,
  beatsUsedToday: 2, leashPerDay: 3, binding: 'cooldown', lastBeatAt: 0, nextEligibleAt: 0 };

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
  let read = () => valid, observe;
  const context = vm.createContext({
    document: { createElement: () => new Element(), getElementById: id => id === 'control-mode-panel' ? panel : null },
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} },
    setInterval: () => 1, clearInterval() {},
    Harness: { api: { get: endpoint => { assert.equal(endpoint, '/api/nightshift/status'); return read(); } } }
  });
  vm.runInContext('window = globalThis', context);
  for (const file of ['nightreport.js', 'controlnightshift.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', base, file), 'utf8'), context);
  }
  panel.hidden = false;
  const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  return {
    hide(value) { panel.hidden = value; observe(); },
    text: () => text(panel),
    async render(body) { read = () => body; await context.ControlModeNightshift.refresh(); return text(panel); },
    async fail() { read = () => Promise.reject(new Error('private diagnostic')); await context.ControlModeNightshift.refresh(); return text(panel); }
  };
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(`${base}: missing or malformed runtime state cannot fabricate safety`, async () => {
    const h = harness(base);
    for (const body of [null, [], {}, { ok: false }, ...['active', 'away', 'halted', 'inFlight', 'beatsUsedToday'].flatMap(key =>
      [undefined, null, 'false'].map(value => ({ ...valid, [key]: value })))]) {
      const text = await h.render(body);
      assert.match(text, /Night Shift status unavailable/);
      assert.doesNotMatch(text, /E-STOP CLEAR|OPERATOR PRESENT|STATE · OFF|TODAY 0/);
    }
    const text = await h.fail();
    assert.match(text, /Night Shift status unavailable/);
    assert.doesNotMatch(text, /private diagnostic/);
  });

  test(`${base}: optional limits and timestamps never become invented zeroes`, async () => {
    const h = harness(base);
    for (const leashPerDay of [null, undefined, '', false, '3', -1]) {
      assert.match(await h.render({ ...valid, leashPerDay }), /TODAY 2 \/ —/);
    }
    assert.match(await h.render({ ...valid, beatsUsedToday: 0, leashPerDay: 0 }), /TODAY 0 \/ 0/);
    const text = await h.render({ ...valid, binding: undefined, lastBeatAt: undefined, nextEligibleAt: undefined });
    assert.match(text, /CURRENT GATE unknown/);
    assert.match(text, /LAST BEAT · UNKNOWN · NEXT · UNKNOWN/);
    assert.doesNotMatch(text, /no beat yet|when the next window opens/);
  });

  test(`${base}: E-STOP wins over an in-flight beat while real execution remains visible`, async () => {
    const h = harness(base);
    const stopped = await h.render({ ...valid, halted: true, inFlight: true });
    assert.match(stopped, /STATE · ⛔ HALTED/);
    assert.match(stopped, /E-STOP ENGAGED/);
    assert.match(stopped, /BEAT IN FLIGHT YES/);
    assert.doesNotMatch(stopped, /STATE · RUNNING/);
    const running = await h.render({ ...valid, inFlight: true });
    assert.match(running, /STATE · RUNNING/);
    assert.match(running, /TODAY 2 \/ 3/);
    assert.match(running, /E-STOP CLEAR/);
    assert.match(running, /OBSERVE ONLY/);
    const off = await h.render({ ...valid, active: false, away: false });
    assert.match(off, /STATE · OFF/);
    assert.match(off, /OPERATOR PRESENT/);
  });
}

for (const base of ['frontend/app', 'website/app/app']) {
  test(base + ': reopening never presents old E-STOP evidence as current', async () => {
    const h = harness(base);
    await h.render(valid);
    let finishOld;
    const old = h.render(new Promise(resolve => { finishOld = resolve; }));
    h.hide(true); h.hide(false);
    assert.match(h.text(), /Loading current Night Shift evidence/);
    assert.doesNotMatch(h.text(), /E-STOP CLEAR|STATE ·|OPERATOR AWAY/);
    finishOld(valid); await old;
    assert.match(h.text(), /Loading current Night Shift evidence/);
    assert.doesNotMatch(h.text(), /E-STOP CLEAR/);
    const fresh = await h.render({ ...valid, halted: true });
    assert.match(fresh, /E-STOP ENGAGED/);
    assert.doesNotMatch(fresh, /Loading current Night Shift evidence/);
  });
}
