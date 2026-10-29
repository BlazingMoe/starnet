/* Private evidence bundle plus the ordinary verified fs.write/read export path. */
'use strict';
const A = require('./_assert.js');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Demo = require('../sidecar/tools/builtin/channel-content.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { makeArtifactCollector } = require('../sidecar/artifacts.js');
const { CAP_REGISTRY } = require('../sidecar/capability/registry.js');
const { makeReplayProvider } = require('../sidecar/providers/replay.js');
const { makeCostEngine } = require('../sidecar/cost.js');
const { runAgentLoop } = require('../sidecar/loop.js');
const { resolveTools } = require('../sidecar/capability/resolve.js');
const { makeCapCtx } = require('../sidecar/capability/capGate.js');
const { makeEmitter } = require('../shared/emitter.js');
const events = require('../shared/events.js');


(async () => {
  const checkedAt='2026-10-29T12:00:00.000Z';
  const record={status:'verified',note:'Operator supplied fixture only',receipt:'fixture-receipt',checkedAt,sourceUrl:'https://example.test/evidence'};
  const variant=platform=>({platform,title:'Original demonstration',copy:'An editorial explanation',cta:'Discuss your interpretation',width:1920,height:1080,durationSeconds:60,captionNeeds:'required',thumbnailNeeds:'required',thumbnailPlan:'Original diagram',spec:{platform,width:1920,height:1080,minDurationSeconds:1,maxDurationSeconds:600,titleMaxLength:200,copyMaxLength:2400,captionRequired:'yes',thumbnailRequired:'yes',evidence:{...record}},policyEvidence:{...record}});
  const input={campaignId:'campaign-1',contentId:'content-1',version:'v1',asOf:checkedAt,freshnessDays:7,brief:{audience:'Beginning makers',need:'Understand the experiment',originalThesis:'Our measured comparison explains the tradeoff',editorialContribution:'Own experiment and narration',valuePromise:'Understand when each technique helps',nonGoals:'No recommendation or revenue promise'},claims:[{id:'claim-1',text:'Fixture observation',support:'supported',evidence:{...record}}],priorContent:{comparison:'Compared with our prior tutorial; new experiment and analysis',repetitionRisk:'low',evidence:{...record}},script:[{id:'section-1',text:'Explain our measurement and its limits',claimIds:['claim-1']}],shots:[{id:'shot-1',sectionId:'section-1',assetIds:['asset-1'],description:'Show own experiment',durationSeconds:120}],captions:{plan:'Human checked timed captions',language:'en',qc:'approved',evidence:{...record}},audio:{plan:'Own narration with measured levels',language:'en',qc:'approved',evidence:{...record}},assets:[{id:'asset-1',ownership:'owned',license:'Operator owns recording and narration',rights:'approved',likeness:'approved',privacy:'approved',evidence:{...record}}],ai:{usage:'assisted',description:'Drafting assistance',realistic:'no',meaningfullyAltered:'no',disclosure:'not-required',disclosureText:'Human decision based on supplied evidence',evidence:{...record}},variants:[variant('youtube-long'),variant('youtube-short')],review:Object.fromEntries(Demo.gates.map(k=>[k,{decision:'approved',evidence:{...record}}])),metrics:{status:'planned',hypothesis:'The demonstration helps viewers explain the tradeoff',metricNames:['completion rate','qualified comments'],observationWindowDays:14,successCriterion:'Operator-defined comparison against prior tutorial',measurementPlan:'Human review after separately authorized release'}};
  const fs=require('node:fs'),pack=Demo.prepare(input);
  A.eq(pack.state,'READY_FOR_PRIVATE_PRODUCTION','private production only');
  A.eq(Demo.prepare(input),pack,'deterministic');
  const before=JSON.stringify(input);Demo.prepare(input);A.eq(JSON.stringify(input),before,'input unchanged');
  A.eq(Object.keys(pack.files),['content-brief.md','script-and-shots.md','rights-and-disclosure.json','channel-variants.json','readiness-and-metrics.md'],'five fixed files');
  A.ok(pack.files['readiness-and-metrics.md'].includes('not actual analytics'),'metrics explicitly planned');
  const mutate=fn=>{const x=JSON.parse(JSON.stringify(input));fn(x);return x;};
  for(const fn of [x=>x.extra=true,x=>delete x.brief,x=>x.campaignId='../bad',x=>x.contentId='unknown',x=>x.version='unknown/version',x=>x.brief.audience='<script>',x=>x.brief.need='bad\n#inject',x=>x.brief.need='a'.repeat(801),x=>x.freshnessDays=91,x=>x.freshnessDays=0,x=>x.freshnessDays=1.5,x=>x.claims=Array(31).fill(x.claims[0]),x=>x.claims.push(x.claims[0]),x=>x.assets.push(x.assets[0]),x=>x.script.push(x.script[0]),x=>x.shots.push(x.shots[0]),x=>x.variants.push(x.variants[0]),x=>x.script[0].claimIds=['missing'],x=>x.script[0].claimIds=['claim-1','claim-1'],x=>x.shots[0].sectionId='missing',x=>x.shots[0].assetIds=['missing'],x=>x.variants[0].width=0,x=>x.variants[0].height=30001,x=>x.priorContent.evidence.sourceUrl='javascript:alert(1)',x=>x.priorContent.evidence.sourceUrl='https://u:p@example.test',x=>x.priorContent.evidence.checkedAt='2026-02-30T12:00:00.000Z',x=>x.priorContent.evidence.checkedAt='2026-11-01T12:00:00.000Z',x=>x.asOf='2026-10-29',x=>x.metrics.status='actual',x=>x.metrics.actualViews=12,x=>x.metrics.metricNames.push('completion rate'),x=>x.metrics.observationWindowDays=0,x=>x.variants[0].spec.minDurationSeconds=601,x=>x.review.rights.extra=true])A.throws(()=>Demo.prepare(mutate(fn)),'strict schema/IDs/URL/time/bounds');
  for(const fn of [x=>x.brief.originalThesis='unknown',x=>x.brief.editorialContribution='unknown',x=>x.priorContent.repetitionRisk='high',x=>x.priorContent.repetitionRisk='unknown',x=>x.priorContent.comparison='unknown',x=>x.priorContent.evidence.status='assumption',x=>x.priorContent.evidence.receipt='UNKNOWN',x=>x.priorContent.evidence.checkedAt='2026-10-01T12:00:00.000Z',x=>x.claims[0].support='unsupported',x=>x.claims[0].evidence.status='unknown',x=>x.assets[0].ownership='unknown',x=>x.assets[0].license='unknown',x=>x.assets[0].rights='unknown',x=>x.assets[0].likeness='rejected',x=>x.assets[0].privacy='unknown',x=>x.ai.usage='unknown',x=>x.ai.realistic='unknown',x=>x.ai.meaningfullyAltered='unknown',x=>x.ai.realistic='yes',x=>x.ai.meaningfullyAltered='yes',x=>x.ai.disclosure='unknown',x=>x.ai.disclosureText='unknown',x=>x.ai.evidence.status='unknown',x=>x.captions.qc='unknown',x=>x.audio.qc='rejected',x=>x.captions.plan='unknown',x=>x.audio.language='unknown',x=>x.variants[0].spec.platform='tiktok',x=>x.variants[0].width=1080,x=>x.variants[0].durationSeconds=601,x=>x.variants[0].durationSeconds=121,x=>x.variants[0].spec.titleMaxLength=1,x=>x.variants[0].spec.copyMaxLength=1,x=>x.variants[0].captionNeeds='unknown',x=>x.variants[0].spec.captionRequired='unknown',x=>x.variants[0].thumbnailNeeds='not-required',x=>x.variants[0].policyEvidence.status='unknown',x=>x.variants[0].spec.evidence.checkedAt='2026-10-01T12:00:00.000Z',x=>x.variants[1].platform='tiktok',x=>x.metrics.hypothesis='unknown',x=>x.script.push({...x.script[0],id:'section-2'})])A.eq(Demo.prepare(mutate(fn)).state,'NOT_READY','uncertainty/conflict blocks');
  for(const k of Demo.gates){A.eq(Demo.prepare(mutate(x=>x.review[k].decision='unknown')).state,'NOT_READY',k+' approval blocks');A.eq(Demo.prepare(mutate(x=>x.review[k].evidence.status='unknown')).state,'NOT_READY',k+' evidence blocks');}
  A.eq(Demo.prepare(mutate(x=>{x.ai.usage='generated';x.ai.realistic='yes';x.ai.disclosure='required';})).state,'READY_FOR_PRIVATE_PRODUCTION','classified realistic AI requires supported disclosure');
  A.eq(Demo.prepare(mutate(x=>{x.ai.usage='none';x.ai.realistic='yes';})).state,'NOT_READY','contradictory classification blocks');
  A.eq(Demo.prepare(mutate(x=>x.variants.push(variant('instagram-reel')))).state,'READY_FOR_PRIVATE_PRODUCTION','optional supplied platform supported');
  A.eq(JSON.parse(Demo.prepare(mutate(x=>x.ai.realistic='unknown')).files['rights-and-disclosure.json']).needsDisclosure,null,'unknown disclosure requirement never false');
  const inert=Demo.prepare(mutate(x=>x.brief.need='[click](https://evil.test)'));A.ok(!inert.files['content-brief.md'].includes('](https://evil.test)'),'markdown inert');
  const source=fs.readFileSync(require.resolve('../sidecar/tools/builtin/channel-content.js'),'utf8');A.ok(!/require\(|fetch\(|process\.|Date\.now/.test(source),'no I/O or ambient clock');
  const OriginalDate=global.Date;try{global.Date=class extends OriginalDate{constructor(v){if(arguments.length!==1)throw Error('ambient');super(v);}static now(){throw Error('ambient');}};A.eq(Demo.prepare(input),pack,'no ambient time');}finally{global.Date=OriginalDate;}
  for(const file of ['../frontend/app/toolprops.js','../website/app/app/toolprops.js'])A.eq(require(file).toolPropType('channel.content.prepare'),'cabinet','tool visibility');
  A.ok(fs.readFileSync(require.resolve('../sidecar/index.js'),'utf8').includes('makeChannelContentTools().register(registry)'),'production registration');
  const recipe=require('../frontend/app/recipe-catalog/business.js').find(r=>r.id==='channel-private-production');A.ok(recipe&&['channel.content.prepare','fs.write','fs.read','read-back-verified','compare exact','No shell','denied','five independent','remote-ID reconciliation'].every(s=>recipe.task.includes(s)),'verified export recipe');
  A.eq(require('../website/app/app/recipe-catalog/business.js').find(r=>r.id===recipe.id),recipe,'recipe mirror');
  const drift=require('../sidecar/recipe-drift.js');const trace=['channel_content_prepare','fs_write','fs_read'].map(name=>({name,callId:name}));const run=(extra=[])=>({runId:'channel-run',recipeId:recipe.id,reason:'done',model:'m',usd:0,toolTrace:trace.concat(extra),completionEvidence:{completionVerdict:'not_assessed',checks:[]}});
  for(const name of ['web_search','render','channel_send','upload','publish','schedule','analytics_provider'])A.ok(drift.assessDrift([run([{name,callId:'external'}]),run(),run()]).signals.some(s=>s.code==='tool_new'&&s.tool===name),'external tool signals drift');
  for(const tool of trace)A.ok(drift.assessDrift([{...run(),toolTrace:trace.filter(t=>t!==tool)},run(),run()]).signals.some(s=>s.code==='tool_dropped'&&s.tool===tool.name),'required tool drop signals drift');
  const fixture = SidecarFixture.create({ prefix: 'starnet-channel-content-', timeoutMs: 20000 });
  try {
    const registry = makeRegistry();
    Demo.makeChannelContentTools().register(registry);
    const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
    const fsTools = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: fixture.workspace });
    fsTools.register(registry);
    A.ok(CAP_REGISTRY.cabinet.some(grant => grant.tool === 'channel.content.prepare' && grant.scope === 'read' && !grant.requiresConsent && grant.network === false), 'tool is narrowly mapped to cabinet/read');
    const agentId = 'demo-test', receipts = [], artifacts = makeArtifactCollector();
    const generated = Demo.prepare(input), bundle = generated;
    const calls = [];
    function toolTurn(entries, turn) {
      const frame = [];
      for (let i = 0; i < entries.length; i++) {
        const [name, args] = entries[i], wireName = name.replace(/\./g, '_');
        frame.push({ type: 'tool_start', index: i, id: `${turn}-${i}`, name: wireName });
        frame.push({ type: 'tool_args', index: i, chunk: JSON.stringify(args) });
      }
      frame.push({ type: 'usage', usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 } }, { type: 'done', finishReason: 'tool_calls' });
      return frame;
    }
    const reportTurn = [{ type: 'text', delta: 'Five files exported and read back.' }, { type: 'usage', usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }, { type: 'done', finishReason: 'stop' }];
    const writes = Object.entries(bundle.files).map(([name, content]) => ['fs.write', { path: 'business/channel-review/' + name, content }]);
    const reads = Object.keys(bundle.files).map(name => ['fs.read', { path: 'business/channel-review/' + name }]);
    const turns = [
      toolTurn([['channel.content.prepare', input]], 'generate'),
      toolTurn(writes, 'write'),
      toolTurn(reads, 'read'),
      reportTurn
    ];
    const bus = A.makeBus(); A.collectBus(bus, events.names());
    const emit = makeEmitter(bus, () => {});
    const station = { agents: { [agentId]: { id: agentId, room: 'office' } }, rooms: { office: { id: 'office', objects: [
      { instanceId: 'demo-computer', objectType: 'computer' }, { instanceId: 'demo-cabinet', objectType: 'cabinet' }
    ] } } };
    const resolved = resolveTools(agentId, station);
    const withoutCabinet = { agents: station.agents, rooms: { office: { id: 'office', objects: [{ instanceId: 'computer-only', objectType: 'computer' }] } } };
    A.ok(!resolveTools(agentId, withoutCabinet).tools.includes('channel.content.prepare'), 'no cabinet means no handoff capability');
    const capCtx = makeCapCtx(resolved, { consent: async () => ({ allow: true }) });
    const toolDefs = registry.wireFormat(registry.list(new Set(resolved.tools)));
    const fromWire = new Map();
    for (const def of toolDefs) { const real = def.function.name, wire = real.replace(/\./g, '_'); fromWire.set(wire, real); def.function.name = wire; }
    const dispatch = async (call, ctx) => {
      if (fromWire.has(call.name)) call = Object.assign({}, call, { name: fromWire.get(call.name) });
      const result = await registry.dispatch(call, ctx);
      calls.push({ name: call.name, args: call.args, result });
      artifacts.observe({ toolName: call.name, args: call.args, result });
      return result;
    };
    const provider = makeReplayProvider({ turns });
    const run = await runAgentLoop({ messages: [{ role: 'user', content: 'Prepare and export private channel production preflight.' }], provider, emit, cost: makeCostEngine({ priceOf: provider.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId, runId: 'channel-content-export', limits: { maxIters: 8, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.eq(run.reason, 'done', 'fake provider completes the registered run path');
    A.ok(calls.find(c => c.name === 'channel.content.prepare' && c.result.ok), 'pure generator is called from the harness tool path');
    const deniedProvider = makeReplayProvider({ turns: [toolTurn([['fs.write', { path: 'business/channel-review/replay-denied.txt', content: 'no' }]], 'deny'), reportTurn] });
    await runAgentLoop({ messages: [{ role: 'user', content: 'Attempt denied export' }], provider: deniedProvider, emit, cost: makeCostEngine({ priceOf: deniedProvider.priceOf }), tools: toolDefs, dispatch, capCtx: { ...capCtx, consent: async () => ({ allow: false, reason: 'denied replay' }) }, model: 'replay/model', agentId, runId: 'denied-audit', limits: { maxIters: 4, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.ok(calls.some(c => c.args.path === 'business/channel-review/replay-denied.txt' && c.result.isError), 'actual replay denies write');
    A.ok(!require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'business/channel-review/replay-denied.txt')), 'replay denied write creates no file');
    const denied = await registry.dispatch({ id: 'denied-write', name: 'fs.write', args: { path: 'business/channel-review/denied.txt', content: 'no' } }, { ...capCtx, consent: async () => ({ allow: false, reason: 'test denial' }) });
    A.eq(denied.isError, true, 'write denial is enforced by ordinary registry consent gate');
    A.eq(require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'business/channel-review/denied.txt')), false, 'denied write creates no file');
    for (const [name, content] of Object.entries(bundle.files)) {
      const rel = 'business/channel-review/' + name;
      const write = calls.find(c => c.name === 'fs.write' && c.args.path === rel).result;
      A.eq(write.receipt.state, 'read-back-verified', rel + ' uses the real byte-verified writer');
      receipts.push(write.receipt);
      const read = calls.find(c => c.name === 'fs.read' && c.args.path === rel).result;
      A.ok(read.ok && read.content === content, rel + ' matches generated content after ordinary fs.read readback');
    }
    A.ok(calls.every(c => ['channel.content.prepare','fs.write','fs.read'].includes(c.name)), 'no external tools called');
    A.eq(receipts.length, 5, 'all bundle files receive independent verified writer receipts');
    A.eq(artifacts.list().map(a => a.path).sort(), Object.keys(bundle.files).map(name => 'business/channel-review/' + name).sort(), 'normal writer results populate the existing artifact collector');
  } finally { await fixture.dispose(); }
  A.report('channel-content.test');
})().catch(error => { console.error(error); process.exit(1); });
// End of the focused channel production preflight acceptance fixture.
