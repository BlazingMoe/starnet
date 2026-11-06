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
  let read = () => valid, ledger = { entries: [] }, drafts = { drafts: [] }, ledgerFail = false, draftsFail = false, observe;
  const requested = [];
  const context = vm.createContext({
    document: { createElement: () => new Element(), getElementById: id => id === 'control-mode-panel' ? panel : null },
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} },
    setInterval: () => 1, clearInterval() {},
    Harness: { api: { get: endpoint => {
      requested.push(endpoint);
      if (endpoint === '/api/nightshift/status') return read();
      if (endpoint === '/api/autonomy/ledger?source=nightshift&limit=500') return ledgerFail ? Promise.reject(new Error('private ledger path')) : ledger;
      if (endpoint.startsWith('/api/nightshift/drafts?since=') && endpoint.endsWith('&limit=20')) return draftsFail ? Promise.reject(new Error('private drafts path')) : drafts;
      throw new Error('unexpected endpoint ' + endpoint);
    } } }
  });
  vm.runInContext('window = globalThis', context);
  for (const file of ['nightreport.js', 'controlnightshift.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', base, file), 'utf8'), context);
  }
  panel.hidden = false;
  const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  return {
    hide(value) { panel.hidden = value; observe(); },
    records(l,d) { ledger=l; drafts=d; },
    failures(l,d) { ledgerFail=l; draftsFail=d; },
    requested,
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

  test(`${base}: Control Mode composes a bounded NightReport without exposing draft bodies`, async () => {
    const h = harness(base), now = Date.now();
    h.records({ entries: [
      { source: 'nightshift', kind: 'act', ts: now - 60000, runId: 'r1', detail: { title: 'Source-backed brief' } },
      { source: 'nightshift', kind: 'decline', ts: now - 30000, binding: 'leash' }
    ] }, { drafts: [{ title: 'Source-backed brief', body: 'PRIVATE BODY MUST STAY HIDDEN', at: now - 60000 }] });
    const text = await h.render(valid);
    assert.match(text, /RECENT OPERATOR DIGEST · LAST 24 HOURS/);
    assert.match(text, /1 beat fired, 1 draft on your desk/);
    assert.match(text, /Source-backed brief/);
    assert.match(text, /daily leash was already spent/);
    assert.match(text, /WINDOW ·/);
    assert.doesNotMatch(text, /PRIVATE BODY MUST STAY HIDDEN/);
    assert.ok(h.requested.some(x => x === '/api/autonomy/ledger?source=nightshift&limit=500'));
    assert.ok(h.requested.some(x => x.startsWith('/api/nightshift/drafts?since=') && x.endsWith('&limit=20')));
  });

  test(`${base}: unavailable records never become an empty-night claim`, async () => {
    const h = harness(base); h.failures(true,true);
    let text = await h.render(valid);
    assert.match(text, /Recent outcomes unavailable/);
    assert.doesNotMatch(text, /No Night Shift acts or declined beats/);
    h.failures(false,true); h.records({ entries: [{source:'nightshift',kind:'decline',binding:'leash',ts:Date.now()}] }, null);
    text = await h.render(valid);
    assert.match(text, /1 beat skipped — draft records unavailable/);
    assert.match(text, /Draft records unavailable/);
    assert.doesNotMatch(text, /nothing landed on your desk/);
  });

  test(`${base}: the recent digest excludes stale, future, and malformed timestamps`, async () => {
    const h=harness(base), now=Date.now();
    h.records({entries:[
      {source:'nightshift',kind:'act',ts:now-1000,runId:'current',detail:{title:'current act'}},
      {source:'nightshift',kind:'decline',binding:'leash',ts:now+3600000},
      {source:'nightshift',kind:'decline',binding:'posture',ts:now-25*3600000},
      {source:'nightshift',kind:'decline',binding:'budget',ts:'not-a-time'}
    ]},{drafts:[
      {title:'current draft',at:now-1000,body:'private'},
      {title:'future draft',at:now+3600000},
      {title:'stale draft',at:now-25*3600000},
      {title:'malformed draft',at:'not-a-time'}
    ]});
    const text=await h.render(valid);
    assert.match(text,/RECENT OUTCOMES · 1 beat fired, 1 draft on your desk/);
    assert.match(text,/current draft/);
    for(const excluded of ['future draft','stale draft','malformed draft','daily leash was already spent','emergency stop was engaged','spending budget is exhausted']) assert.doesNotMatch(text,new RegExp(excluded));
    assert.doesNotMatch(text,/WHILE YOU WERE AWAY/);
  });

  test(`${base}: fresh refresh replaces old outcomes and open/close ignores stale completions`, async () => {
    const h = harness(base), now=Date.now();
    h.records({ entries: [{ source:'nightshift',kind:'act',ts:now-1000,runId:'old',detail:{title:'Old outcome'} }] }, { drafts:[{title:'Old outcome',at:now-1000,body:'private'}] });
    await h.render(valid); assert.match(h.text(), /Old outcome/);
    h.records({ entries: [] }, { drafts:[] });
    const refreshing = h.render(valid);
    assert.match(h.text(), /Refreshing decision and draft evidence/);
    assert.doesNotMatch(h.text(), /Old outcome/);
    await refreshing;
    assert.match(h.text(), /No Night Shift acts or declined beats/);
  });

  test(`${base}: hitting either endpoint cap discloses possibly omitted older outcomes`, async () => {
    const h=harness(base), now=Date.now();
    h.records({entries:Array.from({length:500},(_,i)=>({source:'nightshift',kind:'decline',binding:'leash',ts:now-25*3600000-i}))},
      {drafts:Array.from({length:20},(_,i)=>({title:'draft-'+i,at:now-25*3600000-i}))});
    const text=await h.render(valid);
    assert.match(text,/500-row read cap/);
    assert.match(text,/20-item read cap/);
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
