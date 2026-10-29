/* Private evidence bundle plus the ordinary verified fs.write/read export path. */
'use strict';
const A = require('./_assert.js');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Demo = require('../sidecar/tools/builtin/fiverr-handoff.js');
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
  const checkedAt = '2026-10-29T12:00:00.000Z';
  const record = { status: 'verified', note: 'Operator supplied fixture evidence', receipt: 'fixture-receipt', checkedAt, sourceUrl: 'https://www.fiverr.com/legal-portal/legal-terms/terms-of-service' };
  const input={serviceId:'image-service',version:'v1',asOf:checkedAt,freshnessDays:7,title:'Custom product image',scope:'One custom image',exclusions:'No trademark changes',revisionCap:2,revisionsUsed:0,dueAt:'2026-11-02T12:00:00.000Z',buyerAiPreference:'allowed',aiUse:'assisted',humanRefinementPlan:'Paint and retouch edges by hand',customizationPlan:'Match supplied product geometry and customer palette',assets:[{id:'source-1',license:'Customer authorized commercial derivative use',permission:'approved',likeness:'approved',privacy:'approved',evidence:{...record}}],deliverables:[{id:'image-1',width:1024,height:1024,format:'png',text:'No text',alpha:'required',productFidelity:'approved',license:'approved'}],order:{id:'order-1',priorDelivery:'none',retry:'no',reconciliation:'confirmed-no-delivery',evidence:{...record}},finals:[{deliverableId:'image-1',version:'v1',fileName:'image-1.png',bytes:1024,sha256:'a'.repeat(64),width:1024,height:1024,format:'png',text:'approved',alpha:'present',productFidelity:'approved',license:'approved',approval:'approved',proof:{...record}}],deliveryState:'not-sent',supportState:'plan-ready',review:Object.fromEntries(Demo.gates.map(k=>[k,{decision:'approved',evidence:{...record}}])),policySnapshot:{...record},feeSnapshot:{...record},economics:{currency:'EUR',feeCurrency:'EUR',costCurrency:'EUR',grossMinor:'10000',costsMinor:{fee:'2000',generation:'100',labor:'1000',other:'100',refund:'200',tax:'500'},minutes:60,evidence:{...record}}};
  const fs=require('node:fs');const pack=Demo.prepare(input);
  A.eq(pack.state,'READY_FOR_HUMAN_HANDOFF','only human handoff readiness');
  A.eq(pack.economics.payoutMinor,'8000','operator supplied 20 percent fee leaves 80 percent before costs');
  A.eq(pack.economics.contributionMinor,'6100','payout differs from contribution');
  A.eq(pack.economics.hourlyContributionMinor,'6100','exact hourly assumption');
  A.eq(Demo.prepare(input),pack,'deterministic');
  const inputBefore=JSON.stringify(input);Demo.prepare(input);A.eq(JSON.stringify(input),inputBefore,'input not mutated');
  A.eq(Object.keys(pack.files),['gig-draft.md','client-intake.json','order-workspace.json','delivery-manifest.md','economics-and-review.json'],'five stable files');
  const mutate=fn=>{const x=JSON.parse(JSON.stringify(input));fn(x);return x;};
  for(const fn of [x=>x.extra=true,x=>x.assets=Array(21).fill(x.assets[0]),x=>x.revisionCap=21,x=>x.revisionsUsed=1.5,x=>delete x.order,x=>x.version='../bad',x=>x.title='<script>',x=>x.title='bad\n#inject',x=>x.title='a'.repeat(141),x=>x.freshnessDays=91,x=>x.assets.push(x.assets[0]),x=>x.finals.push(x.finals[0]),x=>x.deliverables.push(x.deliverables[0]),x=>x.finals[0].fileName='../image.png',x=>x.finals[0].bytes=0,x=>x.finals[0].sha256='bad',x=>x.finals[0].deliverableId='other',x=>x.policySnapshot.sourceUrl='javascript:alert(1)',x=>x.policySnapshot.sourceUrl='https://u:p@example.test',x=>x.policySnapshot.checkedAt='2026-02-30T12:00:00.000Z',x=>x.policySnapshot.checkedAt='2026-11-01T12:00:00.000Z',x=>x.asOf='2026-10-29',x=>x.economics.grossMinor='01',x=>x.economics.grossMinor='1.5',x=>x.economics.grossMinor=null,x=>x.economics.grossMinor='1000000000000000000',x=>x.economics.feeCurrency='USD',x=>x.economics.costCurrency='USD',x=>x.deliverables[0].width=0,x=>x.deliverables[0].width=30001,x=>x.review.rights.extra=true])A.throws(()=>Demo.prepare(mutate(fn)),'strict schema and semantic validation');
  for(const fn of [x=>x.buyerAiPreference='prohibited',x=>x.buyerAiPreference='unknown',x=>x.aiUse='unknown',x=>x.humanRefinementPlan='unknown',x=>x.customizationPlan='unknown',x=>x.assets[0].permission='unknown',x=>x.assets[0].likeness='unknown',x=>x.assets[0].privacy='unknown',x=>x.assets[0].license='unknown',x=>x.deliverables[0].alpha='unknown',x=>x.deliverables[0].license='unknown',x=>x.deliverables[0].text='unknown',x=>x.deliverables[0].productFidelity='unknown',x=>x.finals[0].width=100,x=>x.finals[0].height=100,x=>x.finals[0].alpha='absent',x=>x.finals[0].text='unknown',x=>x.finals[0].license='unknown',x=>x.finals[0].productFidelity='unknown',x=>x.finals[0].approval='unknown',x=>x.finals[0].proof.status='unknown',x=>x.revisionsUsed=3,x=>x.dueAt='2026-10-28T12:00:00.000Z',x=>x.order.priorDelivery='delivered',x=>x.order.priorDelivery='ambiguous',x=>x.order.retry='unknown',x=>x.order.reconciliation='unresolved',x=>x.deliveryState='ambiguous',x=>x.supportState='unknown',x=>x.policySnapshot.status='assumption',x=>x.feeSnapshot.checkedAt='2026-10-01T12:00:00.000Z',x=>x.economics.costsMinor.refund='unknown',x=>x.economics.minutes=0,x=>x.economics.grossMinor='0'])A.eq(Demo.prepare(mutate(fn)).state,'NOT_READY','uncertainty or conflict blocks');
  for(const k of Demo.gates)A.eq(Demo.prepare(mutate(x=>x.review[k].decision='unknown')).state,'NOT_READY',k+' blocks');
  A.eq(Demo.prepare(mutate(x=>{x.aiUse='none';x.buyerAiPreference='prohibited';})).state,'READY_FOR_HUMAN_HANDOFF','explicit non-AI work supported');
  A.eq(Demo.prepare(mutate(x=>x.order.retry='requested')).state,'READY_FOR_HUMAN_HANDOFF','retry requires confirmed no prior delivery evidence');
  A.eq(Demo.prepare(mutate(x=>{x.order.retry='requested';x.order.priorDelivery='ambiguous';})).state,'NOT_READY','ambiguous retry frozen');
  A.eq(Demo.prepare(mutate(x=>x.deliverables.push({...x.deliverables[0],id:'image-2'}))).state,'NOT_READY','partial finals block');
  A.eq(Demo.prepare(mutate(x=>x.economics.costsMinor.fee='1000')).economics.payoutMinor,'9000','fee never hardcoded');
  A.eq(Demo.prepare(mutate(x=>x.economics.costsMinor.fee='unknown')).economics.payoutMinor,null,'unknown never zero');
  A.eq(Demo.prepare(mutate(x=>x.economics.grossMinor='999999999999999999')).economics.contributionMinor,'999999999999996099','BigInt exact above safe number');
  const inert=Demo.prepare(mutate(x=>x.title='[click](https://evil.test)'));A.ok(!inert.files['gig-draft.md'].includes('](https://evil.test)'),'markdown inert');
  const source=fs.readFileSync(require.resolve('../sidecar/tools/builtin/fiverr-handoff.js'),'utf8');A.ok(!/require\(|fetch\(|process\.|Date\.now/.test(source),'no I/O or current clock');
  const OriginalDate=global.Date;try { global.Date=class extends OriginalDate { constructor(v){if(arguments.length!==1)throw Error('ambient');super(v);} static now(){throw Error('ambient');} };A.eq(Demo.prepare(input),pack,'no ambient time'); } finally {global.Date=OriginalDate;}
  for(const file of ['../frontend/app/toolprops.js','../website/app/app/toolprops.js']) A.eq(require(file).toolPropType('fiverr.handoff.prepare'),'cabinet','tool visibility');
  A.ok(fs.readFileSync(require.resolve('../sidecar/index.js'),'utf8').includes('makeFiverrHandoffTools().register(registry)'),'production registration');
  const recipe=require('../frontend/app/recipe-catalog/business.js').find(r=>r.id==='fiverr-manual-handoff');A.ok(recipe&&['fiverr.handoff.prepare','fs.write','fs.read','read-back-verified','compare exact','No shell','denied'].every(s=>recipe.task.includes(s)),'verified private export recipe');
  A.eq(require('../website/app/app/recipe-catalog/business.js').find(r=>r.id===recipe.id),recipe,'recipe mirrored');
  const drift=require('../sidecar/recipe-drift.js');const trace=['fiverr_handoff_prepare','fs_write','fs_read'].map(name=>({name,callId:name}));const run=(extra=[])=>({runId:'pod-run',recipeId:recipe.id,reason:'done',model:'m',usd:0,toolTrace:trace.concat(extra),completionEvidence:{completionVerdict:'not_assessed',checks:[]}});
  for(const name of ['web_search','fiverr_deliver']) A.ok(drift.assessDrift([run([{name,callId:'external'}]),run(),run()]).signals.some(s=>s.code==='tool_new'&&s.tool===name),'unexpected external tool signals drift');
  const fixture = SidecarFixture.create({ prefix: 'starnet-fiverr-handoff-', timeoutMs: 20000 });
  try {
    const registry = makeRegistry();
    Demo.makeFiverrHandoffTools().register(registry);
    const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
    const fsTools = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: fixture.workspace });
    fsTools.register(registry);
    A.ok(CAP_REGISTRY.cabinet.some(grant => grant.tool === 'fiverr.handoff.prepare' && grant.scope === 'read' && !grant.requiresConsent && grant.network === false), 'tool is narrowly mapped to cabinet/read');
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
    const writes = Object.entries(bundle.files).map(([name, content]) => ['fs.write', { path: 'business/pod-review/' + name, content }]);
    const reads = Object.keys(bundle.files).map(name => ['fs.read', { path: 'business/pod-review/' + name }]);
    const turns = [
      toolTurn([['fiverr.handoff.prepare', input]], 'generate'),
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
    A.ok(!resolveTools(agentId, withoutCabinet).tools.includes('fiverr.handoff.prepare'), 'no cabinet means no handoff capability');
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
    const run = await runAgentLoop({ messages: [{ role: 'user', content: 'Prepare and export private Fiverr manual handoff preflight.' }], provider, emit, cost: makeCostEngine({ priceOf: provider.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId, runId: 'fiverr-handoff-export', limits: { maxIters: 8, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.eq(run.reason, 'done', 'fake provider completes the registered run path');
    A.ok(calls.find(c => c.name === 'fiverr.handoff.prepare' && c.result.ok), 'pure generator is called from the harness tool path');
    const deniedProvider = makeReplayProvider({ turns: [toolTurn([['fs.write', { path: 'business/pod-review/replay-denied.txt', content: 'no' }]], 'deny'), reportTurn] });
    await runAgentLoop({ messages: [{ role: 'user', content: 'Attempt denied export' }], provider: deniedProvider, emit, cost: makeCostEngine({ priceOf: deniedProvider.priceOf }), tools: toolDefs, dispatch, capCtx: { ...capCtx, consent: async () => ({ allow: false, reason: 'denied replay' }) }, model: 'replay/model', agentId, runId: 'denied-audit', limits: { maxIters: 4, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.ok(calls.some(c => c.args.path === 'business/pod-review/replay-denied.txt' && c.result.isError), 'actual replay denies write');
    A.ok(!require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'business/pod-review/replay-denied.txt')), 'replay denied write creates no file');
    const denied = await registry.dispatch({ id: 'denied-write', name: 'fs.write', args: { path: 'business/pod-review/denied.txt', content: 'no' } }, { ...capCtx, consent: async () => ({ allow: false, reason: 'test denial' }) });
    A.eq(denied.isError, true, 'write denial is enforced by ordinary registry consent gate');
    A.eq(require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'business/pod-review/denied.txt')), false, 'denied write creates no file');
    for (const [name, content] of Object.entries(bundle.files)) {
      const rel = 'business/pod-review/' + name;
      const write = calls.find(c => c.name === 'fs.write' && c.args.path === rel).result;
      A.eq(write.receipt.state, 'read-back-verified', rel + ' uses the real byte-verified writer');
      receipts.push(write.receipt);
      const read = calls.find(c => c.name === 'fs.read' && c.args.path === rel).result;
      A.ok(read.ok && read.content === content, rel + ' matches generated content after ordinary fs.read readback');
    }
    A.ok(calls.every(c => ['fiverr.handoff.prepare','fs.write','fs.read'].includes(c.name)), 'no external tools called');
    A.eq(receipts.length, 5, 'all bundle files receive independent verified writer receipts');
    A.eq(artifacts.list().map(a => a.path).sort(), Object.keys(bundle.files).map(name => 'business/pod-review/' + name).sort(), 'normal writer results populate the existing artifact collector');
  } finally { await fixture.dispose(); }
  A.report('fiverr-handoff.test');
})().catch(error => { console.error(error); process.exit(1); });
// End of the focused Fiverr manual handoff preflight acceptance fixture.
