'use strict';
const A = require('./_assert.js');
const P = require('../sidecar/recovery-policy.js');

A.eq(P.providerFailure({ classification: { shouldCompress: true, reason: 'context_overflow' }, canCompress: true, recoveriesUsed: 0, maxRecoveries: 1 }),
  { action: 'compress', reason: 'context_overflow', retryable: true, delayMs: 0 }, 'compression is the first recovery path');
A.eq(P.providerFailure({ classification: { shouldFallback: true, reason: 'overloaded' }, hasFallback: true, recoveriesUsed: 0, maxRecoveries: 1 }).action,
  'fallback', 'available fallback outranks same-provider retry');
A.eq(P.providerFailure({ classification: { shouldFallback: true, retryable: true, reason: 'overloaded' }, hasFallback: false, retriesUsed: 0, maxRetries: 6 }).action,
  'retry', 'exhausted fallback chain uses bounded same-provider retry');
A.eq(P.providerFailure({ classification: { retryable: true, reason: 'timeout', retryAfterMs: 2500 }, retriesUsed: 1, maxRetries: 6 }).delayMs,
  2500, 'server retry-after outranks the local rung');
A.eq(P.providerFailure({ classification: { retryable: true }, retriesUsed: 6, maxRetries: 6 }).action,
  'fail', 'retry budget is a hard bound');
A.eq(P.providerFailure({ classification: { retryable: true }, preStreamRetriesExhausted: true, retriesUsed: 0, maxRetries: 6 }).action,
  'fail', 'adapter-exhausted pre-stream ladder is never multiplied');
A.eq(P.providerFailure({ classification: { retryable: true }, cancelled: true }).action,
  'fail', 'cancellation cannot enter recovery');

const transientRead = { provenance: 'host', scope: 'read', readOnly: true };
A.eq(P.toolFailure({ tool: transientRead, result: { isError: true, summary: 'timeout', content: 'timed out' }, retriesUsed: 0, maxRetries: 1 }).action,
  'retry', 'a transient host-defined read is retryable');
A.eq(P.toolFailure({ tool: { provenance: 'host', scope: 'write', readOnly: false }, result: { isError: true, summary: 'timeout' } }).action,
  'fail', 'mutations are never retried automatically');
A.eq(P.toolFailure({ tool: { provenance: 'connector', scope: 'read', readOnly: true }, result: { isError: true, summary: 'timeout' } }).action,
  'fail', 'remote read-only metadata never grants retry authority');
A.eq(P.toolFailure({ tool: transientRead, result: { isError: true, summary: 'error', content: 'invalid arguments' } }).action,
  'fail', 'deterministic read failures are not retried');
A.eq(P.toolFailure({ tool: transientRead, result: { isError: true, summary: 'timeout' }, retriesUsed: 1, maxRetries: 1 }).action,
  'fail', 'tool retry budget is a hard one-attempt bound');
for (const [sample, delay] of [[0, 320], [0.5, 400], [1, 480], [-3, 320], [5, 480], [undefined, 400], [null, 400], [NaN, 400]]) {
  A.eq(P.jitteredDelay(400, sample), delay, 'jitter is bounded and missing/invalid samples keep the plain rung');
}
let waitedMs = 0;
for (let retriesUsed = 0; retriesUsed < P.RETRY_DELAYS_MS.length; retriesUsed++) {
  const d = P.providerFailure({ classification: { retryable: true }, retriesUsed, waitedMs, jitterSample: 1 });
  waitedMs += d.ladderMs;
  A.ok(d.delayMs <= 60000 && waitedMs <= P.RETRY_PATIENCE_MS, 'upper jitter cannot enlarge the local patience budget');
}
A.eq(waitedMs, P.RETRY_PATIENCE_MS, 'the last rung shrinks to fit the original total patience');
const server = P.providerFailure({ classification: { retryable: true, retryAfterMs: 5000 }, retriesUsed: 4,
  waitedMs: P.RETRY_PATIENCE_MS - 100, jitterSample: 0 });
A.eq(server.delayMs, 5000, 'a nearly spent local budget cannot shorten the server wait');
A.eq(server.ladderMs, 0, 'server-directed waits do not consume local patience');
A.eq(P.providerFailure({ classification: { retryable: true, retryAfterMs: 90000 }, jitterSample: 1 }).delayMs, 60000, 'server waits keep their existing hard cap');
A.eq(P.providerFailure({ classification: { retryable: true }, waitedMs: P.RETRY_PATIENCE_MS }).action, 'fail', 'spent patience stops local retries');
A.report('recovery-policy.test');
