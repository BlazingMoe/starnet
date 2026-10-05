/* Optional per-request ceilings for the existing /api/run host. These only narrow
   the normal runtime limits; they never grant tools, consent or budget headroom. */
'use strict';

function parseRunRequestLimits(value) {
  if (value === undefined) return { ok: true, limits: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'limits must be an object' };
  }
  const limits = {};
  for (const key of Object.keys(value)) {
    if (key !== 'maxIters' && key !== 'maxCostUsd') {
      return { ok: false, error: 'unsupported run limit: ' + key };
    }
    const n = value[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 ||
        (key === 'maxIters' && !Number.isSafeInteger(n))) {
      return { ok: false, error: 'limits.' + key + ' must be a positive ' + (key === 'maxIters' ? 'safe integer' : 'finite number') };
    }
    limits[key] = n;
  }
  return { ok: true, limits };
}

function tightenRunLimits(base, requested) {
  requested = requested || {};
  return {
    maxIters: Math.min(base.maxIters, requested.maxIters || Infinity),
    maxCostUsd: Math.min(base.maxCostUsd, requested.maxCostUsd || Infinity)
  };
}

module.exports = { parseRunRequestLimits, tightenRunLimits };
