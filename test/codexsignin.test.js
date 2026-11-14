/* test/codexsignin.test.js — the shared ChatGPT device-code sign-in engine (frontend/app/codexsignin.js),
   extracted from app.js so Settings→PROVIDERS RE-SIGN-IN drives the SAME flow instead of duplicating it.
   Stubbed global fetch; proves:
     · start → onRequesting → onCode with the sidecar's user_code + verification_uri
     · a pending poll keeps polling; a 'connected' poll fires onConnected (the marker-clearing moment)
     · an 'error' poll fires onError with the sidecar's message
     · a failed /start fires onError and never polls
     · cancel() silences an in-flight flow (no late callbacks after screen change / disconnect)
     · logout() posts to /api/auth/codex/logout and cancels first
   Poll timers have a 2s floor, so this file spends a few real seconds — still fast-gate material. */
'use strict';
const A = require('./_assert.js');
global.Friendly = require('../frontend/app/friendlyerror.js');
const CodexSignIn = require('../frontend/app/codexsignin.js');

const calls = [];
let pollScript = [];   // queued poll responses, shifted per /poll call
let startResponseOverride = null;
global.fetch = async (url, opts) => {
  calls.push({ url, method: (opts && opts.method) || 'GET', body: opts && opts.body });
  if (url === '/api/auth/codex/start') {
    if (startResponseOverride) return startResponseOverride;
    if (pollScript._startFail) return { ok: false, status: 502, json: async () => ({ error: 'device endpoint unreachable' }) };
    return { ok: true, json: async () => ({ user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/codex/device', device_auth_id: 'dev-1', interval: 0.001, expires_in: 900 }) };
  }
  if (url === '/api/auth/codex/poll') {
    const next = pollScript.length ? pollScript.shift() : { status: 'pending' };
    return { ok: true, json: async () => next };
  }
  if (url === '/api/auth/codex/logout') return { ok: true, json: async () => ({ connected: false }) };
  throw new Error('unexpected fetch ' + url);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- happy path: start → code → pending → connected ----
  pollScript = [{ status: 'pending' }, { status: 'connected' }];
  const seen = [];
  CodexSignIn.start({
    onRequesting: () => seen.push('requesting'),
    onCode: c => seen.push('code:' + c.user_code + ':' + c.verification_uri),
    onConnected: () => seen.push('connected'),
    onError: m => seen.push('error:' + m),
    onTimeout: () => seen.push('timeout')
  });
  await sleep(80);
  A.eq(seen[0], 'requesting', 'onRequesting fires while /start is in flight');
  A.eq(seen[1], 'code:ABCD-1234:https://auth.openai.com/codex/device', 'onCode delivers the sidecar user_code + verification URL');
  A.ok(CodexSignIn.active(), 'the flow is active while polling');
  await sleep(4600);   // two poll ticks at the 2s floor
  A.eq(seen[2], 'connected', 'a connected poll fires onConnected (and nothing else)');
  A.eq(seen.length, 3, 'no stray callbacks after the terminal state');
  A.ok(!CodexSignIn.active(), 'the flow is idle after connecting');
  const polls = calls.filter(c => c.url === '/api/auth/codex/poll');
  A.eq(polls.length, 2, 'exactly two poll ticks were sent');
  A.ok(/dev-1/.test(polls[0].body) && /ABCD-1234/.test(polls[0].body), 'the poll carries device_auth_id + user_code');

  // ---- error poll ----
  pollScript = [{ status: 'error', error: 'access was denied' }];
  const seen2 = [];
  CodexSignIn.start({ onError: m => seen2.push(m), onConnected: () => seen2.push('connected') });
  await sleep(2300);
  A.eq(seen2, ['sign-in failed: access was denied'], "an 'error' poll surfaces the sidecar's message via onError");
  A.ok(!CodexSignIn.active(), 'the flow is idle after a hard error');

  // ---- failed /start ----
  pollScript = []; pollScript._startFail = true;
  const seen3 = [];
  const pollsBefore = calls.filter(c => c.url === '/api/auth/codex/poll').length;
  await CodexSignIn.start({ onError: m => seen3.push(m), onCode: () => seen3.push('code') });
  A.eq(seen3, ['could not start sign-in: device endpoint unreachable'], 'a failed /start reports onError');
  await sleep(2300);
  A.eq(calls.filter(c => c.url === '/api/auth/codex/poll').length, pollsBefore, 'a failed /start never polls');
  delete pollScript._startFail;

  // ---- stale local sidecar auth is actionable, while malformed bodies stay safe ----
  {
    startResponseOverride = { ok: false, status: 403, text: async () => 'forbidden token' };
    const stale = [];
    const pollCount = calls.filter(c => c.url === '/api/auth/codex/poll').length;
    await CodexSignIn.start({ onError: m => stale.push(m), onCode: () => stale.push('code') });
    A.eq(stale, ['The station restarted — reload this page to reconnect.'], 'a local 403 token denial tells the user to reload');
    A.eq(calls.filter(c => c.url === '/api/auth/codex/poll').length, pollCount, 'a stale start never begins polling');

    const secret = 'raw backend diagnostic: secret=do-not-show';
    startResponseOverride = { ok: false, status: 502, text: async () => secret };
    const malformed = [];
    await CodexSignIn.start({ onError: m => malformed.push(m) });
    A.ok(!malformed[0].includes(secret), 'a malformed start body is never exposed in the user error');
    startResponseOverride = null;
  }

  // ---- poll stops on confirmed local auth loss but preserves provider errors and transient retries ----
  {
    const originalFetch = global.fetch;
    let nextPoll = null;
    global.fetch = async (url, opts) => {
      if (url === '/api/auth/codex/poll' && nextPoll) { const r = nextPoll; nextPoll = null; return r; }
      return originalFetch(url, opts);
    };
    nextPoll = { ok: false, status: 403, text: async () => 'forbidden origin' };
    const stale = [];
    CodexSignIn.start({ onError: m => stale.push(m) });
    await sleep(2300);
    A.eq(stale, ['The station restarted — reload this page to reconnect.'], 'a confirmed local poll 403 stops with reload guidance');
    A.ok(!CodexSignIn.active(), 'a stale poll clears the active flow');

    nextPoll = { ok: false, status: 403, json: async () => ({ status: 'error', error: 'provider access forbidden' }) };
    const provider = [];
    CodexSignIn.start({ onError: m => provider.push(m) });
    await sleep(2300);
    A.eq(provider, ['sign-in failed: provider access forbidden'], 'a provider JSON 403 stays on the normal provider-error path');
    A.ok(!CodexSignIn.active(), 'a provider error status terminates normally');

    nextPoll = { ok: false, status: 403, text: async () => JSON.stringify({ status: 'error', error: 'forbidden token from provider' }) };
    const jsonProvider = [];
    CodexSignIn.start({ onError: m => jsonProvider.push(m) });
    await sleep(2300);
    A.eq(jsonProvider, ['sign-in failed: forbidden token from provider'], 'JSON text containing forbidden token remains a provider error');

    let resolveDelayed;
    global.fetch = async (url, opts) => {
      if (url === '/api/auth/codex/poll') return new Promise(resolve => { resolveDelayed = resolve; });
      return originalFetch(url, opts);
    };
    const cancelled = [];
    CodexSignIn.start({ onError: m => cancelled.push(m) });
    await sleep(2100);
    A.ok(typeof resolveDelayed === 'function', 'the delayed poll is in flight');
    CodexSignIn.cancel();
    const replacement = [];
    await CodexSignIn.start({ onError: m => replacement.push(m) });
    resolveDelayed({ ok: false, status: 403, text: async () => 'forbidden token' });
    await sleep(30);
    A.ok(CodexSignIn.active(), 'a stale response from a cancelled flow cannot clear its replacement');
    A.eq(cancelled, [], 'a cancelled flow cannot report a late stale-session error');
    A.eq(replacement, [], 'the replacement flow receives no error from the previous request');
    CodexSignIn.cancel();
    global.fetch = originalFetch;
  }

  // ---- cancel() silences an in-flight flow ----
  pollScript = [{ status: 'connected' }];
  const seen4 = [];
  CodexSignIn.start({ onCode: () => seen4.push('code'), onConnected: () => seen4.push('connected') });
  await sleep(80);
  A.eq(seen4, ['code'], 'the flow reached the code stage');
  CodexSignIn.cancel();
  A.ok(!CodexSignIn.active(), 'cancel() drops the flow');
  await sleep(2300);
  A.eq(seen4, ['code'], 'no callbacks land after cancel() (screen change / disconnect)');

  // ---- logout ----
  await CodexSignIn.logout();
  const lo = calls.filter(c => c.url === '/api/auth/codex/logout');
  A.eq(lo.length, 1, 'logout posts to /api/auth/codex/logout');
  A.eq(lo[0].method, 'POST', 'logout is a POST');

  A.report('codexsignin.test');
})().catch(e => { console.error(e); process.exit(1); });
