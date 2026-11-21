'use strict';

// Host-owned, explicitly stepped transaction. No timers, model calls or background work.
const crypto = require('node:crypto');
const { makeDurableJsonStore, makeKeyedMutex } = require('./durable-store.js');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => value && typeof value === 'object'
  ? (Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}')
  : JSON.stringify(value);
const clone = value => JSON.parse(JSON.stringify(value));
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const HASH = /^[a-f0-9]{64}$/;
const STATES = new Set(['prepared', 'submitting', 'submitted', 'polling', 'succeeded', 'downloading', 'downloaded', 'verified', 'blocked', 'failed', 'cancelled', 'timed_out', 'ambiguous_submission', 'ambiguous_download', 'review_required']);
const INTENT_KEYS = ['budgetMicros', 'costMicros', 'deadline', 'edit', 'environment', 'gates', 'id', 'path'];
const GATE_KEYS = ['disclosure', 'quality', 'rights'];
function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}
function validIntent(intent) {
  return exactKeys(intent, INTENT_KEYS)
    && ID.test(intent.id || '')
    && intent.environment === 'stage'
    && Number.isFinite(intent.deadline)
    && typeof intent.path === 'string' && intent.path.length > 0 && intent.path.length <= 240 && /\.mp4$/i.test(intent.path)
    && exactKeys(intent.gates, GATE_KEYS)
    && GATE_KEYS.every(key => typeof intent.gates[key] === 'boolean')
    && Number.isSafeInteger(intent.costMicros) && intent.costMicros >= 0
    && Number.isSafeInteger(intent.budgetMicros) && intent.budgetMicros >= 0
    && intent.edit && typeof intent.edit === 'object' && !Array.isArray(intent.edit);
}
function validOutput(row) {
  const output = row.output;
  if (!output || typeof output !== 'object' || typeof output.url !== 'string'
      || !Array.isArray(output.allowlist) || output.allowlist.length !== 1 || output.allowlist[0] !== output.url) return false;
  try {
    const url = new URL(output.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
  } catch (_) { return false; }
  return (output.bytes == null || (Number.isSafeInteger(output.bytes) && output.bytes >= 16 && output.bytes <= 67108864))
    && (output.sha256 == null || HASH.test(output.sha256));
}
function validStoredRow(row, id) {
  if (!row || row.version !== 1 || row.id !== id || !ID.test(id || '') || !HASH.test(row.fingerprint || '')
      || !validIntent(row.intent) || row.intent.id !== id || digest(canonical(row.intent)) !== row.fingerprint
      || !STATES.has(row.state) || !Number.isSafeInteger(row.polls) || row.polls < 0 || row.polls > 30
      || !Number.isFinite(row.updatedAt)) return false;
  const providerStates = new Set(['submitted', 'polling', 'succeeded', 'downloading', 'downloaded', 'verified', 'failed', 'cancelled', 'ambiguous_download']);
  if (providerStates.has(row.state) && !ID.test(row.providerRenderId || '')) return false;
  const outputStates = new Set(['succeeded', 'downloading', 'downloaded', 'verified', 'ambiguous_download']);
  if (outputStates.has(row.state) && !validOutput(row)) return false;
  if (['downloaded', 'verified'].includes(row.state)
      && (!Number.isSafeInteger(row.downloadedBytes) || row.downloadedBytes < 16 || !HASH.test(row.localSha256 || ''))) return false;
  if (row.state === 'verified') {
    const artifact = row.artifact, receipt = row.mutationReceipt;
    if (!artifact || artifact.kind !== 'file' || artifact.path !== row.intent.path || artifact.bytes !== row.downloadedBytes
        || artifact.sha256 !== row.localSha256 || !receipt || receipt.operation !== 'video-write'
        || receipt.state !== 'read-back-verified' || receipt.path !== artifact.path
        || receipt.verifiedBytes !== artifact.bytes || receipt.actualSha256 !== artifact.sha256) return false;
  }
  return true;
}
function mp4Evidence(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32) return false;
  const kinds = new Set(); let offset = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false;
    const size = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8);
    // This bounded slice accepts ordinary 32-bit boxes only; unsupported variants require review.
    if (size < 8 || offset + size > bytes.length || (offset === 0 && (kind !== 'ftyp' || size < 16))) return false;
    kinds.add(kind); offset += size;
  }
  return kinds.has('ftyp') && kinds.has('moov') && kinds.has('mdat');
}

function makeRenderStore(deps) {
  const durable = makeDurableJsonStore(deps);
  const mutex = makeKeyedMutex();
  function read(id) {
    if (!ID.test(id)) throw Error('Invalid render intent ID');
    const r = durable.readKey(id);
    // A backup may precede submission. NEVER silently roll back a mutation boundary.
    if (!['ok', 'absent'].includes(r.status)) throw Error('Render storage requires operator review: ' + r.status);
    if (r.status === 'absent') return null;
    if (!validStoredRow(r.value, id)) throw Error('Invalid render transaction');
    return clone(r.value);
  }
  return { read, locked: (id, fn) => mutex.run(id, () => fn(read(id))),
    save(row) {
      if (!validStoredRow(row, row && row.id)) throw Error('Invalid render transaction checkpoint');
      read(row.id); // includes fail-closed backup/corruption check before every write
      durable.set(row.id, row);
      if (canonical(read(row.id)) !== canonical(row)) throw Error('Render checkpoint read-back failed');
      return clone(row);
    } };
}

function makeVideoRenderTransaction({ store, provider, clock, authorize, writeVerified, maxBytes = 1048576, maxPolls = 8, readAttempts = 2 }) {
  if (!store || !provider || typeof clock !== 'function' || typeof authorize !== 'function') throw Error('Host render dependencies required');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 16 || maxBytes > 67108864 || !Number.isInteger(maxPolls) || maxPolls < 1 || maxPolls > 30 || !Number.isInteger(readAttempts) || readAttempts < 1 || readAttempts > 3) throw Error('Invalid render bounds');
  const save = (r, state, extra = {}) => store.save({ ...r, ...extra, state, updatedAt: clock() });
  async function allowed(intent, operation) {
    if (provider.environment !== 'stage' || intent.environment !== 'stage') throw Error('Stage-only rendering');
    if (!intent.gates || ['rights', 'disclosure', 'quality'].some(k => intent.gates[k] !== true)) throw Error('Render gates unresolved');
    if (!Number.isSafeInteger(intent.costMicros) || intent.costMicros < 0 || !Number.isSafeInteger(intent.budgetMicros) || intent.budgetMicros < 0 || intent.costMicros > intent.budgetMicros) throw Error('Known in-budget cost required');
    if (typeof provider.validateIntent === 'function') provider.validateIntent(intent);
    if (await authorize(clone(intent), operation) !== true) throw Error('Explicit host render consent required');
  }
  async function safeRead(fn) {
    let last;
    for (let n = 0; n < readAttempts; n++) {
      try { return await fn(); } catch (e) { last = e; if (!e || e.retryable !== true) throw e; }
    }
    throw last;
  }
  function response(r, result) {
    if (!result || result.id !== r.providerRenderId || result.intentFingerprint !== r.fingerprint || !Number.isFinite(result.observedAt) || result.observedAt < r.updatedAt || result.observedAt > clock()) throw Error('Unbound, stale or malformed provider result');
    if (!['queued', 'rendering', 'succeeded', 'failed', 'cancelled'].includes(result.state)) throw Error('Unknown provider state');
    return result;
  }
  async function prepare(intent) {
    if (!validIntent(intent) || JSON.stringify(intent).length > 100000) throw Error('Invalid render intent');
    const frozen = clone(intent), fingerprint = digest(canonical(frozen));
    return store.locked(intent.id, async prior => {
      if (prior) { if (prior.fingerprint !== fingerprint) throw Error('Conflicting render retry'); return prior; }
      if (intent.deadline <= clock() || intent.deadline - clock() > 3600000) throw Error('Invalid render deadline');
      const base = { version: 1, id: intent.id, fingerprint, intent: frozen, polls: 0 };
      try { await allowed(frozen, 'prepare'); } catch (e) { return save(base, 'blocked', { reason: e.message }); }
      return save(base, 'prepared');
    });
  }
  async function submit(id) {
    return store.locked(id, async r => {
      if (!r) throw Error('Render intent not prepared');
      if (r.state === 'submitting') return save(r, 'ambiguous_submission');
      if (r.state !== 'prepared') return r; // including submitting after a process crash
      try { await allowed(r.intent, 'submit'); } catch (e) { return save(r, 'blocked', { reason: e.message }); }
      if (clock() >= r.intent.deadline) return save(r, 'timed_out');
      r = save(r, 'submitting'); // durable boundary BEFORE the sole mutating provider call
      let result;
      try { result = await provider.submit(clone(r.intent), r.fingerprint); }
      catch (e) { return save(r, 'ambiguous_submission', { reason: 'Submission outcome requires reconciliation' }); }
      if (!result || !ID.test(result.id || '') || result.intentFingerprint !== r.fingerprint) return save(r, 'ambiguous_submission');
      return save(r, 'submitted', { providerRenderId: result.id }); // committed BEFORE polling
    });
  }
  async function reconcile(id) {
    return store.locked(id, async r => {
      if (!r) throw Error('Unknown render intent');
      if (!['submitting', 'ambiguous_submission', 'submitted', 'polling'].includes(r.state)) return r;
      await allowed(r.intent, 'reconcile');
      if (!r.providerRenderId) {
        // Real adapters lacking authoritative lookup must leave this closed for review.
        if (typeof provider.lookup !== 'function') return save(r, 'ambiguous_submission');
        const found = await safeRead(() => provider.lookup(r.fingerprint));
        if (!found || found.exhaustive !== true || !Array.isArray(found.matches) || found.matches.length !== 1 || found.matches[0].intentFingerprint !== r.fingerprint || !ID.test(found.matches[0].id || '')) return save(r, 'ambiguous_submission');
        r = save(r, 'submitted', { providerRenderId: found.matches[0].id });
      }
      if (clock() >= r.intent.deadline || r.polls >= maxPolls) return save(r, 'timed_out');
      r = save(r, 'polling', { polls: r.polls + 1 });
      let result;
      try { result = response(r, await safeRead(() => provider.poll(r.providerRenderId, r.fingerprint))); }
      catch (e) { return save(r, 'review_required', { reason: 'Provider read could not be verified' }); }
      if (result.state === 'failed' || result.state === 'cancelled') return save(r, result.state);
      if (result.state !== 'succeeded') return r;
      const output = result.output;
      if (!output || typeof output.url !== 'string' || !Array.isArray(output.allowlist) || output.allowlist.length !== 1 || output.allowlist[0] !== output.url || (output.bytes != null && (!Number.isSafeInteger(output.bytes) || output.bytes < 16 || output.bytes > maxBytes)) || (output.sha256 != null && !HASH.test(output.sha256))) return save(r, 'review_required', { reason: 'Missing verified output manifest' });
      const u = new URL(output.url);
      if (u.protocol !== 'https:' || u.username || u.password || u.hash) return save(r, 'review_required');
      return save(r, 'succeeded', { output: clone(output) });
    });
  }
  async function finalize(id, context) {
    return store.locked(id, async r => {
      if (!r) throw Error('Unknown render intent');
      if (r.state === 'downloading' || r.state === 'downloaded') return save(r, 'ambiguous_download');
      if (r.state !== 'succeeded') return r; // download/write ambiguity never silently repeats
      await allowed(r.intent, 'finalize');
      if (clock() >= r.intent.deadline) return save(r, 'timed_out');
      if (typeof writeVerified !== 'function') throw Error('Verified host artifact writer unavailable');
      r = save(r, 'downloading');
      try {
        const result = await safeRead(() => provider.download(clone(r.output), maxBytes));
        const bytes = result && result.bytes;
        if (!result || result.url !== r.output.url || result.mime !== 'video/mp4' || !Buffer.isBuffer(bytes) || (r.output.bytes != null && bytes.length !== r.output.bytes) || bytes.length > maxBytes || !mp4Evidence(bytes) || (r.output.sha256 != null && digest(bytes) !== r.output.sha256)) throw Error('Video bytes failed verification');
        const localSha256 = digest(bytes);
        r = save(r, 'downloaded', { downloadedBytes: bytes.length, localSha256 });
        const written = await writeVerified(r.intent.path, bytes, context);
        const receipt = written && written.mutationReceipt;
        if (!receipt || receipt.state !== 'read-back-verified' || receipt.path !== r.intent.path || receipt.verifiedBytes !== bytes.length || receipt.actualSha256 !== localSha256) throw Error('Artifact write not verified');
        return save(r, 'verified', { artifact: { kind: 'file', path: receipt.path, bytes: receipt.verifiedBytes, sha256: receipt.actualSha256 }, mutationReceipt: receipt, integrityBasis: 'Provider ID/status/URL plus bounded MP4 download and local SHA-256 matched to atomic writer readback. Proves stored byte integrity, not semantic quality, originality, rights or an independent provider-authored digest.' });
      } catch (e) { return save(r, 'ambiguous_download', { reason: 'Download or artifact write requires review' }); }
    });
  }
  return { prepare, submit, reconcile, finalize, inspect: store.read };
}

module.exports = { makeRenderStore, makeVideoRenderTransaction, digest };
