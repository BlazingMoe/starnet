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

  const recoveryBody = A.fnBody(chat, 'async function recoverSafeRun');
  const reconnectBody = A.fnBody(chat, 'async function probeReconnect');
  for (const scenario of ['prepare-fails', 'focus-changes', 'ready', 'forensic']) {
    const lines = [], sent = [], ws = { id: 'stream', agentId: 'agent' };
    let active = true;
    const row = { runId: scenario, streamId: ws.id, agentId: ws.agentId, canAutoContinue: scenario !== 'forensic', forensicOnly: scenario === 'forensic' };
    const harnessStub = {
      runRecoveries: async () => [row],
      prepareAutomaticRecovery: async () => {
        if (scenario === 'prepare-fails') throw new Error('unavailable');
        if (scenario === 'focus-changes') active = false;
        return { continuationToken: 'fixture' };
      }
    };
    const run = new Function('Harness', 'fetch', 'Channels', 'isActiveWs', 'toolLine', 'send',
      'const recoveryClaims = new Set(), recoveryNotices = new Set();' + recoveryBody + '\nreturn recoverSafeRun;')(
        harnessStub, async () => ({ ok: true, json: async () => ({ briefs: [] }) }), { isBusy: () => false },
        () => active, line => lines.push(line), async (...args) => sent.push(args));
    const outcome = await run(ws, true);
    A.eq(outcome, { 'prepare-fails': 'unavailable', 'focus-changes': 'deferred', ready: 'started', forensic: 'forensic' }[scenario], 'recovery outcome reflects preparation: ' + scenario);
    A.eq(sent.length, scenario === 'ready' ? 1 : 0, 'only prepared focused recovery dispatches: ' + scenario);
    A.eq(lines.some(line => line.includes('safely continuing')), scenario === 'ready', 'no premature continuation claim: ' + scenario);
    if (scenario === 'forensic') A.ok(lines.some(line => line.includes('blocked')), 'damaged evidence is visible');
  }
  for (const outcome of ['none', 'unavailable', 'forensic']) {
    const lines = [];
    const probe = new Function('fetch', 'recoverSafeRun', 'toolLine', 'isActiveWs',
      'const activeWs = { id: "s" }, interruptedStreams = new Set(["s"]); let reconnectTimer = 0;' + reconnectBody + '\nreturn probeReconnect;')(
        async () => ({ ok: true }), async () => outcome, line => lines.push(line), () => true);
    await probe();
    A.eq(lines.some(line => line.includes('use Try again')), outcome === 'none', 'retry advice requires a successful empty recovery check: ' + outcome);
    if (outcome === 'unavailable') A.ok(lines.some(line => line.includes('could not be checked or prepared')), 'failed check is reported as unknown');
  }

  for (const blocker of ['review', 'forensic', 'claimed', 'foreign']) {
    const ws = { id: 'stream', agentId: 'agent' }, prepared = [], sent = [];
    const safe = { runId: 'safe', streamId: ws.id, agentId: ws.agentId, startedAt: 1, canAutoContinue: true };
    const other = { runId: 'newer', streamId: blocker === 'foreign' ? 'other' : ws.id, agentId: ws.agentId, startedAt: 2,
      canAutoContinue: blocker === 'claimed', operationalState: ['review', 'foreign'].includes(blocker) ? 'needs_review' : '', forensicOnly: blocker === 'forensic' };
    const run = new Function('Harness', 'fetch', 'Channels', 'isActiveWs', 'toolLine', 'send', 'offerRecoveryReview', 'recoveryClaims',
      'const recoveryNotices = new Set();' + recoveryBody + '\nreturn recoverSafeRun;')(
      { runRecoveries: async () => [safe, other], prepareAutomaticRecovery: async row => { prepared.push(row.runId); return {}; } },
      async () => ({ ok: true, json: async () => ({ briefs: [] }) }), { isBusy: () => false }, () => true,
      () => {}, async () => sent.push(true), () => {}, new Set(blocker === 'claimed' ? ['newer'] : []));
    A.eq(await run(ws, true), { review: 'review', forensic: 'forensic', claimed: 'deferred', foreign: 'started' }[blocker], 'stream recovery prioritizes unresolved evidence: ' + blocker);
    A.eq(prepared, blocker === 'foreign' ? ['safe'] : [], 'blocked or claimed recovery never falls back to older work: ' + blocker);
    A.eq(sent.length, blocker === 'foreign' ? 1 : 0, 'dispatch respects stream recovery precedence: ' + blocker);
  }
  A.report('run-recovery-ui.test');
})().catch(e => { console.error(e); process.exitCode = 1; });
