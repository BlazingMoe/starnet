'use strict';
// Operator-guided runbook contract and registered fake-provider path, not autonomous recipe execution.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { makeRegistry } = require('../sidecar/tools/registry');
const { makeChannelContentTools } = require('../sidecar/tools/builtin/channel-content');
const { makeVideoRenderTools } = require('../sidecar/tools/builtin/video-render');
const { makeYoutubeUploadTools } = require('../sidecar/tools/builtin/youtube-upload');
const { makeRenderStore, digest } = require('../sidecar/video-render-transaction');
const { makeUploadStore } = require('../sidecar/youtube-upload-transaction');
const { makeFsTools } = require('../sidecar/tools/builtin/fs');
const input = require('./helpers/channel-production-input');
const recipes = require('../frontend/app/recipes');
const recipe = recipes.builtins().find(r => r.id === 'channel-private-production-run');
assert.ok(recipe);
assert.deepEqual(recipe.gear, ['cabinet']);
assert.ok(recipes.fillTask(recipe, { handoff: 'fixture handoff', workspace: 'fixture' }).includes('fixture handoff'));
assert.deepEqual(require('../frontend/app/recipe-catalog/business'), require('../website/app/app/recipe-catalog/business'));
for (const term of ['youtube-production-pack', 'channel.content.prepare', 'channel.render.prepare', 'channel.render.submit', 'channel.render.reconcile', 'channel.render.finalize', 'channel.youtube.prepare', 'channel.youtube.initiate', 'channel.youtube.status', 'channel.youtube.upload', 'channel.youtube.verify', 'operator-guided resumable runbook', 'VERIFIED_PRIVATE', 'AMBIGUOUS_INITIATION', 'downloadedBytes', 'localSha256', 'selfDeclaredMadeForKids', 'containsSyntheticMedia']) assert.ok(recipe.task.includes(term), term);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-production-run-'));
const video = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32000000086d6f6f76000000096d64617400', 'hex');
const account = { issuer: 'https://accounts.google.com', subject: '1234', email: 'fixture@example.test' };
const channelId = 'UC' + 'a'.repeat(22), videoId = 'abc123def45';
let sequence = 0;
function fixture(options = {}) {
  const dir = path.join(root, String(++sequence)); fs.mkdirSync(dir);
  const renderStoreDeps = { fs, path, fileFor: id => path.join(dir, 'r-' + id + '.json') };
  const uploadStoreDeps = { fs, path, fileFor: id => path.join(dir, 'u-' + id + '.json') };
  const writer = makeFsTools({ fsp: fs.promises, pathMod: path, root: path.join(dir, 'files') });
  const calls = [];
  const render = { id: 'render', environment: 'stage', deadline: 1000, path: 'render.mp4', gates: { rights: true, disclosure: true, quality: true }, costMicros: 0, budgetMicros: 0, edit: { timeline: {}, output: { format: 'mp4' } } };
  const upload = { id: 'upload', renderId: render.id, path: render.path, bytes: video.length, sha256: digest(video), account, channelId, title: 'Fixture', description: '', categoryId: '22', privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true, gates: { rights: true, editorial: true, quality: true, humanReview: true, disclosure: true }, deadline: 1000, costMicros: 0, budgetMicros: 0 };
  const output = { url: 'https://media.example.test/render.mp4', allowlist: ['https://media.example.test/render.mp4'], bytes: video.length, sha256: digest(video) };
  const renderProvider = { environment: 'stage', submit: async (_, intentFingerprint) => { calls.push('render POST'); if (options.ambiguousRender) throw Error('lost'); return { id: 'remote', intentFingerprint }; }, poll: async (id, intentFingerprint) => ({ id, intentFingerprint, observedAt: 1, state: 'succeeded', output }), download: async () => ({ url: output.url, mime: 'video/mp4', bytes: video }) };
  const uploadProvider = { identity: async () => ({ account, channelId }), initiate: async () => { calls.push('upload POST'); if (options.ambiguousInitiation) throw Error('lost'); return { location: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=fixture&part=snippet,status&notifySubscribers=false' }; }, upload: async () => { calls.push('PUT'); if (options.ambiguousTransfer) throw Error('lost final'); return { status: 200, videoId }; }, status: async () => { calls.push('STATUS'); return { status: 200, videoId }; }, verify: async id => ({ id, channelId, privacyStatus: options.wrongPrivacy ? 'public' : 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true }) };
  const ctx = { agentId: 'test', consent: async () => ({ allow: true }), authorize: async () => ({ ok: true }) };
  function registry() {
    const reg = makeRegistry(); makeChannelContentTools().register(reg); writer.register(reg);
    makeVideoRenderTools({ service: () => ({ store: makeRenderStore(renderStoreDeps), provider: renderProvider, clock: () => 1, writeVerified: (p,b,c) => writer.writeVideoArtifact(p,b,c) }) }).register(reg);
    makeYoutubeUploadTools({ service: () => ({ store: makeUploadStore(uploadStoreDeps), provider: uploadProvider, clock: () => 1, renderReceipt: async id => { const receipt = makeRenderStore(renderStoreDeps).read(id); return options.badReceipt && receipt ? { ...receipt, localSha256: '0'.repeat(64) } : receipt; }, readVerified: i => writer.readVideoArtifact(i, ctx) }) }).register(reg);
    return reg;
  }
  let reg = registry();
  const raw = (name,args,context=ctx) => reg.dispatch({ id: name, name, args, argsRaw: JSON.stringify(args) }, context);
  const call = async (name,args) => { const result = await raw(name,args); assert.equal(result.ok,true,result.content); return JSON.parse(result.content); };
  return { render, upload, calls, ctx, raw, call, cold: () => { reg = registry(); }, store: () => makeUploadStore(uploadStoreDeps) };
}
async function plan(f) {
  const pack = await f.call('channel.content.prepare',input()); assert.equal(pack.state,'READY_FOR_PRIVATE_PRODUCTION');
  for (const [name,content] of Object.entries(pack.files)) {
    const rel = 'production/' + name;
    const saved = await f.raw('fs.write',{ path: rel, content }); assert.equal(saved.ok,true,saved.content); assert.equal(saved.mutationReceipt.state,'read-back-verified');
    const read = await f.raw('fs.read',{ path:rel }); assert.equal(read.ok,true); assert.equal(read.content,content);
  }
}
async function render(f) { for (const op of ['prepare','submit','reconcile','finalize']) { const r = await f.call('channel.render.'+op,op==='prepare'?{intent:f.render}:{id:'render'}); if(op==='finalize') assert.equal(r.state,'verified'); } }
async function prepareUpload(f) { return f.call('channel.youtube.prepare',{intent:f.upload}); }
(async()=>{
 try {
  const f=fixture(); await plan(f); await render(f); await prepareUpload(f); await f.call('channel.youtube.initiate',{id:'upload'}); await f.call('channel.youtube.upload',{id:'upload'}); const done=await f.call('channel.youtube.verify',{id:'upload'}); assert.equal(done.state,'VERIFIED_PRIVATE'); assert.equal(done.videoId,videoId); assert.equal(done.remoteReceipt.privacyStatus,'private'); assert.deepEqual(f.calls,['render POST','upload POST','PUT']);
  for(const context of [{consent:async()=>({allow:false})},{canUse:()=>false}]) { const p=fixture(); const r=await p.raw('channel.render.prepare',{intent:p.render},{...p.ctx,...context}); assert.equal(r.ok,false); assert.deepEqual(p.calls,[]); await render(p); const u=await p.raw('channel.youtube.prepare',{intent:p.upload},{...p.ctx,...context}); assert.equal(u.ok,false); assert.deepEqual(p.calls,['render POST']); }
  const budget=fixture(); budget.render.costMicros=1; assert.equal((await budget.call('channel.render.prepare',{intent:budget.render})).state,'blocked'); assert.deepEqual(budget.calls,[]);
  const uploadBudget=fixture(); await render(uploadBudget); uploadBudget.upload.costMicros=1; assert.equal((await uploadBudget.raw('channel.youtube.prepare',{intent:uploadBudget.upload})).ok,false); assert.deepEqual(uploadBudget.calls,['render POST']);
  for(const patch of [{renderId:'other'}, {path:'other.mp4'}, {bytes:video.length+1}, {sha256:'0'.repeat(64)}]) { const p=fixture(); await render(p); Object.assign(p.upload,patch); assert.equal((await p.raw('channel.youtube.prepare',{intent:p.upload})).ok,false); assert.deepEqual(p.calls,['render POST']); }
  const mismatch=fixture({badReceipt:true}); await render(mismatch); assert.equal((await mismatch.raw('channel.youtube.prepare',{intent:mismatch.upload})).ok,false);
  const a=fixture({ambiguousRender:true}); await a.call('channel.render.prepare',{intent:a.render}); await a.call('channel.render.submit',{id:'render'}); a.cold(); assert.equal((await a.call('channel.render.reconcile',{id:'render'})).state,'ambiguous_submission'); assert.deepEqual(a.calls,['render POST']);
  const b=fixture({ambiguousInitiation:true}); await render(b); await prepareUpload(b); await b.call('channel.youtube.initiate',{id:'upload'}); b.cold(); assert.equal((await prepareUpload(b)).state,'AMBIGUOUS_INITIATION'); assert.deepEqual(b.calls,['render POST','upload POST']);
  const c=fixture({ambiguousTransfer:true}); await render(c); await prepareUpload(c); await c.call('channel.youtube.initiate',{id:'upload'}); assert.equal((await c.call('channel.youtube.upload',{id:'upload'})).state,'NEEDS_STATUS'); c.cold(); assert.equal((await prepareUpload(c)).state,'NEEDS_STATUS'); assert.equal((await c.call('channel.youtube.status',{id:'upload'})).state,'UPLOADED'); assert.equal((await c.call('channel.youtube.verify',{id:'upload'})).state,'VERIFIED_PRIVATE'); assert.deepEqual(c.calls,['render POST','upload POST','PUT','STATUS']);
  const d=fixture({wrongPrivacy:true}); await render(d); await prepareUpload(d); await d.call('channel.youtube.initiate',{id:'upload'}); await d.call('channel.youtube.upload',{id:'upload'}); assert.equal((await d.call('channel.youtube.verify',{id:'upload'})).state,'REVIEW_BLOCKED');
  console.log('PASS operator-guided private production runbook: registered fake-provider path, gates, receipt binding, cold resume and exact private readback (no autonomous runner or live provider)');
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
