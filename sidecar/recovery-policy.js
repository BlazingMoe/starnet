/* Central, pure recovery decisions for model-stream failures.
 *
 * The loop performs the actions; this module owns ordering and boundedness so provider adapters, fallback
 * wiring, and future UIs read one policy instead of reimplementing subtly different retry ladders. Tool retries
 * are deliberately much narrower: only host-defined reads with a clearly transient failure may be repeated. */
'use strict';

const RETRY_DELAYS_MS = [400, 1200, 4000, 10000, 30000, 60000];
// Adapted from StarNet d985f2c69: repeated idle watchdog failures should not spend every retry rung.
// Connect timeouts and generic timeout messages remain on the ordinary bounded ladder.
const MAX_IDLE_STALLS = 2;
function isIdleStall(err) {
  return !!(err && typeof err === 'object' && err.code === 'PROVIDER_STREAM_TIMEOUT' && err.phase === 'idle');
}

function finite(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

function providerFailure(input) {
  const i = input || {};
  const cls = i.classification || {};
  if (i.cancelled) return { action: 'fail', reason: 'cancelled', retryable: false, delayMs: 0 };
  const maxIdle = Math.max(0, Math.floor(finite(i.maxIdleStalls, MAX_IDLE_STALLS)));
  if (maxIdle > 0 && Math.floor(finite(i.idleStalls, 0)) >= maxIdle) {
    if (i.hasFallback && finite(i.recoveriesUsed, 0) < finite(i.maxRecoveries, 0)) {
      return { action: 'fallback', reason: 'provider_stalled', retryable: true, delayMs: 0, rotate: false };
    }
    return { action: 'fail', reason: 'provider_stalled', retryable: true, delayMs: 0 };
  }
  if (cls.shouldCompress && i.canCompress && finite(i.recoveriesUsed, 0) < finite(i.maxRecoveries, 0)) {
    return { action: 'compress', reason: String(cls.reason || 'context_overflow'), retryable: true, delayMs: 0 };
  }
  if ((cls.shouldFallback || cls.shouldRotateCredential) && i.hasFallback
      && finite(i.recoveriesUsed, 0) < finite(i.maxRecoveries, 0)) {
    return { action: 'fallback', reason: String(cls.reason || 'provider_failure'), retryable: true, delayMs: 0, rotate: !!cls.shouldRotateCredential };
  }
  const retriesUsed = Math.max(0, finite(i.retriesUsed, 0));
  const maxRetries = Math.max(0, finite(i.maxRetries, RETRY_DELAYS_MS.length));
  const fallbackUnavailable = !cls.shouldFallback || !i.hasFallback;
  if (!i.preStreamRetriesExhausted && cls.retryable && fallbackUnavailable && retriesUsed < maxRetries) {
    const local = RETRY_DELAYS_MS[Math.min(retriesUsed, RETRY_DELAYS_MS.length - 1)];
    return {
      action: 'retry', reason: String(cls.reason || 'transient'), retryable: true,
      delayMs: Math.min(60000, Math.max(local, Math.max(0, finite(cls.retryAfterMs, 0))))
    };
  }
  return { action: 'fail', reason: String(cls.reason || 'unrecoverable'), retryable: !!cls.retryable, delayMs: 0 };
}

function transientToolReason(result) {
  const r = result || {};
  const summary = String(r.summary || '').toLowerCase();
  const content = String(r.content || '').toLowerCase();
  if (summary === 'timeout' || /\btimed out\b/.test(content)) return 'timeout';
  if (/\b(?:econnreset|econnrefused|etimedout|enotfound|eai_again)\b|socket hang up|network error|fetch failed|temporar(?:y|ily) unavailable|connection (?:reset|closed|lost)/.test(content)) return 'network';
  if (/\bhttp (?:408|425|429|500|502|503|504)\b|\bstatus (?:408|425|429|500|502|503|504)\b|\brate limit(?:ed)?\b|\btoo many requests\b/.test(content)) return 'upstream';
  return '';
}

function toolFailure(input) {
  const i = input || {};
  const tool = i.tool || {};
  const result = i.result || {};
  if (i.cancelled) return { action: 'fail', reason: 'cancelled', retryable: false, delayMs: 0 };
  // `scope` and `readOnly` are trusted only for host registrations. MCP annotations never cross this gate.
  if (tool.provenance !== 'host' || tool.scope !== 'read' || tool.readOnly !== true || !result.isError) {
    return { action: 'fail', reason: 'not_retry_safe', retryable: false, delayMs: 0 };
  }
  const reason = transientToolReason(result);
  if (!reason) return { action: 'fail', reason: 'not_transient', retryable: false, delayMs: 0 };
  const retriesUsed = Math.max(0, finite(i.retriesUsed, 0));
  const maxRetries = Math.max(0, finite(i.maxRetries, 1));
  if (retriesUsed >= maxRetries) return { action: 'fail', reason, retryable: true, delayMs: 0 };
  return { action: 'retry', reason, retryable: true, delayMs: RETRY_DELAYS_MS[Math.min(retriesUsed, RETRY_DELAYS_MS.length - 1)] };
}

module.exports = { providerFailure, toolFailure, transientToolReason, RETRY_DELAYS_MS, isIdleStall, MAX_IDLE_STALLS };
