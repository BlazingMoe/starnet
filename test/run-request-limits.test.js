'use strict';
const A = require('./_assert.js');
const { parseRunRequestLimits: parse, tightenRunLimits: tighten } = require('../sidecar/run-request-limits.js');

A.eq(parse(undefined), { ok: true, limits: {} }, 'old callers preserve station policy');
A.eq(parse({}), { ok: true, limits: {} }, 'empty limits do not remove ceilings');
A.eq(parse({ maxIters: 6, maxCostUsd: 0.25 }), { ok: true, limits: { maxIters: 6, maxCostUsd: 0.25 } }, 'valid per-request limits');
for (const value of [null, [], '6', 6, false]) A.eq(parse(value).ok, false, 'reject malformed limits');
for (const n of [0, -1, 1.5, '6', null, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
  A.eq(parse({ maxIters: n }).ok, false, 'reject disabling or invalid iteration ceiling');
}
for (const n of [0, -1, '0.25', null, Infinity, NaN]) {
  A.eq(parse({ maxCostUsd: n }).ok, false, 'reject disabling or invalid spend ceiling');
}
A.eq(parse({ grace: true }).ok, false, 'request cannot enable grace or other internal policy');
A.eq(parse({ maxIters: 2, capability: 'all' }).ok, false, 'reject unknown limit fields');
A.eq(tighten({ maxIters: 4, maxCostUsd: 0.5 }, { maxIters: 20, maxCostUsd: 10 }),
  { maxIters: 4, maxCostUsd: 0.5 }, 'request cannot expand station limits');
A.eq(tighten({ maxIters: 4, maxCostUsd: 0.5 }, { maxIters: 2, maxCostUsd: 0.1 }),
  { maxIters: 2, maxCostUsd: 0.1 }, 'request narrows both limits');
A.eq(tighten({ maxIters: Infinity, maxCostUsd: Infinity }, { maxIters: 6 }),
  { maxIters: 6, maxCostUsd: Infinity }, 'unmetered runs can opt into finite iterations');
A.eq(tighten({ maxIters: 4, maxCostUsd: 0.5 }),
  { maxIters: 4, maxCostUsd: 0.5 }, 'internal callers preserve existing policy');
A.report('run-request-limits');
