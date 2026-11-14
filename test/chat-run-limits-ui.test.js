/* node test/chat-run-limits-ui.test.js — exercise the real manual-send composer guards and forwarding. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const chat = fs.readFileSync(path.join(__dirname, '../frontend/app/chat.js'), 'utf8');
const harness = fs.readFileSync(path.join(__dirname, '../frontend/app/harness.js'), 'utf8');
const start = chat.indexOf('  function composerRunLimits() {');
const end = chat.indexOf('\n  /* ── ATTACHMENTS', start);
A.ok(start >= 0 && end > start, 'chat.js still owns the composer limit validation and submit path');
const composer = chat.slice(start, end);
const make = new Function('env', `
  const { input, pendingAtts, activeWs, el, recordSent, commandFromLine, closeSlash, runSlash,
    autoGrowInput, GroupChat, composerContextIssue, Harness, U, localLine, StationUI, isBusy,
    settleAttachments, takeAttachments, send, enqueue } = env;
  ${composer}
  return submitComposer;
`);

function fixture({ iters = '', usd = '', busy = false, mode = 'single' } = {}) {
  const sent = [], sends = [], lines = [], queue = [], fields = {
    'chat-limit-iters': { value: iters, validity: { badInput: false, rangeUnderflow: false } },
    'chat-limit-usd': { value: usd, validity: { badInput: false, rangeUnderflow: false } }
  };
  const env = {
    input: { value: 'keep this request' }, pendingAtts: [], activeWs: { id: 'ws1', conversationMode: mode },
    el: id => fields[id], recordSent: text => sent.push(text), commandFromLine: () => null, closeSlash() {}, runSlash() {}, autoGrowInput() {},
    GroupChat: { isBusy: () => busy, sendText: (...args) => { sends.push(args); return Promise.resolve(true); } },
    composerContextIssue: () => null, Harness: {}, U: {}, localLine: text => lines.push(text), StationUI: {}, isBusy: () => busy,
    settleAttachments: async () => {}, takeAttachments: () => [], send: (...args) => sends.push(args), enqueue: text => queue.push(text)
  };
  return { submit: make(env), env, fields, sent, sends, lines, queue };
}

function makeHarness() {
  const storage = new Map([
    ['starnet.byok.model', 'fixture/model'],
    ['starnet.byok.prov', 'openrouter'],
    ['starnet.byok.key', 'fixture-key']
  ]);
  let requestBody = null, delivered = false;
  const events = [
    { name: 'agent.run.start', payload: { runId: 'limits-run', agentId: 'agent', model: 'fixture/model' } },
    { name: 'agent.run.end', payload: { runId: 'limits-run', agentId: 'agent', reason: 'done', turns: 1, usd: 0 } }
  ].map(row => JSON.stringify(row)).join('\n') + '\n';
  const sandbox = {
    console, TextDecoder, TextEncoder, AbortController, URL, Headers, setTimeout, clearTimeout,
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    location: { href: 'http://127.0.0.1:19192/', origin: 'http://127.0.0.1:19192' },
    U: { bus: A.makeBus() },
    fetch: async (url, init) => {
      A.eq(String(url), '/api/run', 'Harness.chat posts to the sidecar run route');
      requestBody = JSON.parse(init.body);
      const bytes = new TextEncoder().encode(events);
      return { ok: true, body: { getReader: () => ({ read: async () => delivered
        ? { done: true } : (delivered = true, { done: false, value: bytes }) }) } };
    }
  };
  sandbox.window = sandbox;
  sandbox.__STARNET_API_TOKEN__ = 'fixture-token';
  vm.runInNewContext(harness + '\n;globalThis.__Harness = Harness;', sandbox, { filename: 'frontend/app/harness.js' });
  return async limits => {
    requestBody = null; delivered = false;
    await sandbox.__Harness.chat({ system: 'fixture', messages: [{ role: 'user', content: 'send' }], agentId: 'agent', limits });
    return requestBody;
  };
}

function verifyChatSendLimits(limits) {
  const callStart = chat.indexOf('await Harness.chat({', chat.indexOf('async function send('));
  const callEnd = chat.indexOf('\n      });', callStart);
  A.ok(callStart >= 0 && callEnd > callStart, 'Chat.send retains its main Harness.chat request call');
  const objectStart = chat.indexOf('{', callStart);
  const requestObject = chat.slice(objectStart, callEnd + 8);
  const captured = [];
  const invoke = new Function('env', 'with (env) { return Harness.chat(' + requestObject + '); }');
  const env = {
    Harness: { chat: options => { captured.push(options); return Promise.resolve({}); } },
    sys: 'fixture-system', historyWindow: () => [], ws: { id: 'ws1', agentId: 'agent' },
    isTask: false, recurring: false, ac: { signal: {} }, taskAction: '', opts: { limits },
    recoveryResume: false, recipeId: '', World: { heroCaps: () => [], stationCaps: () => [] }
  };
  invoke(env);
  return captured[0];
}

(async () => {
  let f = fixture({ iters: '4', usd: '0.15' });
  await f.submit();
  A.eq(f.sends.length, 1, 'a valid idle single-agent message is sent');
  A.eq(f.sends[0][1].limits, { maxIters: 4, maxCostUsd: 0.15 }, 'both entered bounds reach the send options');
  A.eq(f.env.input.value, '', 'successful send clears the composer');
  A.eq(f.sent, ['keep this request'], 'successful send enters sent history');

  for (const value of ['0', '-1', '1.5', String(Number.MAX_SAFE_INTEGER + 1), 'Infinity', 'NaN']) {
    f = fixture({ iters: value });
    await f.submit();
    A.eq(f.sends.length, 0, 'numeric invalid iteration value ' + value + ' is rejected without relying on native badInput');
    A.eq(f.env.input.value, 'keep this request', 'numeric invalid iteration value keeps the composer text');
  }
  for (const value of ['0', '-0.1', 'Infinity', 'NaN']) {
    f = fixture({ usd: value });
    await f.submit();
    A.eq(f.sends.length, 0, 'numeric invalid USD value ' + value + ' is rejected without relying on native badInput');
    A.eq(f.env.input.value, 'keep this request', 'numeric invalid USD value keeps the composer text');
  }

  f = fixture({ iters: '2.5' });
  f.fields['chat-limit-iters'].validity.badInput = true;
  await f.submit();
  A.eq(f.sends.length, 0, 'invalid native number input is not sent');
  A.eq(f.env.input.value, 'keep this request', 'invalid input keeps the message in the composer');
  A.eq(f.sent, [], 'invalid input is not recorded as sent');
  A.eq(f.lines.length, 1, 'invalid input explains the validation failure');

  f = fixture({ usd: '0.0000005' });
  f.fields['chat-limit-usd'].validity.rangeUnderflow = true;
  await f.submit();
  A.eq(f.sends.length, 0, 'a USD value below the declared input minimum is not sent');
  A.eq(f.env.input.value, 'keep this request', 'a below-minimum USD value keeps the message');

  for (const options of [{ iters: '3', busy: true }, { usd: '0.1', mode: 'group' }]) {
    f = fixture(options);
    await f.submit();
    A.eq(f.sends.length, 0, 'limited busy/group send is blocked');
    A.eq(f.env.input.value, 'keep this request', 'blocked busy/group send keeps the message');
    A.eq(f.sent, [], 'blocked busy/group send is not recorded as sent');
    A.eq(f.queue.length, 0, 'a limited busy send is not silently queued');
  }

  f = fixture();
  await f.submit();
  A.eq(f.sends.length, 1, 'blank limits preserve ordinary manual sending');
  A.eq(f.sends[0][1].limits, undefined, 'blank fields omit request limits');

  A.eq(verifyChatSendLimits({ maxIters: 4, maxCostUsd: 0.15 }).limits, { maxIters: 4, maxCostUsd: 0.15 }, 'the actual main Chat.send request object forwards opts.limits');
  A.eq(verifyChatSendLimits(undefined).limits, undefined, 'the actual main Chat.send request object leaves blank limits omitted');

  const postRun = makeHarness();
  const bounded = await postRun({ maxIters: 4, maxCostUsd: 0.15 });
  A.eq(bounded.limits, { maxIters: 4, maxCostUsd: 0.15 }, 'executed Harness.chat serializes both limits in the /api/run body');
  const unbounded = await postRun(undefined);
  A.ok(!Object.prototype.hasOwnProperty.call(unbounded, 'limits'), 'executed Harness.chat omits limits when the fields are blank');
  A.report('chat-run-limits-ui');
})().catch(error => { console.error(error); process.exitCode = 1; });
