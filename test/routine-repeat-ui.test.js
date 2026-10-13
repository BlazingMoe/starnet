'use strict';
// Execute the production create handler and row renderer against a small DOM boundary,
// then pass its payload through the existing durable scheduler reducer.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const A = require('./_assert.js');
const store = require('../sidecar/cron-store.js');
const cron = require('../sidecar/cron.js');
const src = fs.readFileSync(path.join(__dirname, '../frontend/app/windows/routines.js'), 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf("body.querySelector('#rt-add').addEventListener('click', async () => {");
const handler = src.slice(start, src.indexOf('\n    refresh();\n    }', start));
const rowSrc = src.slice(src.indexOf('    function row(j) {'), src.indexOf('    async function refresh()'));
const T = Date.UTC(2026, 9, 6, 12);
async function create(value, badInput, misfire) {
  const elements = {};
  const el = id => elements[id] || (elements[id] = { value: '', dataset: {}, checked: false });
  el('#rt-times').value = value;
  el('#rt-times').validity = { badInput: !!badInput };
  el('#rt-name').value = 'Bounded rehearsal';
  el('#rt-prompt').value = 'Summarize local notes';
  el('#rt-sched').value = 'every 30m';
  el('#rt-misfire').value = misfire || '';
  let callback, payload;
  el('#rt-add').addEventListener = (_, fn) => { callback = fn; };
  const msgEl = {};
  vm.runInNewContext(handler, {
    body: { querySelector: el }, msgEl, sfx() {}, esc: String,
    post: async (_, p) => { payload = p; return { json: async () => ({ declined: true }) }; },
    refresh() {},
  });
  await callback();
  return { payload, message: msgEl.textContent };
}
function row(job) {
  return vm.runInNewContext(rowSrc + '\nrow(job)', {
    job, esc: String, fmtRel: String, human: String, schedulerArmed: true,
    runsLine: () => 'agent', lastResult: () => '', spendLine: () => '',
    failureStreakLine: () => '', deliveryLine: () => '',
  });
}
function makePolicyHarness(outcome) {
  class Element {
    constructor(tag) {
      this.tagName = tag; this.dataset = {}; this.listeners = {}; this.children = [];
      this.attrs = {}; this.classes = new Set(); this.classList = {
        add: x => this.classes.add(x), remove: x => this.classes.delete(x), contains: x => this.classes.has(x),
      };
      this.isConnected = true; this.disabled = false; this.textContent = '';
    }
    set innerHTML(v) { this.markup = v; this.children = []; }
    querySelector(selector) {
      if (selector === '[data-misfire]') return this.select || (this.select = new Element('select'));
      if (selector === '[data-misfire-save]') return this.save || (this.save = button('data-misfire-save'));
      if (selector === '[data-misfire-cancel]') return this.cancel || (this.cancel = button('data-misfire-cancel'));
      if (selector === 'button[data-act="misfire"]') return this.misfireButton || null;
      return null;
    }
    querySelectorAll(selector) {
      if (selector === '.rt-misfire-editor') return harness.list.editors.slice();
      if (selector === 'button[data-act="misfire"]') return harness.list.rows.map(r => r.misfireButton);
      if (selector === '.mc-row') return harness.list.rows.slice();
      return [];
    }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    async fire(name, target) {
      const event = { target, targetElement: target };
      for (const fn of this.listeners[name] || []) await fn(event);
    }
    insertAdjacentElement(_, el) { el.parent = this; harness.list.editors.push(el); }
    remove() { this.isConnected = false; harness.list.editors = harness.list.editors.filter(x => x !== this); }
    hasAttribute(name) { return !!this.attrs[name]; }
    closest(selector) { return selector === 'button' ? this : null; }
  }
  function button(attr) { const b = new Element('button'); b.attrs[attr] = true; return b; }
  const harness = { calls: [], notices: [], refreshes: 0, list: { rows: [], editors: [] } };
  harness.list.querySelectorAll = Element.prototype.querySelectorAll.bind(harness.list);
  harness.list.querySelectorAll = selector => selector === '.rt-misfire-editor' ? harness.list.editors.slice()
    : selector === 'button[data-act="misfire"]' ? harness.list.rows.map(r => r.misfireButton)
    : selector === '.mc-row' ? harness.list.rows.slice() : [];
  harness.list.replaceRows = () => {
    harness.list.editors.forEach(e => { e.isConnected = false; }); harness.list.editors = [];
    const row = new Element('div'); row.dataset.id = 'job-a'; row.dataset.misfire = 'fire_once';
    row.misfireButton = button('data-act'); row.misfireButton.dataset.act = 'misfire';
    row.querySelector = selector => selector === 'button[data-act="misfire"]' ? row.misfireButton : null;
    row.insertAdjacentElement = Element.prototype.insertAdjacentElement;
    harness.list.rows = [row]; return row;
  };
  const helperStart = src.indexOf('    function mountMisfireEditor(');
  const helperEnd = src.indexOf('\n    outEl.addEventListener', helperStart);
  const branchStart = src.indexOf('      if (act === \'misfire\') {');
  const branchEnd = src.indexOf('      if (act === \'remove\')', branchStart);
  const ctx = {
    listEl: harness.list, document: { createElement: tag => new Element(tag) }, misfireEditor: null,
    post: async (_, payload) => {
      harness.calls.push(payload);
      if (outcome === 'network') throw new Error('offline');
      if (outcome === 'http') return { ok: false, json: async () => ({ error: 'rejected' }) };
      if (outcome === 'api') return { ok: true, json: async () => ({ ok: false, error: 'not saved' }) };
      if (outcome === 'deferred') return new Promise(resolve => { harness.resolvePost = resolve; });
      return { ok: true, json: async () => ({ ok: true }) };
    },
    notify: (message, level) => harness.notices.push({ message, level }), sfx() {},
    refresh: () => {
      harness.refreshes++; harness.list.replaceRows();
      vm.runInNewContext('restoreMisfireEditor()', ctx);
    },
  };
  vm.runInNewContext(src.slice(helperStart, helperEnd), ctx);
  const branch = vm.runInNewContext('(async function(){\n' + src.slice(branchStart, branchEnd) + '\n})', ctx);
  function open() {
    const currentRow = harness.list.rows[0];
    ctx.btn = currentRow.misfireButton; ctx.id = 'job-a'; ctx.rowEl = currentRow; ctx.act = 'misfire';
    return branch();
  }
  harness.open = open;
  harness.button = button;
  harness.ctx = ctx;
  return harness;
}
async function previewRace() {
  const start = src.indexOf('    function wirePreview(inp, pvEl) {');
  const end = src.indexOf('    const schedInp = body.querySelector', start);
  const pending = [], timers = [];
  const policy = { disabled: false }, help = { textContent: '' }, preview = { innerHTML: '', textContent: '' };
  const input = {
    id: 'rt-sched', value: '', _previewRevision: 0,
    addEventListener(_, fn) { this.onInput = fn; },
  };
  const ctx = {
    body: { querySelector: selector => selector === '#rt-misfire' ? policy : help },
    clearTimeout() {}, setTimeout(fn) { timers.push(fn); return timers.length; },
    post: (_, payload) => new Promise(resolve => pending.push({ schedule: payload.schedule, resolve })),
    deviceTz: () => undefined, esc: String, human: String, fmtRel: String, wallClock: () => '',
  };
  vm.runInNewContext(src.slice(start, end), ctx);
  vm.runInNewContext('wirePreview(input, preview)', Object.assign(ctx, { input, preview }));
  input.value = 'in 2h'; input.onInput(); const oldRequest = timers[0]();
  input.value = 'every 30m'; input.onInput(); const currentRequest = timers[1]();
  pending[1].resolve({ json: async () => ({ ok: true, kind: 'interval', display: 'every 30m', next: ['2026-10-14T10:00:00.000Z'] }) });
  await currentRequest;
  pending[0].resolve({ json: async () => ({ ok: true, kind: 'once', display: 'in 2h', next: ['2026-10-14T12:00:00.000Z'] }) });
  await oldRequest;
  return { policy, help, preview };
}
(async () => {
  for (const invalid of ['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
    const r = await create(invalid);
    A.eq(r.payload, undefined, invalid + ' never posts a routine');
    A.ok(/positive whole number/.test(r.message), 'validation explains invalid limit');
  }
  A.eq((await create('')).payload.repeat.times, null, 'blank preserves unlimited cadence');
  A.eq((await create('')).payload.misfire, undefined, 'untouched missed-run policy keeps the schedule-derived default');
  A.eq((await create('', false, 'fire_once')).payload.misfire, 'fire_once', 'create posts explicit one-catch-up policy');
  A.eq((await create('', false, 'skip')).payload.misfire, 'skip', 'create posts explicit skip-stale policy');
  A.eq((await create('', true)).payload, undefined, 'browser invalid numeric input cannot become unlimited');
  const p = (await create('2')).payload;
  A.eq(p.repeat.times, 2, 'create posts chosen finite limit');
  A.eq(p.unattendedGrants, undefined, 'limit grants no extra authority');
  const once = store.makeJob({ prompt: p.prompt, repeat: p.repeat, schedule: cron.parseSchedule('in 2h', T) }, { id: 'once', now: T });
  A.eq(once.repeat.times, 1, 'one-time schedule keeps its single settlement');
  let jobs = store.createJob([], Object.assign({}, p, {
    schedule: cron.parseSchedule(p.schedule, T),
  }), { id: 'bounded', now: T });
  A.ok(row(jobs[0]).includes('settled runs 0/2'), 'new routine displays server counter');
  jobs = store.markRun(jobs, 'bounded', { status: 'error', transient: true, error: 'network' }, { now: T + 1 });
  A.eq(jobs[0].repeat.completed, 0, 'transient retry does not consume settled allowance');
  jobs = store.markRun(jobs, 'bounded', { status: 'ok', reason: 'done' }, { now: T + 2 });
  A.eq(jobs[0].enabled, true, 'one settlement leaves routine armed');
  jobs = store.loadEnvelope(store.toEnvelope(jobs)).jobs;
  jobs = store.markRun(jobs, 'bounded', { status: 'error', error: 'terminal', transient: false }, { now: T + 3 });
  A.eq(jobs[0].enabled, false, 'persisted allowance stops after terminal second settlement');
  const html = row(jobs[0]);
  A.ok(html.includes('settled runs 2/2'), 'row renders durable exhausted count');
  A.ok(html.includes('limit reached') && html.includes('last run failed'), 'limit completion does not claim success');
  A.ok(!html.includes('data-act="toggle"'), 'exhausted routine offers no accidental enable');
  A.ok(html.includes('data-act="run"'), 'explicit manual execution stays available');
  A.ok(!row({ enabled: false, state: 'paused' }).includes('settled runs'), 'legacy record without repeat still renders');
  A.ok(row({ id: 'daily', enabled: true, schedule: { kind: 'cron' }, scheduleDisplay: 'cron 0 9 * * *', misfire: 'fire_once' }).includes('missed run: run one stale occurrence'), 'row explains explicit catch-up policy');
  A.ok(row({ id: 'fast', enabled: true, schedule: { kind: 'interval' }, scheduleDisplay: 'every 30m', misfire: 'skip' }).includes('data-misfire="skip"'), 'row carries explicit skip policy into its editor');
  A.ok(row({ id: 'auto-daily', enabled: true, schedule: { kind: 'cron' }, scheduleDisplay: 'cron 0 9 * * *' }).includes('missed run: automatic: catch up once'), 'automatic cron policy shows its effective behavior');
  A.ok(row({ id: 'auto-fast', enabled: true, schedule: { kind: 'interval', minutes: 30 }, scheduleDisplay: 'every 30m' }).includes('missed run: automatic: skip stale runs'), 'automatic faster-interval policy shows its effective behavior');
  A.ok(row({ id: 'auto-hour', enabled: true, schedule: { kind: 'interval', minutes: 60 }, scheduleDisplay: 'every 1h' }).includes('missed run: automatic: catch up once'), 'automatic hourly policy catches up once at the boundary');
  A.ok(!row({ id: 'once', enabled: true, schedule: { kind: 'once' }, scheduleDisplay: 'in 2h' }).includes('MISSED-RUN POLICY'), 'one-time routines do not offer an unused missed-run control');
  A.ok(src.includes('Automatic: cron and intervals of 1 hour or longer catch up once; faster intervals skip stale runs.'), 'create form explains how Automatic resolves');
  const success = makePolicyHarness('success'); success.list.replaceRows(); await success.open();
  let editor = success.list.editors[0];
  A.ok(editor.markup.includes('for="rt-misfire-editor-select"') && editor.markup.includes('id="rt-misfire-editor-select"'), 'editor label is associated with its selection control');
  editor.select.value = 'skip'; await editor.select.fire('change', editor.select);
  await editor.fire('click', editor.save);
  A.eq(success.calls[0].patch.misfire, 'skip', 'editor saves selected skip value through the routine API');
  A.eq(success.refreshes, 1, 'successful policy save refreshes the authoritative row');
  const unsaved = makePolicyHarness('success'); unsaved.list.replaceRows(); await unsaved.open();
  editor = unsaved.list.editors[0]; editor.select.value = 'skip'; await editor.select.fire('change', editor.select);
  unsaved.list.replaceRows(); vm.runInNewContext('restoreMisfireEditor()', unsaved.ctx);
  A.eq(unsaved.list.editors[0].select.value, 'skip', 'ordinary list refresh preserves an unsaved policy selection');
  A.eq(unsaved.calls.length, 0, 'list refresh never submits an unconfirmed policy');
  const cancel = unsaved.list.editors[0]; await cancel.fire('click', cancel.cancel);
  A.eq(unsaved.list.editors.length, 0, 'cancel closes the editor without a request');
  await unsaved.open();
  A.eq(unsaved.list.editors[0].select.value, 'fire_once', 'reopening after cancel reloads the saved policy');
  await unsaved.list.editors[0].fire('click', unsaved.list.editors[0].cancel);
  const automatic = makePolicyHarness('success'); automatic.list.replaceRows(); await automatic.open();
  editor = automatic.list.editors[0]; editor.select.value = ''; await editor.select.fire('change', editor.select); await editor.fire('click', editor.save);
  A.eq(automatic.calls[0].patch.misfire, null, 'editor saves automatic/default as null');
  for (const failure of ['http', 'api', 'network']) {
    const h = makePolicyHarness(failure); h.list.replaceRows(); await h.open();
    const initialEditor = h.list.editors[0]; initialEditor.select.value = 'skip'; await initialEditor.select.fire('change', initialEditor.select);
    await initialEditor.fire('click', initialEditor.save);
    const retained = h.list.editors[0];
    A.eq(retained.select.value, 'skip', failure + ' failure retains the selected value');
    A.eq(retained.save.disabled, false, failure + ' failure re-enables save');
    A.eq(h.refreshes, 0, failure + ' failure does not claim success or refresh away the selection');
    A.ok(h.notices.some(n => n.level === 'warn'), failure + ' failure is surfaced');
  }
  const pending = makePolicyHarness('deferred'); pending.list.replaceRows(); await pending.open();
  editor = pending.list.editors[0]; editor.select.value = 'skip'; await editor.select.fire('change', editor.select);
  const request = editor.fire('click', editor.save);
  await editor.fire('click', editor.save);
  A.eq(pending.calls.length, 1, 'save pending prevents duplicate update requests');
  A.eq(editor.save.disabled, true, 'pending save disables the control');
  pending.list.replaceRows(); vm.runInNewContext('restoreMisfireEditor()', pending.ctx);
  editor = pending.list.editors[0];
  A.eq(editor.select.value, 'skip', 'list refresh preserves pending selection');
  A.eq(editor.save.disabled, true, 'list refresh preserves pending lock');
  pending.resolvePost({ ok: true, json: async () => ({ ok: true }) }); await request;
  A.eq(pending.refreshes, 1, 'pending success refreshes after settlement');
  A.eq(pending.list.editors.length, 0, 'successful refresh closes the editor');
  const reopen = makePolicyHarness('deferred'); reopen.list.replaceRows(); await reopen.open();
  const pendingEditor = reopen.list.editors[0]; pendingEditor.select.value = 'skip'; await pendingEditor.select.fire('change', pendingEditor.select);
  const pendingRequest = pendingEditor.fire('click', pendingEditor.save);
  await reopen.open();
  A.eq(reopen.calls.length, 1, 'pending editor cannot be closed/reopened into a duplicate request');
  reopen.resolvePost({ ok: true, json: async () => ({ ok: true }) }); await pendingRequest;
  const race = await previewRace();
  A.eq(race.policy.disabled, false, 'a stale one-shot preview cannot disable the current recurring policy choice');
  A.ok(/cron and intervals of 1 hour or longer/.test(race.help.textContent), 'stale preview cannot replace the current automatic-policy explanation');
  A.ok(src === fs.readFileSync(path.join(__dirname, '../website/app/app/windows/routines.js'), 'utf8').replace(/\r\n/g, '\n'), 'website mirror matches');
  A.report('routine-repeat-ui.test');
})().catch(e => { console.error(e); process.exitCode = 1; });
