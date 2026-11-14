/* Private evidence bundle plus the ordinary verified fs.write/read export path. */
'use strict';
const A = require('./_assert.js');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Demo = require('../sidecar/tools/builtin/etsy-pod.js');
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
  const record = { status: 'verified', note: 'Operator supplied fixture evidence', receipt: 'fixture-receipt', checkedAt, sourceUrl: 'https://www.etsy.com/legal/creativity/' };
  const input = { designId: 'design-1', version: 'v1', asOf: checkedAt, freshnessDays: 7, title: 'Original botanical shirt', description: 'Original individually curated botanical motif on cotton shirt', humanContribution: 'Seller drew leaves and individually curated composition and print colours', itemKind: 'original-pod', aiInvolvement: 'assisted', aiDisclosure: 'AI assisted initial composition, individually edited by seller', product: { type: 'shirt', variant: 'blue-M', dimensions: '50 by 70 cm', mockupDescription: 'Authorized accurate stock mockup', shippingOrigin: 'Germany' }, partner: { name: 'Selected partner', details: 'Operator selected printer and production role', disclosure: 'Printed by selected partner in Germany' }, review: Object.fromEntries(Demo.gates.map(k=>[k,{decision:'approved',evidence:{...record}}])), policySnapshot:{...record},feeSnapshot:{...record},currency:'EUR',unit:{revenueMinor:'3000',costsMinor:Object.fromEntries(Demo.costs.map(k=>[k,'100']))}, assumptions:Object.fromEntries(['economics','refund','reprint','cancellation','duplicateOrder','payoutReserve'].map(k=>[k,{...record,status:'assumption'}])),orders:[{id:'order-1',quantity:2}],cash:{initialMinor:'5000',retainedFloorMinor:'1000',outflowDate:checkedAt,payoutDate:'2026-11-02T12:00:00.000Z',payoutMinor:'5000',evidence:{...record}} };
  const fs = require('node:fs');
  const pack = Demo.prepare(input);
  A.eq(pack.state,'READY_FOR_HUMAN_REVIEW','complete supplied gates only allow human review');
  A.eq(pack.economics.unitContributionMinor,'1900','all eleven deduction categories subtracted');
  A.eq(pack.economics.scenarioContributionMinor,'3800','bounded quantity multiplied exactly');
  A.eq(pack.economics.outflowMinor,'2200','all scenario costs precede payout');
  A.eq(pack.economics.shortfallMinor,'0','cash reserve calculation');
  A.eq(Demo.prepare(input),pack,'deterministic result');
  const mutate = fn => { const x=JSON.parse(JSON.stringify(input));fn(x);return x; };
  for(const fn of [x=>x.extra=true,x=>delete x.cash,x=>x.orders.push(x.orders[0]),x=>x.orders[0].quantity=101,x=>x.orders[0].id='../bad',x=>x.version='bad id',x=>x.currency='CAD',x=>x.unit.costsMinor.tax='1.5',x=>x.unit.revenueMinor='1000000000000000000',x=>x.unit.revenueMinor='01',x=>x.title='bad\n#inject',x=>x.title='<script>',x=>x.policySnapshot.sourceUrl='javascript:alert(1)',x=>x.policySnapshot.sourceUrl='https://u:p@example.test',x=>x.policySnapshot.checkedAt='2026-02-30T12:00:00.000Z',x=>x.asOf='2026-10-29',x=>x.cash.payoutDate='2026-10-28T12:00:00.000Z',x=>x.freshnessDays=91,x=>x.review.inputRights.extra=true]) A.throws(()=>Demo.prepare(mutate(fn)),'strict runtime validation');
  for(const fn of [x=>x.unit.costsMinor.refund=null,x=>x.cash.payoutDate=null,x=>x.cash.initialMinor=null,x=>x.aiDisclosure=null,x=>x.aiInvolvement='unknown',x=>x.partner.name=null,x=>x.product.shippingOrigin=null,x=>x.itemKind='ready-made-resale',x=>x.itemKind='ai-prompt-bundle',x=>x.itemKind='ai-functional-instructions',x=>x.policySnapshot.checkedAt='2026-10-01T12:00:00.000Z',x=>x.feeSnapshot.status='unknown',x=>x.policySnapshot.status='assumption',x=>x.review.individualHumanContribution.decision='unknown',x=>x.review.qualityControl.evidence.status='assumption',x=>x.review.mockupPhotoRights.decision='rejected']) {const r=Demo.prepare(mutate(fn));A.eq(r.state,'NOT_READY','unknown evidence never passes');A.ok(r.gaps.length>0,'blocker retained');}
  for(const key of Demo.gates) A.eq(Demo.prepare(mutate(x=>x.review[key].decision='unknown')).state,'NOT_READY',key+' blocks');
  const shortage=Demo.prepare(mutate(x=>x.cash.initialMinor='2000'));A.eq(shortage.economics.shortfallMinor,'1200','pre-payout cash gap includes reserve');
  A.eq(shortage.state,'NOT_READY','cash gap blocks');
  A.eq(Demo.prepare(mutate(x=>x.unit.costsMinor.refund=null)).economics.unitContributionMinor,null,'unknown is not zero');
  A.eq(Demo.prepare(mutate(x=>x.unit.costsMinor.refund='0')).economics.unitContributionMinor,'2000','explicit zero known');
  const large=Demo.prepare(mutate(x=>{x.unit.revenueMinor='999999999999999999';x.orders[0].quantity=100;}));A.eq(large.economics.scenarioContributionMinor,'99999999999999889900','exact arithmetic beyond safe Number');
  const inert=Demo.prepare(mutate(x=>x.title='[click](https://evil.test)'));A.ok(!inert.files['listing-draft.md'].includes('](https://evil.test)'),'markdown escaped');
  const source=fs.readFileSync(require.resolve('../sidecar/tools/builtin/etsy-pod.js'),'utf8');A.ok(!/require\(|fetch\(|process\.|Date\.now/.test(source),'no I/O or current clock');
  const OriginalDate=global.Date;try { global.Date=class extends OriginalDate { constructor(v){if(arguments.length!==1)throw Error('ambient');super(v);} static now(){throw Error('ambient');} };A.eq(Demo.prepare(input),pack,'no ambient time'); } finally {global.Date=OriginalDate;}
  for(const file of ['../frontend/app/toolprops.js','../website/app/app/toolprops.js']) A.eq(require(file).toolPropType('etsy.pod.prepare'),'cabinet','tool visibility');
  A.ok(fs.readFileSync(require.resolve('../sidecar/index.js'),'utf8').includes('makeEtsyPodTools().register(registry)'),'production registration');
  const recipe=require('../frontend/app/recipe-catalog/business.js').find(r=>r.id==='etsy-pod-preflight');A.ok(recipe&&['etsy.pod.prepare','fs.write','fs.read','read-back-verified','compare exact','No shell','denied'].every(s=>recipe.task.includes(s)),'verified private export recipe');
  A.eq(require('../website/app/app/recipe-catalog/business.js').find(r=>r.id===recipe.id),recipe,'recipe mirrored');
  const drift=require('../sidecar/recipe-drift.js');const trace=['etsy_pod_prepare','fs_write','fs_read'].map(name=>({name,callId:name}));const run=(extra=[])=>({runId:'pod-run',recipeId:recipe.id,reason:'done',model:'m',usd:0,toolTrace:trace.concat(extra),completionEvidence:{completionVerdict:'not_assessed',checks:[]}});
  for(const name of ['web_search','etsy_publish']) A.ok(drift.assessDrift([run([{name,callId:'external'}]),run(),run()]).signals.some(s=>s.code==='tool_new'&&s.tool===name),'unexpected external tool signals drift');
  const fixture = SidecarFixture.create({ prefix: 'starnet-etsy-pod-', timeoutMs: 20000 });
  try {
    const registry = makeRegistry();
    Demo.makeEtsyPodTools().register(registry);
    const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
    const fsTools = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: fixture.workspace });
    fsTools.register(registry);
    A.ok(CAP_REGISTRY.cabinet.some(grant => grant.tool === 'etsy.pod.prepare' && grant.scope === 'read' && !grant.requiresConsent && grant.network === false), 'tool is narrowly mapped to cabinet/read');
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
      toolTurn([['etsy.pod.prepare', input]], 'generate'),
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
    const run = await runAgentLoop({ messages: [{ role: 'user', content: 'Prepare and export private Etsy POD preflight.' }], provider, emit, cost: makeCostEngine({ priceOf: provider.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId, runId: 'etsy-pod-export', limits: { maxIters: 8, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.eq(run.reason, 'done', 'fake provider completes the registered run path');
    A.ok(calls.find(c => c.name === 'etsy.pod.prepare' && c.result.ok), 'pure generator is called from the harness tool path');
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
    A.eq(receipts.length, 5, 'all bundle files receive independent verified writer receipts');
    A.eq(artifacts.list().map(a => a.path).sort(), Object.keys(bundle.files).map(name => 'business/pod-review/' + name).sort(), 'normal writer results populate the existing artifact collector');
  } finally { await fixture.dispose(); }
  A.report('etsy-pod.test');
})().catch(error => { console.error(error); process.exit(1); });
// End of the focused Etsy POD preflight acceptance fixture.
