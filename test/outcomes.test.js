/* node test/outcomes.test.js — THE TRACK RECORD (sidecar/outcomes.js): run outcomes finally teach the user model.

   Locks the honesty laws:
     - every number in a line is a LITERAL count of runs inside the 30-day window (never a decayed weight)
     - support before speech: under MIN_SUPPORT a key produces no line and no prior (null, never 0.5)
     - only DECIDED runs classify: done=success, error/max_iters/budget/refusal/empty=failure; cancelled and
       clarifying classify nothing; internal rows are excluded wholesale
     - lane derivation follows the workstream-prefix vocabulary; lane:interactive never rates FAILING
     - successPrior is Laplace-smoothed and absent under support (a caller's default must stay untouched) */
'use strict';
const A = require('./_assert.js');
const O = require('../sidecar/outcomes.js');

const T = 1780000000000;
const run = (over) => Object.assign({ runId: 'r', agentId: 'agent', reason: 'done', streamId: 'sess-1', recipeId: '', model: 'm/x', title: '', ts: T - 1000, internal: false }, over);

/* ── 1. classification + exclusions ── */
{
  const rows = [
    run({ reason: 'done' }), run({ reason: 'error' }), run({ reason: 'max_iters' }),
    run({ reason: 'cancelled' }),        // the Commander's own hand — classifies nothing
    run({ reason: 'clarifying' }),       // a question, not an attempt
    run({ reason: 'done', internal: true }),   // harness self-talk — excluded wholesale
    run({ reason: 'done', ts: T - O.WINDOW_MS - 1 })   // outside the window
  ];
  const rec = O.fold(rows, { now: T });
  A.eq(rec.decided, 3, 'exactly the decided in-window non-internal rows count (3 of 7)');
  const lane = rec.keys['lane:interactive'];
  A.eq(lane.n + '/' + lane.ok + '/' + lane.fail, '3/1/2', 'lane tallies are literal counts');
  A.eq(lane.failReasons.error + lane.failReasons.max_iters, 2, 'failure reasons are tallied by name');
}

/* ── 2. lanes from the stream-prefix vocabulary ── */
A.eq(O.laneOf('nightshift-act-3'), 'night shift', 'nightshift streams');
A.eq(O.laneOf('cron-job-1'), 'scheduled', 'cron streams');
A.eq(O.laneOf('workshop-9'), 'workshop', 'workshop streams');
A.eq(O.laneOf('loop-2'), 'loop', 'loop streams');
A.eq(O.laneOf('sess-abc'), 'interactive', 'everything else is the Commander at the console');

/* ── 3. support before speech ── */
{
  const two = O.fold([run({ reason: 'error', streamId: 'cron-1' }), run({ reason: 'error', streamId: 'cron-1' })], { now: T });
  A.eq(O.summary(two).length, 0, 'two data points are an anecdote — no pattern speaks');
  A.eq(O.lines(two).length, 0, '…and no line renders');
  A.eq(O.successPrior(two, 'lane:scheduled'), null, '…and the prior is NULL, never a fabricated number');
}

/* ── 4. proven + failing lines carry literal counts and the top failure ── */
{
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(run({ reason: 'done', recipeId: 'radar', title: 'Stock Radar', ts: T - i * 1000 }));
  rows.push(run({ reason: 'error', recipeId: 'radar', title: 'Stock Radar' }));
  for (let i = 0; i < 4; i++) rows.push(run({ reason: 'error', streamId: 'cron-x', ts: T - i * 500 }));
  rows.push(run({ reason: 'done', streamId: 'cron-x' }));
  const rec = O.fold(rows, { now: T });
  const ls = O.lines(rec);
  const proven = ls.find(l => l.indexOf('Stock Radar') >= 0);
  A.ok(!!proven, 'a supported high-rate recipe earns a line');
  A.ok(proven.indexOf('6 of 7') >= 0, '…whose numbers are the literal window counts (' + proven + ')');
  const failing = ls.find(l => l.indexOf('scheduled runs') >= 0);
  A.ok(!!failing, 'a supported failing lane earns a line');
  A.ok(failing.indexOf('1 of 5') >= 0 && failing.indexOf('error ×4') >= 0,
    '…citing the count AND the named top failure (' + failing + ')');
  A.ok(ls.length <= O.LINE_CAP, 'the lines are capped for prompt real estate');

  // the ranker's read
  A.eq(O.successPrior(rec, 'recipe:radar'), Math.round(((6 + 1) / (7 + 2)) * 1000) / 1000, 'the prior is Laplace-smoothed ok+1/n+2');
  A.ok(O.successPrior(rec, 'lane:scheduled') < 0.4, 'a failing lane reads a low prior');
  A.eq(O.successPrior(rec, 'recipe:nosuch'), null, 'an unknown key is null');
}

/* ── 5. lane:interactive never rates FAILING (a chat failure is usually a conversation, not a work shape) ── */
{
  const rows = [run({ reason: 'error' }), run({ reason: 'error' }), run({ reason: 'error' }), run({ reason: 'error' })];
  const rec = O.fold(rows, { now: T });
  A.eq(O.summary(rec).some(p => p.key === 'lane:interactive'), false, 'four interactive errors produce no failing pattern');
  const done = [run({}), run({}), run({}), run({})].map((r, i) => Object.assign(r, { ts: T - i }));
  A.eq(O.summary(O.fold(done, { now: T })).some(p => p.key === 'lane:interactive' && p.verdict === 'proven'), true,
    '…but a proven interactive record may still speak');
}

/* ── 6. middling rates stay silent — the record only speaks where the signal is strong ── */
{
  const rows = [run({}), run({ reason: 'error' }), run({}), run({ reason: 'error' }), run({})].map((r, i) => Object.assign(r, { streamId: 'cron-m', ts: T - i }));
  A.eq(O.summary(O.fold(rows, { now: T })).length, 0, 'a 60% lane is neither proven nor failing — silence');
}

/* ── 7. hardening ── */
A.eq(O.fold(null, { now: T }).decided, 0, 'null rows fold to an empty record');
A.eq(O.lines(null).length, 0, 'a null record renders nothing');
A.eq(O.successPrior(null, 'x'), null, '…and leans nothing');
{
  const rec = O.fold([run({ model: '(unknown)' })], { now: T });
  A.eq(Object.keys(rec.keys).some(k => k.indexOf('model:') === 0), false, 'an (unknown) model earns no model key');
}

A.report('outcomes track record');
