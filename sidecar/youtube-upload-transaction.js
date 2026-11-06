'use strict';
// Explicit host steps only. Session capabilities remain in the private durable store,
// never in model results, receipts or journal payloads. One host owns each store.
const { makeDurableJsonStore, makeKeyedMutex } = require('./durable-store');
const { digest } = require('./video-render-transaction');
const canonical = v => v && typeof v === 'object' ? (Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}') : JSON.stringify(v);
const copy = v => JSON.parse(JSON.stringify(v));
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const HASH = /^[a-f0-9]{64}$/;
const STATES = ['PREPARED', 'INITIATING', 'AMBIGUOUS_INITIATION', 'READY', 'NEEDS_STATUS', 'UPLOADED', 'VERIFIED_PRIVATE', 'REVIEW_BLOCKED'];
const keys = (o, ks) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).sort().join('|') === ks.slice().sort().join('|');
function validIntent(i) {
  return keys(i, ['id', 'renderId', 'path', 'bytes', 'sha256', 'account', 'channelId', 'title', 'description', 'categoryId', 'privacyStatus', 'selfDeclaredMadeForKids', 'containsSyntheticMedia', 'gates', 'deadline', 'costMicros', 'budgetMicros'])
    && ['id', 'renderId', 'sha256', 'channelId', 'categoryId'].every(k => typeof i[k] === 'string')
    && ID.test(i.id) && ID.test(i.renderId) && typeof i.path === 'string' && i.path.length <= 240 && /\.mp4$/i.test(i.path)
    && Number.isSafeInteger(i.bytes) && i.bytes >= 32 && i.bytes <= 1048576 && HASH.test(i.sha256)
    && keys(i.account, ['issuer', 'subject', 'email']) && i.account.issuer === 'https://accounts.google.com'
    && typeof i.account.subject === 'string' && /^[A-Za-z0-9_-]{1,255}$/.test(i.account.subject)
    && typeof i.account.email === 'string' && /^[^\s<>@]{1,256}@[^\s<>@]{1,63}$/.test(i.account.email)
    && /^UC[A-Za-z0-9_-]{22}$/.test(i.channelId) && typeof i.title === 'string' && i.title.length >= 1 && i.title.length <= 100 && !/[<>\x00-\x1f]/.test(i.title)
    && typeof i.description === 'string' && Buffer.byteLength(i.description) <= 5000 && !/[<>\x00]/.test(i.description)
    && /^[1-9][0-9]{0,2}$/.test(i.categoryId) && i.privacyStatus === 'private'
    && typeof i.selfDeclaredMadeForKids === 'boolean' && typeof i.containsSyntheticMedia === 'boolean'
    && keys(i.gates, ['rights', 'editorial', 'quality', 'humanReview', 'disclosure']) && Object.values(i.gates).every(v => v === true)
    && Number.isFinite(i.deadline) && Number.isSafeInteger(i.costMicros) && i.costMicros >= 0 && Number.isSafeInteger(i.budgetMicros) && i.budgetMicros >= i.costMicros;
}
function sessionUrl(s) {
  try {
    const u = new URL(s), entries = [...u.searchParams.entries()];
    const values = key => entries.filter(([k]) => k === key).map(([, v]) => v);
    return typeof s === 'string' && s.length <= 4096 && u.href === s && u.protocol === 'https:'
      && u.host === 'www.googleapis.com' && u.pathname === '/upload/youtube/v3/videos'
      && !u.username && !u.password && !u.hash
      && values('upload_id').length === 1 && values('upload_id')[0].length > 0 && values('upload_id')[0].length <= 2048
      && values('uploadType').length <= 1 && (!values('uploadType').length || values('uploadType')[0] === 'resumable')
      && values('part').length <= 1 && (!values('part').length || values('part')[0] === 'snippet,status')
      && values('notifySubscribers').length <= 1 && (!values('notifySubscribers').length || values('notifySubscribers')[0] === 'false')
      && entries.every(([k]) => ['upload_id', 'uploadType', 'part', 'notifySubscribers'].includes(k));
  } catch (_) { return false; }
}
function validRow(r, id) {
  if (!keys(r, ['version', 'id', 'intent', 'fingerprint', 'state', 'session', 'offset', 'videoId', 'updatedAt']) || r.version !== 1 || r.id !== id || !validIntent(r.intent) || r.intent.id !== id || r.fingerprint !== digest(canonical(r.intent)) || !STATES.includes(r.state) || !Number.isFinite(r.updatedAt) || !Number.isSafeInteger(r.offset) || r.offset < 0 || r.offset > r.intent.bytes) return false;
  if (r.session !== null && !sessionUrl(r.session)) return false;
  if (r.videoId !== null && !/^[A-Za-z0-9_-]{11}$/.test(r.videoId)) return false;
  if (['READY', 'NEEDS_STATUS'].includes(r.state) && !r.session) return false;
  if (['PREPARED', 'INITIATING', 'AMBIGUOUS_INITIATION'].includes(r.state) && (r.session || r.offset || r.videoId)) return false;
  if (['UPLOADED', 'VERIFIED_PRIVATE'].includes(r.state) && (r.session || !r.videoId || r.offset !== r.intent.bytes)) return false;
  if (['READY', 'NEEDS_STATUS'].includes(r.state) && (r.videoId || r.offset >= r.intent.bytes)) return false;
  return true;
}
function makeUploadStore(deps) {
  const durable = makeDurableJsonStore(deps), mutex = makeKeyedMutex();
  const busy = new Set();
  function read(id) {
    if (!ID.test(id)) throw Error('Invalid upload ID');
    const r = durable.readKey(id);
    if (!['absent', 'ok'].includes(r.status)) throw Error('Upload storage requires operator review');
    if (r.status === 'absent') return null;
    if (!validRow(r.value, id)) throw Error('Malformed upload checkpoint');
    return copy(r.value);
  }
  return { read, async locked(id, fn) {
    if (busy.has(id)) throw Error('Concurrent upload call refused');
    busy.add(id);
    try { return await mutex.run(id, () => fn(read(id))); } finally { busy.delete(id); }
  }, save(r) {
    if (!validRow(r, r.id)) throw Error('Invalid upload checkpoint');
    read(r.id); durable.set(r.id, r);
    if (canonical(read(r.id)) !== canonical(r)) throw Error('Upload checkpoint readback failed');
  } };
}
function result(r) {
  return { id: r.id, state: r.state, confirmedBytes: r.offset, totalBytes: r.intent.bytes,
    ...(r.videoId ? { videoId: r.videoId } : {}), ...(r.state === 'VERIFIED_PRIVATE' ? { remoteReceipt: {
      operation: 'youtube-private-upload', state: 'read-back-verified', videoId: r.videoId, channelId: r.intent.channelId,
      privacyStatus: 'private', sha256: r.intent.sha256, bytes: r.intent.bytes, intentFingerprint: r.fingerprint
    } } : {}) };
}
function sameAccount(a, b) { return a && ['issuer', 'subject', 'email'].every(k => a[k] === b[k]); }
function makeYoutubeUploadTransaction({ store, provider, readVerified, renderReceipt, clock, authorize, signal }) {
  if (!store || !provider || ![readVerified, renderReceipt, clock, authorize].every(f => typeof f === 'function')) throw Error('Host upload dependencies required');
  async function gate(i) {
    if (signal?.aborted || clock() >= i.deadline || i.costMicros > i.budgetMicros) throw Error('Upload authorization, cancellation, deadline or budget denied');
    const allowed = await authorize(i);
    if (!allowed || signal?.aborted || clock() >= i.deadline || i.costMicros > i.budgetMicros) throw Error('Upload authorization, cancellation, deadline or budget denied');
  }
  function save(r, state) { r.state = state; r.updatedAt = clock(); store.save(r); return result(r); }
  async function bytes(i) {
    const b = await readVerified(i);
    if (!Buffer.isBuffer(b) || b.length !== i.bytes || digest(b) !== i.sha256) throw Error('Bound MP4 changed');
    return b;
  }
  async function identity(i) { const a = await provider.identity(); if (!sameAccount(a.account, i.account) || a.channelId !== i.channelId) throw Error('Upload account/channel mismatch'); }
  function response(r, p) {
    if (p?.status === 308) {
      const m = p.range == null ? null : /^bytes=0-(0|[1-9][0-9]*)$/.exec(p.range);
      const offset = p.range == null ? 0 : m ? Number(m[1]) + 1 : NaN;
      if (!Number.isSafeInteger(offset) || offset < r.offset || offset >= r.intent.bytes) return save(r, 'REVIEW_BLOCKED');
      r.offset = offset; return save(r, 'READY');
    }
    if ([200, 201].includes(p?.status) && /^[A-Za-z0-9_-]{11}$/.test(p.videoId || '')) {
      r.videoId = p.videoId; r.offset = r.intent.bytes; r.session = null; return save(r, 'UPLOADED');
    }
    return save(r, p?.status >= 500 ? 'NEEDS_STATUS' : 'REVIEW_BLOCKED');
  }
  const active = new Set();
  async function step(id, operation) {
    if (active.has(id)) throw Error('Concurrent upload call refused');
    active.add(id);
    try { return await store.locked(id, async r => {
      if (!r) throw Error('Upload not prepared');
      if (['VERIFIED_PRIVATE', 'REVIEW_BLOCKED', 'AMBIGUOUS_INITIATION'].includes(r.state)) return result(r);
      await gate(r.intent);
      if (r.state === 'INITIATING') return save(r, 'AMBIGUOUS_INITIATION');
      if (operation === 'initiate') {
        if (r.state !== 'PREPARED') return result(r);
        await bytes(r.intent); await identity(r.intent); await gate(r.intent);
        save(r, 'INITIATING'); // Failure here means ZERO POSTs. Cold restart cannot re-POST.
        let p; try { p = await provider.initiate(r.intent); } catch (_) { return save(r, 'AMBIGUOUS_INITIATION'); }
        if (!p || !sessionUrl(p.location)) return save(r, 'AMBIGUOUS_INITIATION');
        r.session = p.location; return save(r, 'READY'); // Must commit Location before any bytes.
      }
      if (operation === 'status') {
        if (!['READY', 'NEEDS_STATUS'].includes(r.state)) return result(r);
        save(r, 'NEEDS_STATUS');
        let p; try { await identity(r.intent); p = await provider.status(r.session, r.intent.bytes); } catch (_) { return result(r); }
        return response(r, p);
      }
      if (operation === 'upload') {
        if (r.state !== 'READY') return result(r); // NEEDS_STATUS always requires an explicit status step.
        const b = await bytes(r.intent); await identity(r.intent); await gate(r.intent);
        save(r, 'NEEDS_STATUS');
        let p; try { p = await provider.upload(r.session, b.subarray(r.offset), r.offset, r.intent.bytes); } catch (_) { return result(r); }
        return response(r, p);
      }
      if (operation === 'verify' && r.state === 'UPLOADED') {
        let v; try { await identity(r.intent); v = await provider.verify(r.videoId); } catch (_) { return result(r); }
        if (!v || v.id !== r.videoId || v.channelId !== r.intent.channelId || v.privacyStatus !== 'private' || v.publishAt != null
          || v.selfDeclaredMadeForKids !== r.intent.selfDeclaredMadeForKids
          || v.containsSyntheticMedia !== r.intent.containsSyntheticMedia) return save(r, 'REVIEW_BLOCKED');
        return save(r, 'VERIFIED_PRIVATE');
      }
      return result(r);
    }); } finally { active.delete(id); }
  }
  return { async prepare(input) {
    if (!validIntent(input)) throw Error('Invalid private upload intent');
    const i = copy(input);
    return store.locked(i.id, async r => {
      const fingerprint = digest(canonical(i));
      if (r) { if (r.fingerprint !== fingerprint) throw Error('Conflicting upload intent'); return result(r); }
      if (i.deadline - clock() > 3600000) throw Error('Upload deadline exceeds one hour');
      await gate(i);
      const proof = await renderReceipt(i.renderId);
      if (!proof || proof.state !== 'verified' || proof.intent?.path !== i.path || proof.downloadedBytes !== i.bytes || proof.localSha256 !== i.sha256 || proof.mutationReceipt?.state !== 'read-back-verified') throw Error('Verified render receipt required');
      await bytes(i);
      r = { version: 1, id: i.id, intent: i, fingerprint, session: null, offset: 0, videoId: null, state: 'PREPARED', updatedAt: clock() };
      store.save(r); return result(r);
    });
  }, initiate: id => step(id, 'initiate'), status: id => step(id, 'status'), upload: id => step(id, 'upload'), verify: id => step(id, 'verify') };
}
module.exports = { makeUploadStore, makeYoutubeUploadTransaction, validIntent, sessionUrl };
