/* Execute one tool call with the only automatic tool retry StarNet permits:
 * a bounded repeat of a host-defined read after a clearly transient failure. Mutation and connector calls
 * always return their first result because a missing response cannot prove the effect did not happen. */
'use strict';

const RecoveryPolicy = require('./recovery-policy.js');
const { abortableDelay } = require('./providers/provider.js').runtime;

async function wait(delayMs, signal, sleep) {
  if (signal && signal.aborted) return false;
  try {
    await (typeof sleep === 'function' ? sleep : abortableDelay)(delayMs, signal);
  } catch (e) {
    if (signal && signal.aborted) return false;
    throw e;
  }
  return !(signal && signal.aborted);
}

async function recoverToolResult(options) {
  const o = options || {};
  if (typeof o.dispatch !== 'function') throw new Error('recoverToolResult requires dispatch');
  const policy = typeof o.policy === 'function' ? o.policy : RecoveryPolicy.toolFailure;
  const maxRetries = Math.max(0, Number.isFinite(Number(o.maxRetries)) ? Number(o.maxRetries) : 1);
  let retriesUsed = 0;
  let result = o.result;
  while (true) {
    const decision = policy({
      tool: o.tool, result, retriesUsed, maxRetries,
      cancelled: !!(o.signal && o.signal.aborted)
    });
    if (!decision || decision.action !== 'retry') return result;
    retriesUsed++;
    if (typeof o.onRecovery === 'function') {
      o.onRecovery({
        stage: 'tool_dispatch', action: 'retry', reason: decision.reason,
        attempt: retriesUsed, model: '', delayMs: decision.delayMs
      });
    }
    if (!(await wait(decision.delayMs, o.signal, o.sleep))) return result;
    result = await o.dispatch(o.call, o.ctx);
  }
}

module.exports = { recoverToolResult };
