/* sidecar/control/provider-view.js — pure, read-only Control Mode provider-signal projection.
   Provider registry metadata is configuration/capability metadata, NOT a liveness probe. Runtime quota
   evidence comes only from the existing providers/ratelimits store. This module never infers availability,
   credential validity, uptime, latency, success rate, or a synthetic health score. */
'use strict';

function text(value, max) {
  const s = value == null ? '' : String(value).trim();
  return s ? s.slice(0, max || 200) : '';
}
function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function bool(value) { return value === true ? true : (value === false ? false : null); }

function safeBucket(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    limit: finite(raw.limit),
    remaining: finite(raw.remaining),
    resetAt: finite(raw.resetAt),
    resetInMs: finite(raw.resetInMs),
    observedAt: finite(raw.observedAt)
  };
}

function quotaByProvider(snapshot) {
  const map = new Map();
  for (const entry of Array.isArray(snapshot) ? snapshot : []) {
    if (!entry || typeof entry !== 'object') continue;
    const provider = text(entry.provider, 80);
    if (!provider) continue;
    const buckets = {};
    const rawBuckets = entry.buckets && typeof entry.buckets === 'object' ? entry.buckets : {};
    for (const key of Object.keys(rawBuckets).sort()) buckets[text(key, 40)] = safeBucket(rawBuckets[key]);
    map.set(provider, {
      observedAt: finite(entry.observedAt),
      ageMs: finite(entry.ageMs),
      model: text(entry.model, 160),
      buckets
    });
  }
  return map;
}

function projectProviderSignals(profiles, rateLimitSnapshot) {
  const quotas = quotaByProvider(rateLimitSnapshot);
  const rows = [];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile || typeof profile !== 'object') continue;
    const id = text(profile.id, 80);
    if (!id) continue;
    const q = quotas.get(id) || null;
    const row = {
      id,
      name: text(profile.name || profile.label || id, 120),
      authType: text(profile.authType, 60),
      keyRequired: bool(profile.keyRequired),
      requiresBaseUrl: bool(profile.requiresBaseUrl),
      unmetered: bool(profile.unmetered),
      supportsTools: bool(profile.supportsTools),
      supportsReasoning: bool(profile.supportsReasoning),
      quotaObserved: !!q
    };
    if (q) row.quota = q;
    rows.push(row);
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: 'moe.control-providers.v1',
    rows,
    evidence: {
      profileSource: 'provider-registry',
      quotaSource: 'providers-ratelimits',
      providerCount: rows.length,
      quotaObservedProviders: rows.filter((row) => row.quotaObserved).length,
      availabilityInferred: false,
      credentialValidityInferred: false,
      uptimeInferred: false,
      latencyInferred: false,
      successRateInferred: false,
      healthScoreInferred: false,
      mutationsExposed: false
    }
  };
}

module.exports = { projectProviderSignals };
