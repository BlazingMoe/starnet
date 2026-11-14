'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { makeRenderStore, makeVideoRenderTransaction, digest } = require('../sidecar/video-render-transaction');
const { makeShotstackStage, ENDPOINT } = require('../sidecar/shotstack-stage');
const { makeFsTools } = require('../sidecar/tools/builtin/fs');
const { makeArtifactCollector } = require('../sidecar/artifacts');
const { makeVideoRenderTools } = require('../sidecar/tools/builtin/video-render');
const { makeRegistry } = require('../sidecar/tools/registry');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'render-test-'));
  const video = Buffer.from('000000186674797069736f6d0000020069736f6d6d703432000000086d6f6f76000000096d64617400', 'hex');
  let sequence = 0;
  function fixture(options = {}) {
    const dir = path.join(root, String(++sequence)); fs.mkdirSync(dir);
    const storeDeps = { fs, path, fileFor: id => path.join(dir, id + '.json') };
    const store = makeRenderStore(storeDeps);
    let submits = 0, polls = 0, downloads = 0, writes = 0;
    const output = { url: 'https://media.example.test/private.mp4', allowlist: ['https://media.example.test/private.mp4'], bytes: video.length, sha256: digest(video) };
    const intent = { id: 'test', environment: 'stage', deadline: 1000, path: 'render.mp4', gates: { rights: true, disclosure: true, quality: true }, costMicros: 0, budgetMicros: 0, edit: { timeline: {}, output: { format: 'mp4' } } };
    let now = 1;
    const provider = { environment: 'stage',
      submit: async (_, fingerprint) => { submits++; assert.equal(store.read('test').state, 'submitting'); return { id: 'remote', intentFingerprint: fingerprint }; },
      poll: async (id, fingerprint) => { polls++; assert.equal(store.read('test').providerRenderId, id); return { id, intentFingerprint: fingerprint, observedAt: now, state: 'succeeded', output }; },
      download: async () => { downloads++; return { url: output.url, mime: 'video/mp4', bytes: video }; }, ...options.provider };
    const writer = makeFsTools({ fsp: fs.promises, pathMod: path, root: path.join(dir, 'files') });
    const deps = { store, provider, clock: () => now, authorize: async () => true, writeVerified: async (p, b, ctx) => { writes++; return writer.writeVideoArtifact(p, b, ctx); }, ...options };
    deps.provider = provider;
    const service = makeVideoRenderTransaction(deps);
    return { service, store, intent, output, provider, dir, storeDeps, deps, setNow: value => { now = value; }, counts: () => ({ submits, polls, downloads, writes }) };
  }
  const ctx = { agentId: 'test', videoArtifactConsent: true };
  async function ready(f) { await f.service.prepare(f.intent); await f.service.submit('test'); await f.service.reconcile('test'); }
  try {
    const f = fixture(); await ready(f);
    const done = await f.service.finalize('test', ctx);
    assert.equal(done.state, 'verified'); assert.equal(done.artifact.sha256, digest(video));
    assert.deepEqual(fs.readFileSync(path.join(f.dir, 'files/test/render.mp4')), video);
    assert.equal((await f.service.prepare(f.intent)).state, 'verified');
    assert.equal((await f.service.submit('test')).state, 'verified');
    assert.equal((await f.service.finalize('test', ctx)).state, 'verified');
    assert.deepEqual(f.counts(), { submits: 1, polls: 1, downloads: 1, writes: 1 });
    await assert.rejects(f.service.prepare({ ...f.intent, costMicros: 1 }), /Conflicting/);
    await assert.rejects(f.service.prepare({ ...f.intent, apiKey: 'must-not-be-persisted' }), /Invalid render intent/);
    const checkpoint = fixture(); await checkpoint.service.prepare(checkpoint.intent);
    assert.throws(() => checkpoint.store.save({ ...checkpoint.store.read('test'), state: 'invented' }), /checkpoint/);
    assert.equal(checkpoint.store.read('test').state, 'prepared');
    for (const modify of [i => { i.costMicros = 1; }, i => { i.gates.rights = false; }, i => { i.gates.disclosure = false; }, i => { i.gates.quality = false; }]) {
      const denied = fixture(); modify(denied.intent);
      assert.equal((await denied.service.prepare(denied.intent)).state, 'blocked');
      await denied.service.submit('test'); assert.equal(denied.counts().submits, 0);
    }
    for (const modify of [i => { i.costMicros = null; }, i => { i.environment = 'v1'; }]) {
      const invalid = fixture(); modify(invalid.intent);
      await assert.rejects(invalid.service.prepare(invalid.intent), /Invalid render intent/);
      assert.equal(invalid.counts().submits, 0);
    }
    const denied = fixture({ authorize: async () => false });
    assert.equal((await denied.service.prepare(denied.intent)).state, 'blocked'); assert.equal(denied.counts().submits, 0);
    const before = fixture(); await before.service.prepare(before.intent);
    const cold = makeVideoRenderTransaction({ ...before.deps, store: makeRenderStore(before.storeDeps) });
    assert.equal((await cold.submit('test')).state, 'submitted'); assert.equal(before.counts().submits, 1);
    const ambiguous = fixture({ provider: { submit: async () => { throw Error('timeout'); } } });
    await ambiguous.service.prepare(ambiguous.intent); assert.equal((await ambiguous.service.submit('test')).state, 'ambiguous_submission');
    const restarted = makeVideoRenderTransaction({ ...ambiguous.deps, store: makeRenderStore(ambiguous.storeDeps) });
    assert.equal((await restarted.submit('test')).state, 'ambiguous_submission');
    assert.equal((await restarted.reconcile('test')).state, 'ambiguous_submission');
    ambiguous.provider.lookup = async fingerprint => ({ exhaustive: true, matches: [{ id: 'remote', intentFingerprint: fingerprint }] });
    assert.equal((await restarted.reconcile('test')).state, 'succeeded');
    for (const matches of [[], [{ id: 'a' }, { id: 'b' }]]) {
      const a = fixture({ provider: { submit: async () => null, lookup: async () => ({ exhaustive: true, matches }) } });
      await a.service.prepare(a.intent); await a.service.submit('test'); assert.equal((await a.service.reconcile('test')).state, 'ambiguous_submission');
    }
    for (const state of ['failed', 'cancelled']) {
      const p = fixture({ provider: { poll: async (id, intentFingerprint) => ({ id, intentFingerprint, observedAt: 1, state }) } }); await ready(p); assert.equal(p.store.read('test').state, state);
    }
    const timeout = fixture({ maxPolls: 1, provider: { poll: async (id, intentFingerprint) => ({ id, intentFingerprint, observedAt: 1, state: 'queued' }) } }); await ready(timeout); assert.equal((await timeout.service.reconcile('test')).state, 'timed_out');
    for (const change of [r => { r.id = 'wrong'; }, r => { r.observedAt = 0; }, r => { r.intentFingerprint = 'wrong'; }, r => { r.state = 'unknown'; }]) {
      const p = fixture(); const poll = p.provider.poll; p.provider.poll = async (...args) => { const r = await poll(...args); change(r); return r; }; await ready(p); assert.equal(p.store.read('test').state, 'review_required');
    }
    const retry = fixture(); let attempts = 0; const poll = retry.provider.poll;
    retry.provider.poll = async (...args) => { attempts++; if (attempts === 1) throw Object.assign(Error('transient'), { retryable: true }); return poll(...args); };
    await ready(retry); assert.equal(attempts, 2); assert.equal(retry.counts().submits, 1);
    for (const change of [r => { r.mime = 'text/html'; }, r => { r.url += '/redirect'; }, r => { r.bytes = Buffer.alloc(0); }, r => { r.bytes = video.subarray(0, 16); }, r => { r.bytes = Buffer.alloc(100); }, r => { r.bytes = Buffer.from(video); r.bytes[20] ^= 1; }]) {
      const p = fixture(); await ready(p); const download = p.provider.download; p.provider.download = async (...args) => { const r = await download(...args); change(r); return r; };
      assert.equal((await p.service.finalize('test', ctx)).state, 'ambiguous_download'); assert.equal(p.counts().writes, 0); assert.equal(p.store.read('test').artifact, undefined);
    }
    const noReceipt = fixture({ writeVerified: async () => ({}) }); await ready(noReceipt); assert.equal((await noReceipt.service.finalize('test', ctx)).state, 'ambiguous_download');
    const recovered = fixture(); await recovered.service.prepare(recovered.intent); await recovered.service.submit('test'); fs.writeFileSync(path.join(recovered.dir, 'test.json'), ''); assert.throws(() => makeRenderStore(recovered.storeDeps).read('test'), /operator review/);
    const malformedStored = fixture(); await malformedStored.service.prepare(malformedStored.intent);
    const malformedPath = path.join(malformedStored.dir, 'test.json');
    const malformedRow = JSON.parse(fs.readFileSync(malformedPath, 'utf8')); malformedRow.intent.apiKey = 'unexpected';
    fs.writeFileSync(malformedPath, JSON.stringify(malformedRow));
    assert.throws(() => makeRenderStore(malformedStored.storeDeps).read('test'), /Invalid render transaction/);
    assert.throws(() => makeShotstackStage({ endpoint: ENDPOINT.replace('stage', 'v1') }), /denied/);
    let requests = 0;
    const adapter = makeShotstackStage({ fetch: async () => { requests++; throw Error('synthetic only'); }, apiKey: 'fixture', clock: () => 1 });
    await assert.rejects(adapter.download({ url: 'https://example.test/a', allowlist: [] }, 100)); assert.equal(requests, 0);
    assert.equal(adapter.lookup, undefined);
    const stageUrl = 'https://shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com/owner/remote.mp4';
    const transportCalls = [];
    const stage = makeShotstackStage({ apiKey: 'fixture', clock: () => 1, fetch: async (url, init) => {
      transportCalls.push({ url, init });
      if (url === ENDPOINT + '/render') return { ok: true, json: async () => ({ success: true, response: { id: 'remote' } }) };
      if (url === ENDPOINT + '/render/remote') return { ok: true, json: async () => ({ success: true, response: { id: 'remote', status: 'done', url: stageUrl } }) };
      assert.equal(url, stageUrl); assert.equal(init.headers, undefined);
      return { ok: true, url, headers: { get: key => key === 'content-type' ? 'video/mp4' : String(video.length) }, body: (async function* () { yield video; })() };
    } });
    const stageFixture = fixture({ provider: stage }); await ready(stageFixture);
    assert.equal((await stageFixture.service.finalize('test', ctx)).state, 'verified');
    assert.equal(transportCalls.filter(c => c.init.method === 'POST').length, 1);
    assert.equal(transportCalls.length, 3);
    assert.ok(transportCalls.every(c => c.init.redirect === 'error'));
    for (const changedUrl of [stageUrl.replace('stage-output', 'v1-output'), stageUrl.replace('/remote.mp4', '/wrong.mp4'), stageUrl + '?redirect=x', 'http://127.0.0.1/a.mp4']) {
      let calls = 0; const s = makeShotstackStage({ apiKey: 'fixture', clock: () => 1, fetch: async () => { calls++; return { ok: true, json: async () => ({ success: true, response: { id: 'remote', status: 'done', url: changedUrl } }) }; } });
      await assert.rejects(s.poll('remote', 'a')); assert.equal(calls, 1);
    }
    const regFixture = fixture(); const registry = makeRegistry();
    makeVideoRenderTools({ service: () => regFixture.deps }).register(registry);
    const gateCtx = { ...ctx, consent: async () => ({ allow: true }) };
    const dispatch = (operation, args, context = gateCtx) => registry.dispatch({ id: 'call-' + operation, name: 'channel.render.' + operation, args, argsRaw: JSON.stringify(args) }, context);
    assert.equal((await dispatch('prepare', { intent: regFixture.intent }, ctx)).ok, false);
    assert.equal((await dispatch('prepare', { intent: regFixture.intent }, { ...ctx, consent: async () => ({ allow: false }) })).ok, false);
    assert.equal(regFixture.counts().submits, 0);
    for (const op of ['prepare', 'submit', 'reconcile']) assert.equal((await dispatch(op, op === 'prepare' ? { intent: regFixture.intent } : { id: 'test' })).ok, true);
    const finished = await dispatch('finalize', { id: 'test' }); assert.equal(finished.ok, true);
    const artifacts = makeArtifactCollector(); artifacts.observe({ toolName: 'channel.render.finalize', args: { id: 'test' }, result: finished });
    assert.equal(artifacts.count(), 1);
    const emptyArtifacts = makeArtifactCollector(); emptyArtifacts.observe({ toolName: 'channel.render.finalize', result: { ok: true, content: JSON.stringify({ state: 'succeeded', output: stageUrl }) } }); assert.equal(emptyArtifacts.count(), 0);
    const concurrent = fixture(); await concurrent.service.prepare(concurrent.intent);
    await Promise.all([concurrent.service.submit('test'), concurrent.service.submit('test')]); assert.equal(concurrent.counts().submits, 1);
    const crashBoundary = fixture(); await crashBoundary.service.prepare(crashBoundary.intent);
    crashBoundary.store.save({ ...crashBoundary.store.read('test'), state: 'submitting' });
    const crashRestart = makeVideoRenderTransaction({ ...crashBoundary.deps, store: makeRenderStore(crashBoundary.storeDeps) });
    assert.equal((await crashRestart.submit('test')).state, 'ambiguous_submission'); assert.equal(crashBoundary.counts().submits, 0);
    const failedCheckpoint = fixture(); await failedCheckpoint.service.prepare(failedCheckpoint.intent);
    const save = failedCheckpoint.store.save; failedCheckpoint.store.save = row => { if (row.state === 'submitting') throw Error('disk failure'); return save(row); };
    await assert.rejects(failedCheckpoint.service.submit('test'), /disk failure/); assert.equal(failedCheckpoint.counts().submits, 0);
    for (const state of ['downloading', 'downloaded']) {
      const partial = fixture(); await ready(partial);
      partial.store.save({ ...partial.store.read('test'), state, ...(state === 'downloaded' ? { downloadedBytes: video.length, localSha256: digest(video) } : {}) });
      assert.equal((await partial.service.finalize('test', ctx)).state, 'ambiguous_download'); assert.equal(partial.counts().downloads, 0);
    }
    const expired = fixture(); await expired.service.prepare(expired.intent); expired.setNow(1001);
    assert.equal((await expired.service.submit('test')).state, 'timed_out'); assert.equal(expired.counts().submits, 0);
    assert.equal((await expired.service.prepare(expired.intent)).state, 'timed_out');
    for (const spec of [
      { contentType: 'text/plain', contentLength: String(video.length), data: video },
      { contentType: 'video/mp4', contentLength: '10000', data: video },
      { contentType: 'video/mp4', contentLength: String(video.length), data: video.subarray(0, 16) },
      { contentType: 'video/mp4', contentLength: null, data: Buffer.alloc(200) },
      { contentType: 'video/mp4', contentLength: null, data: Buffer.alloc(0) }
    ]) {
      const broken = makeShotstackStage({ apiKey: 'fixture', clock: () => 1, fetch: async () => ({ ok: true, url: stageUrl, headers: { get: k => k === 'content-type' ? spec.contentType : spec.contentLength }, body: (async function* () { yield spec.data; })() }) });
      await assert.rejects(broken.download({ url: stageUrl, allowlist: [stageUrl], renderId: 'remote' }, 100));
    }
    const writer = makeFsTools({ fsp: fs.promises, pathMod: path, root: path.join(root, 'jail') });
    await assert.rejects(writer.writeVideoArtifact('../escape.mp4', video, ctx));
    await assert.rejects(writer.writeVideoArtifact('denied.mp4', video, { agentId: 'test' }));
    const failingFs = Object.create(fs.promises); failingFs.rename = async () => { throw Error('atomic rename failed'); };
    const failingWriter = makeFsTools({ fsp: failingFs, pathMod: path, root: path.join(root, 'atomic-failure') });
    await assert.rejects(failingWriter.writeVideoArtifact('video.mp4', video, ctx));
    assert.equal(fs.existsSync(path.join(root, 'atomic-failure/test/video.mp4')), false);
    console.log('video-render-transaction: synthetic state, restart, gate, output and artifact checks passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
