'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const harness = fs.readFileSync(path.join(root, 'frontend', 'app', 'harness.js'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'frontend', 'app', 'chat.js'), 'utf8');
const mirrorHarness = fs.readFileSync(path.join(root, 'website', 'app', 'app', 'harness.js'), 'utf8');
const mirrorChat = fs.readFileSync(path.join(root, 'website', 'app', 'app', 'chat.js'), 'utf8');

A.eq(harness, mirrorHarness, 'website harness mirror carries the same recovery client');
A.eq(chat, mirrorChat, 'website chat mirror carries the same recovery behavior');
A.ok(/mode: 'automatic'/.test(harness) && /continuationToken/.test(harness), 'browser prepares the typed one-shot automatic continuation');
A.ok(/r\.canAutoContinue/.test(chat), 'chat only auto-starts a server-proven safe recovery');
A.ok(/operationalState === 'needs_review'/.test(chat), 'review-required recovery has a distinct UI path');
A.ok(/StarNet will not repeat it/.test(chat), 'uncertain mutation copy states the no-duplicate guarantee');
A.ok(/It happened/.test(chat) && /It did not happen/.test(chat) && /I am not sure/.test(chat), 'uncertain mutation presents explicit outcome choices');
A.ok(/resolveRunRecovery/.test(harness) && /prepareReviewedRecovery/.test(harness), 'review decisions persist before reviewed continuation starts');
A.ok(/recovery: recoveryResume \? opts\.recovery : undefined/.test(chat), 'recovery re-enters the ordinary Harness.chat execution path');
A.ok(!/last run was interrupted and can\\'t resume/.test(chat), 'obsolete unconditional cannot-resume claim is gone');


(async () => {
  const body = A.fnBody(harness, 'async function runRecoveries');
  const lift = fetch => new Function('fetch', body + '\nreturn runRecoveries;')(fetch);
  const calls = [];
  const first = Array.from({ length: 100 }, (_, i) => ({ runId: 'r' + i }));
  const pages = [
    { recoveries: [], nextOffset: 0 },
    { recoveries: first, nextOffset: 100 },
    { recoveries: [{ runId: 'r99', status: 'updated' }, { runId: 'later-stream', canAutoContinue: true }], nextOffset: null }
  ];
  const rows = await lift(async url => { calls.push(url); return { ok: true, json: async () => pages.shift() }; })();
  A.eq(rows.length, 101, 'client reaches later-page recovery and deduplicates overlaps');
  A.eq(rows[99].status, 'updated', 'overlapping page uses the latest evidence');
  A.ok(rows.some(r => r.runId === 'later-stream'), 'recovery beyond the first 100 entries is available');
  A.eq(calls.map(url => new URL(url, 'http://fixture').searchParams.get('offset')), ['0', '0', '100'], 'zero nextOffset after retirement is followed');
  for (const payload of [{}, { recoveries: [] }, { recoveries: [], nextOffset: -1 }, { recoveries: [], nextOffset: '100' }, { recoveries: [null], nextOffset: null }]) {
    let rejected = false;
    try { await lift(async () => ({ ok: true, json: async () => payload }))(); } catch (_) { rejected = true; }
    A.ok(rejected, 'malformed evidence is not returned as an empty or complete list');
  }
  let count = 0, failed = false;
  try { await lift(async () => (++count === 1 ? { ok: true, json: async () => ({ recoveries: first, nextOffset: 100 }) } : { ok: false }))(); } catch (_) { failed = true; }
  A.ok(failed, 'later-page failure does not return partial recovery evidence');
  count = 0; failed = false;
  try { await lift(async () => { count++; return { ok: true, json: async () => ({ recoveries: [], nextOffset: 0 }) }; })(); } catch (_) { failed = true; }
  A.ok(failed && count === 100, 'nonterminating pagination is bounded and disclosed as a failure');
  A.report('run-recovery-ui.test');
})().catch(e => { console.error(e); process.exitCode = 1; });
