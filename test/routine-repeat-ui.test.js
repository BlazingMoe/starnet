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
async function create(value, badInput) {
  const elements = {};
  const el = id => elements[id] || (elements[id] = { value: '', dataset: {}, checked: false });
  el('#rt-times').value = value;
  el('#rt-times').validity = { badInput: !!badInput };
  el('#rt-name').value = 'Bounded rehearsal';
  el('#rt-prompt').value = 'Summarize local notes';
  el('#rt-sched').value = 'every 30m';
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
(async () => {
  for (const invalid of ['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
    const r = await create(invalid);
    A.eq(r.payload, undefined, invalid + ' never posts a routine');
    A.ok(/positive whole number/.test(r.message), 'validation explains invalid limit');
  }
  A.eq((await create('')).payload.repeat.times, null, 'blank preserves unlimited cadence');
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
  A.ok(src === fs.readFileSync(path.join(__dirname, '../website/app/app/windows/routines.js'), 'utf8').replace(/\r\n/g, '\n'), 'website mirror matches');
  A.report('routine-repeat-ui.test');
})().catch(e => { console.error(e); process.exitCode = 1; });
