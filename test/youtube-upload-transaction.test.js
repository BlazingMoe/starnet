'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeUploadStore, makeYoutubeUploadTransaction, sessionUrl } = require('../sidecar/youtube-upload-transaction');
const { makeYoutubePrivate, SCOPE } = require('../sidecar/youtube-private');
const { digest } = require('../sidecar/video-render-transaction');
const { makeYoutubeUploadTools, operations } = require('../sidecar/tools/builtin/youtube-upload');
const { makeFsTools } = require('../sidecar/tools/builtin/fs');
const { makeRegistry } = require('../sidecar/tools/registry');
const { makeArtifactCollector } = require('../sidecar/artifacts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-upload-test-'));
const video = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32000000086d6f6f76000000096d64617400', 'hex');
const session = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=private-session-capability&part=snippet,status&notifySubscribers=false';
const account = { issuer: 'https://accounts.google.com', subject: '1234', email: 'fixture@example.test' };
const channelId = 'UC' + 'a'.repeat(22), videoId = 'abc123def45';
let number = 0, checks = 0;
const check = (v, x) => { assert.equal(v, x); checks++; };
function fixture(overrides = {}) {
  const dir = path.join(root, String(++number)); fs.mkdirSync(dir);
  const storeDeps = { fs, path, fileFor: id => path.join(dir, id + '.json') };
  const store = makeUploadStore(storeDeps);
  const calls = [];
  const intent = { id: 'upload', renderId: 'render', path: 'render.mp4', bytes: video.length, sha256: digest(video), account: { ...account }, channelId,
    title: 'Private fixture', description: '', categoryId: '22', privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true,
    gates: { rights: true, editorial: true, quality: true, humanReview: true, disclosure: true }, deadline: 1000, costMicros: 0, budgetMicros: 0 };
  const provider = { identity: async () => ({ account, channelId }),
    initiate: async () => { calls.push('POST'); check(store.read('upload').state, 'INITIATING'); return { location: session }; },
    status: async (url, total) => { calls.push('STATUS'); check(url, session); check(total, video.length); return { status: 308, range: null }; },
    upload: async (url, bytes, offset, total) => { calls.push('PUT'); check(store.read('upload').state, 'NEEDS_STATUS'); check(store.read('upload').session, session); check(url, session); check(total, video.length); assert.deepEqual(bytes, video.subarray(offset)); return { status: 200, videoId }; },
    verify: async id => { calls.push('GET'); check(store.read('upload').videoId, videoId); check(id, videoId); return { id, channelId, privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true }; }, ...overrides.provider };
  const deps = { store, provider, clock: () => 1, authorize: async () => true, readVerified: async () => Buffer.from(video),
    renderReceipt: async () => ({ state: 'verified', intent: { path: 'render.mp4' }, downloadedBytes: video.length, localSha256: digest(video), mutationReceipt: { state: 'read-back-verified' } }), ...overrides, provider };
  return { dir, storeDeps, store, deps, intent, provider, calls, service: makeYoutubeUploadTransaction(deps) };
}
async function ready(f) { await f.service.prepare(f.intent); return f.service.initiate('upload'); }
async function main() {
  try {
    const f = fixture(); await ready(f);
    check(f.store.read('upload').session, session);
    const cold = makeYoutubeUploadTransaction({ ...f.deps, store: makeUploadStore(f.storeDeps) });
    check((await cold.upload('upload')).state, 'UPLOADED');
    const done = await cold.verify('upload'); check(done.state, 'VERIFIED_PRIVATE'); check(done.remoteReceipt.privacyStatus, 'private');
    check(JSON.stringify(done).includes('private-session-capability'), false); check(done.artifact, undefined);
    check(fs.readFileSync(path.join(f.dir, 'upload.json'), 'utf8').includes('private-session-capability'), false);
    check((await cold.prepare(f.intent)).state, 'VERIFIED_PRIVATE'); check((await cold.initiate('upload')).state, 'VERIFIED_PRIVATE');
    assert.deepEqual(f.calls, ['POST', 'PUT', 'GET']);
    await assert.rejects(cold.prepare({ ...f.intent, title: 'changed' }), /Conflicting/);

    for (const change of [i => { i.publishAt = '2027-01-01'; }, i => { i.schedule = {}; }, i => { i.onBehalfOfContentOwner = 'x'; }, i => { i.privacyStatus = 'public'; }, i => { i.privacyStatus = 'unlisted'; }, i => { delete i.selfDeclaredMadeForKids; }, i => { delete i.containsSyntheticMedia; }, i => { i.apiKey = 'secret'; }, i => { i.account.token = 'secret'; }, i => { i.gates.humanReview = false; }, i => { delete i.gates.editorial; }, i => { i.costMicros = 1; }]) {
      const p = fixture(); change(p.intent); await assert.rejects(p.service.prepare(p.intent)); check(p.calls.length, 0);
    }
    for (const override of [{ authorize: async () => false }, { signal: { aborted: true } }, { clock: () => 1001 }, { renderReceipt: async () => null }, { readVerified: async () => Buffer.alloc(video.length) }]) {
      const p = fixture(override); await assert.rejects(p.service.prepare(p.intent)); check(p.calls.length, 0);
    }
    const distant = fixture(); distant.intent.deadline = 3600002; await assert.rejects(distant.service.prepare(distant.intent), /one hour/); check(distant.calls.length, 0);
    const writeFail = fixture(); await writeFail.service.prepare(writeFail.intent); writeFail.store.save = () => { throw Error('disk failure'); };
    const lateDenied = fixture(); await lateDenied.service.prepare(lateDenied.intent);
    for (const deniedDeps of [{ authorize: async () => false }, { signal: { aborted: true } }, { clock: () => 1001 }]) {
      await assert.rejects(makeYoutubeUploadTransaction({ ...lateDenied.deps, ...deniedDeps }).initiate('upload'));
      check(lateDenied.calls.length, 0);
    }
    let authorizationClock = 1;
    await assert.rejects(makeYoutubeUploadTransaction({
      ...lateDenied.deps,
      clock: () => authorizationClock,
      authorize: async () => { authorizationClock = 1001; return true; }
    }).initiate('upload'), /deadline/);
    check(lateDenied.calls.length, 0);
    const lateUpload = fixture(); await ready(lateUpload); let uploadAuthorizationClock = 1;
    await assert.rejects(makeYoutubeUploadTransaction({
      ...lateUpload.deps,
      clock: () => uploadAuthorizationClock,
      authorize: async () => { uploadAuthorizationClock = 1001; return true; }
    }).upload('upload'), /deadline/);
    check(lateUpload.calls.length, 1);
    await assert.rejects(writeFail.service.initiate('upload'), /disk failure/); check(writeFail.calls.length, 0);
    const locationFail = fixture(); await locationFail.service.prepare(locationFail.intent); const save = locationFail.store.save;
    locationFail.store.save = r => { if (r.state === 'READY') throw Error('Location write failure'); save(r); };
    await assert.rejects(locationFail.service.initiate('upload')); check(locationFail.calls.length, 1);
    const restarted = makeYoutubeUploadTransaction({ ...locationFail.deps, store: makeUploadStore(locationFail.storeDeps) });
    check((await restarted.initiate('upload')).state, 'AMBIGUOUS_INITIATION'); check(locationFail.calls.length, 1);
    const ambiguous = fixture({ provider: { initiate: async () => { ambiguous.calls.push('POST'); throw Error('lost response'); } } });
    await ready(ambiguous); check((await ambiguous.service.initiate('upload')).state, 'AMBIGUOUS_INITIATION'); check(ambiguous.calls.length, 1);
    for (const location of [null, '', 'https://evil.test/upload', session + '&token=secret']) {
      const p = fixture({ provider: { initiate: async () => ({ location }) } }); check((await ready(p)).state, 'AMBIGUOUS_INITIATION');
    }
    for (const outcome of [new Error('timeout'), { status: 503 }]) {
      const p = fixture(); await ready(p); p.provider.upload = async () => { p.calls.push('PUT'); if (outcome instanceof Error) throw outcome; return outcome; };
      check((await p.service.upload('upload')).state, 'NEEDS_STATUS'); await p.service.upload('upload'); check(p.calls.filter(c => c === 'PUT').length, 1);
      p.provider.status = async () => { p.calls.push('STATUS'); return { status: 308, range: 'bytes=0-15' }; };
      check((await p.service.status('upload')).confirmedBytes, 16);
      p.provider.upload = async (url, bytes, offset, total) => { check(offset, 16); check(total, video.length); assert.deepEqual(bytes, video.subarray(16)); p.calls.push('PUT'); return { status: 200, videoId }; };
      await p.service.upload('upload'); assert.deepEqual(p.calls, ['POST', 'PUT', 'STATUS', 'PUT']);
    }
    for (const range of ['bytes=1-15', 'bytes=0-999', 'bytes=0--1', 'bytes=0-01', 'garbage', 'bytes=0-2,4-9']) {
      const p = fixture({ provider: { status: async () => ({ status: 308, range }) } }); await ready(p); check((await p.service.status('upload')).state, 'REVIEW_BLOCKED');
    }
    const rollback = fixture(); await ready(rollback); rollback.provider.status = async () => ({ status: 308, range: 'bytes=0-15' }); await rollback.service.status('upload'); rollback.provider.status = async () => ({ status: 308, range: 'bytes=0-7' }); check((await rollback.service.status('upload')).state, 'REVIEW_BLOCKED');
    const expired = fixture({ provider: { status: async () => ({ status: 404 }) } }); await ready(expired); check((await expired.service.status('upload')).state, 'REVIEW_BLOCKED'); await expired.service.initiate('upload'); check(expired.calls.length, 1);
    const lostFinal = fixture({ provider: { upload: async () => { throw Error('final response lost'); }, status: async () => ({ status: 200, videoId }) } }); await ready(lostFinal); await lostFinal.service.upload('upload'); check((await lostFinal.service.status('upload')).state, 'UPLOADED'); check(lostFinal.store.read('upload').videoId, videoId); check((await lostFinal.service.verify('upload')).state, 'VERIFIED_PRIVATE');
    for (const who of [{ account: { ...account, subject: 'wrong' }, channelId }, { account, channelId: 'UC' + 'b'.repeat(22) }]) {
      const p = fixture({ provider: { identity: async () => who } }); await p.service.prepare(p.intent); await assert.rejects(p.service.initiate('upload')); check(p.calls.length, 0);
    }
    for (const patch of [{ id: 'wrongvideo1' }, { channelId: 'UC' + 'b'.repeat(22) }, { privacyStatus: 'public' }, { publishAt: 'tomorrow' }, { selfDeclaredMadeForKids: true }, { selfDeclaredMadeForKids: undefined }, { containsSyntheticMedia: false }, { containsSyntheticMedia: undefined }]) {
      const p = fixture(); await ready(p); await p.service.upload('upload'); const verify = p.provider.verify; p.provider.verify = async id => ({ ...await verify(id), ...patch }); check((await p.service.verify('upload')).state, 'REVIEW_BLOCKED');
    }
    const changed = fixture(); await ready(changed); changed.deps.readVerified = async () => Buffer.alloc(video.length); const changedSvc = makeYoutubeUploadTransaction(changed.deps); await assert.rejects(changedSvc.upload('upload'), /changed/); check(changed.calls.length, 1);
    const recovered = fixture(); await ready(recovered); fs.writeFileSync(path.join(recovered.dir, 'upload.json'), ''); assert.throws(() => makeUploadStore(recovered.storeDeps).read('upload'), /review/);
    for (const patch of [{ offset: -1 }, { session: null }, { state: 'bogus' }, { extraSecret: 'secret' }, { videoId: 'invalid' }]) {
      const p = fixture(); await ready(p); fs.writeFileSync(path.join(p.dir, 'upload.json'), JSON.stringify({ ...p.store.read('upload'), ...patch })); assert.throws(() => makeUploadStore(p.storeDeps).read('upload'), /Malformed/);
    }
    const concurrent = fixture(); await concurrent.service.prepare(concurrent.intent);
    const both = await Promise.allSettled([concurrent.service.initiate('upload'), makeYoutubeUploadTransaction(concurrent.deps).initiate('upload')]); check(both.filter(x => x.status === 'rejected').length, 1); check(concurrent.calls.length, 1);

    const writer = makeFsTools({ fsp: fs.promises, pathMod: path, root: path.join(root, 'jail') });
    await writer.writeVideoArtifact('render.mp4', video, { agentId: 'test', videoArtifactConsent: true });
    assert.deepEqual(await writer.readVideoArtifact(f.intent, { agentId: 'test' }), video);
    for (const patch of [{ path: '../escape.mp4' }, { path: 'C:\\escape.mp4' }, { sha256: '0'.repeat(64) }, { bytes: video.length - 1 }, { bytes: 1048577 }]) await assert.rejects(writer.readVideoArtifact({ ...f.intent, ...patch }, { agentId: 'test' }));
    check(writer.tools?.some(t => t.name.includes('readVideoArtifact')) || false, false);

    const reg = makeRegistry(), registered = fixture(); makeYoutubeUploadTools({ service: () => registered.deps }).register(reg);
    const ctx = { agentId: 'test', consent: async () => ({ allow: true }), authorize: async () => ({ ok: true }) };
    const dispatch = (op, args, context = ctx) => reg.dispatch({ id: op, name: 'channel.youtube.' + op, args, argsRaw: JSON.stringify(args) }, context);
    check((await dispatch('prepare', { intent: registered.intent }, { ...ctx, consent: async () => ({ allow: false }) })).ok, false);
    check((await dispatch('prepare', { intent: registered.intent }, { ...ctx, canUse: () => false })).ok, false);
    check((await dispatch('prepare', { intent: registered.intent }, { ...ctx, signal: { aborted: true } })).ok, false);
    for (const op of ['prepare', 'initiate', 'upload', 'verify']) { const r = await dispatch(op, op === 'prepare' ? { intent: registered.intent } : { id: 'upload' }); check(r.ok, true); check(String(r.content).includes('private-session-capability'), false); }
    const artifact = makeArtifactCollector(); artifact.observe({ toolName: 'channel.youtube.verify', result: await dispatch('verify', { id: 'upload' }) }); check(artifact.count(), 0);
    for (const op of operations) { const def = reg.get('channel.youtube.' + op); check(def.requiresConsent, true); check(def.scope, 'write'); }

    // Real adapter contract, fake transport only. No network library is ever called.
    const requests = [];
    const jsonResponse = value => ({ ok: true, status: 200, body: (async function* () { yield Buffer.from(JSON.stringify(value)); })() });
    const adapter = makeYoutubePrivate({ credential: async () => ({ token: 'test-bearer', scopes: [SCOPE] }), clock: () => 1,
      fetch: async (url, init) => {
        requests.push({ url, init });
        if (url.includes('userinfo')) return { ok: true, text: async () => JSON.stringify({ sub: account.subject, email: account.email, email_verified: true }) };
        if (url.includes('/channels?')) return jsonResponse({ items: [{ id: channelId }] });
        if (init.method === 'POST') return { ok: true, headers: { get: k => k === 'location' ? session : null } };
        if (init.headers['Content-Range']?.startsWith('bytes */')) return { status: 308, headers: { get: () => 'bytes=0-15' } };
        if (init.method === 'PUT') return jsonResponse({ id: videoId });
        return jsonResponse({ items: [{ id: videoId, snippet: { channelId }, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true } }] });
      } });
    const af = fixture({ provider: adapter }); await ready(af); await af.service.status('upload'); await af.service.upload('upload'); check((await af.service.verify('upload')).state, 'VERIFIED_PRIVATE');
    check(requests.filter(r => r.init.method === 'POST').length, 1);
    const puts = requests.filter(r => r.init.method === 'PUT'); check(puts[0].init.headers['Content-Range'], 'bytes */' + video.length); check(puts[0].init.body.length, 0); check(puts[1].init.headers['Content-Range'], 'bytes 16-' + (video.length - 1) + '/' + video.length);
    assert.ok(requests.every(r => r.init.redirect === 'error'));
    const post = requests.find(r => r.init.method === 'POST');
    check(new URL(post.url).searchParams.get('notifySubscribers'), 'false');
    const metadata = JSON.parse(post.init.body); assert.deepEqual(metadata.status, { privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true });
    check(fs.readFileSync(path.join(af.dir, 'upload.json'), 'utf8').includes('test-bearer'), false);
    check(JSON.stringify(await af.service.verify('upload')).includes('test-bearer'), false);
    for (const status of [401, 403]) {
      let posts = 0;
      const deniedAdapter = makeYoutubePrivate({ credential: async () => ({ token: 'fixture-only', scopes: [SCOPE] }), clock: () => 1,
        fetch: async (url, init) => {
          if (init.method === 'POST') posts++;
          if (url.includes('userinfo')) return { ok: true, text: async () => JSON.stringify({ sub: account.subject, email: account.email, email_verified: true }) };
          return { ok: false, status };
        } });
      const p = fixture({ provider: deniedAdapter }); await p.service.prepare(p.intent); await assert.rejects(p.service.initiate('upload')); check(posts, 0);
    }
    const broad = makeYoutubePrivate({ credential: async () => ({ token: 'secret', scopes: [SCOPE, 'https://www.googleapis.com/auth/youtube'] }), clock: () => 1, fetch: async () => { throw Error('must not call'); } }); await assert.rejects(broad.identity(), /upload-only/);
    check(sessionUrl('https://www.googleapis.com.evil.test/upload/youtube/v3/videos?upload_id=x'), false);
    check(sessionUrl('https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x&upload_id=y'), false);
    check(sessionUrl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=media&upload_id=x'), false);
    check(sessionUrl('https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x&notifySubscribers=true'), false);
    console.log('youtube-upload-transaction: ' + checks + ' assertions plus denial, checkpoint, binary and adapter checks passed (fake transport only)');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
