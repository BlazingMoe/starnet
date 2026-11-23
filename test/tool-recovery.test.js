'use strict';
const A = require('./_assert.js');
const { recoverToolResult } = require('../sidecar/tool-recovery.js');

(async () => {
  const attempts = [];
  let reads = 0;
  const recovered = await recoverToolResult({
    tool: { provenance: 'host', scope: 'read', readOnly: true }, call: { id: 'read-1' }, ctx: {},
    result: { ok: false, isError: true, summary: 'timeout', content: 'tool timed out' },
    dispatch: async () => { reads++; return { ok: true, isError: false, summary: 'ok', content: 'answer' }; },
    sleep: async () => {}, onRecovery: row => attempts.push(row)
  });
  A.eq(reads, 1, 'a transient host read runs one recovery attempt after the initial result');
  A.eq(recovered.content, 'answer', 'the recovered read result is returned');
  A.eq(attempts.map(x => [x.stage, x.action, x.reason, x.attempt]), [['tool_dispatch', 'retry', 'timeout', 1]], 'tool recovery emits stable telemetry');

  let mutations = 0;
  await recoverToolResult({
    tool: { provenance: 'host', scope: 'write', readOnly: false }, call: { id: 'write-1' }, ctx: {},
    result: { ok: false, isError: true, summary: 'timeout', content: 'timed out' },
    dispatch: async () => { mutations++; return { ok: false, isError: true, summary: 'timeout', content: 'timed out' }; },
    sleep: async () => { throw new Error('mutation retry delay must not run'); }
  });
  A.eq(mutations, 0, 'a mutation is never dispatched a second time');

  let connectorReads = 0;
  await recoverToolResult({
    tool: { provenance: 'connector', scope: 'read', readOnly: true }, call: { id: 'mcp-1' }, ctx: {},
    result: { ok: false, isError: true, summary: 'timeout', content: 'timed out' },
    dispatch: async () => { connectorReads++; return { ok: false, isError: true, summary: 'timeout', content: 'timed out' }; },
    sleep: async () => { throw new Error('connector retry delay must not run'); }
  });
  A.eq(connectorReads, 0, 'an unknown connector operation is never dispatched a second time');

  let cancelledReads = 0;
  const signal = { aborted: true };
  await recoverToolResult({
    tool: { provenance: 'host', scope: 'read', readOnly: true }, call: { id: 'read-cancelled' }, ctx: {}, signal,
    result: { ok: false, isError: true, summary: 'timeout', content: 'timed out' },
    dispatch: async () => { cancelledReads++; return { ok: false, isError: true, summary: 'timeout', content: 'timed out' }; }
  });
  A.eq(cancelledReads, 0, 'cancellation suppresses retry');

  const initial = { ok: false, isError: true, summary: 'timeout', content: 'timed out' };
  for (const injected of [false, true]) {
    const controller = new AbortController();
    let dispatches = 0;
    const options = {
      tool: { provenance: 'host', scope: 'read', readOnly: true }, result: initial, signal: controller.signal,
      policy: input => Object.assign({}, require('../sidecar/recovery-policy.js').toolFailure(input), { delayMs: 60000 }),
      dispatch: async () => { dispatches++; return { content: 'must not execute' }; },
      onRecovery: () => queueMicrotask(() => controller.abort())
    };
    if (injected) options.sleep = (ms, liveSignal) => {
      A.eq(liveSignal, controller.signal, 'injected delay receives the live cancellation signal');
      return require('../sidecar/providers/provider.js').runtime.abortableDelay(ms, liveSignal);
    };
    let deadline;
    let result;
    try {
      result = await Promise.race([recoverToolResult(options), new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('cancel failed to interrupt tool retry wait')), 2000);
      })]);
    } finally { clearTimeout(deadline); }
    A.eq(result, initial, 'cancelled retry preserves the original failure evidence');
    A.eq(dispatches, 0, 'cancel during backoff prevents redispatch');
    A.eq(require('node:events').getEventListeners(controller.signal, 'abort').length, 0, 'cancelled wait removes its listener');
  }

  let delayError = null;
  try {
    await recoverToolResult({ tool: { provenance: 'host', scope: 'read', readOnly: true }, result: initial,
      dispatch: async () => { throw new Error('must not dispatch after a broken delay'); },
      sleep: async () => { throw new Error('delay failed'); } });
  } catch (e) { delayError = e; }
  A.eq(delayError && delayError.message, 'delay failed', 'a delay failure without cancellation is not swallowed');
  A.report('tool-recovery.test');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
