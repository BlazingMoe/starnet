/* Private evidence bundle plus the ordinary verified fs.write/read export path. */
'use strict';
const A = require('./_assert.js');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Demo = require('../sidecar/tools/builtin/service-studio.js');
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
  const fact = { id: 'fact', kind: 'observed-fact', statement: 'Operator inspected demand and private review fixture', sourceUrl: 'https://example.test/operator-record', receipt: 'fixture-only', checkedAt, support: 'supported' };
  const input = { projectId: 'studio-1', version: 'v1', lane: 'crm-prototype', asOf: checkedAt, freshnessDays: 7, title: 'Custom private CRM prototype', customerNeed: 'Operator supplied need for a synthetic dashboard', scope: 'Synthetic dashboard and follow-up states', exclusions: 'No real data or live account integration', customizationPlan: 'Customer-selected fields, workflow and original layout', humanRefinementPlan: 'Human edits and tests the resulting original prototype', aiUse: 'assisted', customerAiPreference: 'allowed',
    evidence: [fact, { ...fact, id: 'creator', kind: 'creator-claim', statement: 'Creator attributes time savings; not independently verified' }, { ...fact, id: 'platform', kind: 'platform-claim', statement: 'Platform describes a feature; not independently verified' }, { ...fact, id: 'estimate', kind: 'assumption', statement: 'Supplied price and cost scenario' }, { ...fact, id: 'idea', kind: 'hypothesis', statement: 'A narrower workflow may be useful' }],
    demandEvidenceIds: ['fact'], policyEvidenceId: 'fact', feeEvidenceId: 'fact',
    assets: [{ id: 'synthetic', license: 'Operator-owned synthetic fixture', evidenceId: 'fact', rights: 'approved', licensing: 'approved', likeness: 'approved', privacy: 'approved' }],
    deliverables: Demo.lanes['crm-prototype'].deliverables.map(id => ({ id, specification: 'Human reviewed bounded specification for ' + id })),
    qa: Object.keys(Demo.lanes['crm-prototype'].qa).map(id => ({ id, plan: 'Human reviewed test plan for ' + id, decision: 'approved', evidenceId: 'fact' })),
    review: Object.fromEntries(Demo.gates.map(k => [k, { decision: 'approved', evidenceId: 'fact' }])),
    duplicate: { workId: 'work-1', priorState: 'none', reconciliation: 'confirmed-new', evidenceId: 'fact' },
    revisionCap: 2, revisionsUsed: 0, supportWindowDays: 7, supportPlan: 'Two bounded rounds and seven days of documented questions', refundPlan: 'Supplied refund scenario reviewed by operator',
    economics: { currency: 'EUR', costCurrency: 'EUR', quotedPriceMinor: '10000', costsMinor: Object.fromEntries(Demo.costs.map(k => [k, '100'])), minutes: { acquisition: 20, sales: 10, production: 40, revisions: 10, support: 10 }, evidenceId: 'estimate' }
  };
  const fs = require('node:fs'), pack = Demo.prepare(input);
  A.eq(pack.state, 'READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW', 'only private human review readiness');
  A.eq(pack.economics.totalCostMinor, '1000', 'all ten supplied cost categories counted');
  A.eq(pack.economics.modeledContributionMinor, '9000', 'scenario is not revenue or profit');
  A.eq(pack.economics.totalMinutes, 90, 'all five time categories counted');
  A.eq(pack.economics.hourlyModeledContributionMinor, '6000', 'all time counted');
  A.eq(Demo.prepare(input), pack, 'deterministic');
  const before = JSON.stringify(input); Demo.prepare(input); A.eq(JSON.stringify(input), before, 'input unchanged');
  A.eq(Object.keys(pack.files), ['service-brief.md','evidence-ledger.json','production-and-qa.json','economics-and-scope.json','readiness.json'], 'fixed five files');
  A.eq(JSON.parse(pack.files['evidence-ledger.json']).evidence.map(e => e.kind), ['observed-fact','creator-claim','platform-claim','assumption','hypothesis'], 'provenance preserved');
  for (const lane of ['voiceover', 'music-edit', 'video-edit']) {
    A.eq(Demo.lanes[lane].deliverables.length, 3, lane + ' has a bounded three-part handover');
    A.ok(Object.keys(Demo.lanes[lane].qa).length >= 4, lane + ' requires specialized human QA');
    A.ok(JSON.stringify(Demo.lanes[lane]).toLowerCase().includes('rights'), lane + ' names rights verification');
  }
  const mutate = fn => { const x = JSON.parse(JSON.stringify(input)); fn(x); return x; };
  for (const lane of Object.keys(Demo.lanes)) {
    const x = mutate(x => { x.lane = lane; x.deliverables = Demo.lanes[lane].deliverables.map(id => ({ id, specification: 'Human reviewed specific ' + id })); x.qa = Object.keys(Demo.lanes[lane].qa).map(id => ({ id, plan: 'Human reviewed test of ' + id, decision: 'approved', evidenceId: 'fact' })); });
    A.eq(Demo.prepare(x).state, 'READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW', lane + ' explicit contracts');
    x.qa.pop(); A.eq(Demo.prepare(x).state, 'NOT_READY', lane + ' missing QA blocks');
    x.deliverables.pop(); A.ok(Demo.prepare(x).gaps.some(s => s.includes('Missing lane deliverable')), lane + ' missing deliverable blocks');
  }
  for (const fn of [
    x=>x.extra=true, x=>delete x.review, x=>x.lane='auto', x=>x.projectId='../bad', x=>x.version='bad id', x=>x.title='<script>', x=>x.title='bad\ntext', x=>x.title='a'.repeat(141), x=>x.freshnessDays=91,
    x=>x.evidence=Array(31).fill(x.evidence[0]), x=>x.evidence.push(x.evidence[0]), x=>x.evidence.push({...x.evidence[0],id:'FACT'}), x=>x.assets.push(x.assets[0]), x=>x.deliverables.push(x.deliverables[0]), x=>x.qa.push(x.qa[0]), x=>x.demandEvidenceIds.push('fact'),
    x=>x.evidence[0].sourceUrl='javascript:bad', x=>x.evidence[0].sourceUrl='https://u:p@example.test', x=>x.evidence[0].checkedAt='2026-02-30T12:00:00.000Z', x=>x.evidence[0].checkedAt='2026-11-01T12:00:00.000Z', x=>x.asOf='2026-10-29',
    x=>x.demandEvidenceIds=['missing'], x=>x.review.rights.evidenceId='missing', x=>x.qa[0].evidenceId='missing', x=>x.assets[0].evidenceId='missing', x=>x.economics.evidenceId='missing',
    x=>x.deliverables[0].id='other-lane', x=>x.qa[0].id='other-lane', x=>x.economics.costCurrency='USD', x=>x.economics.quotedPriceMinor='01', x=>x.economics.quotedPriceMinor='1.5', x=>x.economics.quotedPriceMinor='-1', x=>x.economics.quotedPriceMinor='1000000000000000000', x=>x.economics.costsMinor.platform=null, x=>x.economics.minutes.production=0.5, x=>x.revisionCap=21, x=>x.supportWindowDays=366
  ]) A.throws(()=>Demo.prepare(mutate(fn)), 'strict bounds and reference validation');
  for (const fn of [
    x=>x.evidence[0].kind='unknown', x=>x.evidence[1].support='unsupported', x=>x.evidence[1].support='unknown', x=>x.evidence[0].receipt=' Unknown ', x=>x.evidence[0].statement='unknown', x=>x.evidence[0].checkedAt='2026-10-01T12:00:00.000Z',
    x=>x.demandEvidenceIds=['creator'], x=>x.demandEvidenceIds=['platform'], x=>x.demandEvidenceIds=['estimate'], x=>x.demandEvidenceIds=['idea'], x=>x.policyEvidenceId='platform', x=>x.feeEvidenceId='creator',
    x=>x.customerAiPreference='prohibited', x=>x.customerAiPreference='unknown', x=>x.aiUse='unknown', x=>x.customizationPlan='unknown', x=>x.humanRefinementPlan='unknown', x=>x.supportPlan='unknown', x=>x.refundPlan='unknown',
    x=>x.assets[0].license='unknown', x=>x.assets[0].rights='unknown', x=>x.assets[0].licensing='rejected', x=>x.assets[0].likeness='unknown', x=>x.assets[0].privacy='unknown', x=>x.assets[0].evidenceId='creator',
    x=>x.deliverables[0].specification='unknown', x=>x.qa[0].plan='unknown', x=>x.qa[0].decision='unknown', x=>x.qa[0].evidenceId='idea',
    x=>x.duplicate.priorState='ambiguous', x=>x.duplicate.priorState='unknown', x=>x.duplicate.priorState='delivered', x=>x.duplicate.priorState='prepared', x=>x.duplicate.reconciliation='unresolved', x=>x.duplicate.reconciliation='unknown',
    x=>x.revisionsUsed=3, x=>x.economics.quotedPriceMinor='unknown', x=>x.economics.quotedPriceMinor='1000', x=>x.economics.minutes.production=0, x=>x.economics.minutes.revisions=0, x=>x.economics.minutes.support=0,
    x=>x.economics.evidenceId='creator', x=>x.economics.evidenceId='platform', x=>x.economics.evidenceId='idea'
  ]) A.eq(Demo.prepare(mutate(fn)).state, 'NOT_READY', 'uncertainty, unsupported claim or conflict blocks');
  for (const k of Demo.gates) {
    A.eq(Demo.prepare(mutate(x=>x.review[k].decision='unknown')).state, 'NOT_READY', k+' missing approval blocks');
    A.eq(Demo.prepare(mutate(x=>x.review[k].evidenceId='estimate')).state, 'NOT_READY', k+' assumption cannot approve');
  }
  for (const k of Demo.costs) A.eq(Demo.prepare(mutate(x=>x.economics.costsMinor[k]='unknown')).economics.modeledContributionMinor, null, k+' unknown never zero');
  A.eq(Demo.prepare(mutate(x=>{x.aiUse='none';x.customerAiPreference='prohibited';})).state,'READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW','non-AI work allowed');
  A.eq(Demo.prepare(mutate(x=>{x.duplicate.priorState='prepared';x.duplicate.reconciliation='confirmed-same-private-revision';})).state,'READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW','reconciled private revision allowed');
  A.eq(Demo.prepare(mutate(x=>x.economics.quotedPriceMinor='999999999999999999')).economics.modeledContributionMinor, '999999999999998999', 'exact BigInt above safe integer');
  A.eq(Demo.prepare(mutate(x=>x.economics.costsMinor.platform='200')).economics.modeledContributionMinor, '8900', 'fee is supplied, never hardcoded');
  A.eq(Demo.prepare(mutate(x=>x.economics.minutes.production=41)).economics.hourlyModeledContributionMinor, '5934', 'hourly quotient truncates');
  A.ok(!Demo.prepare(mutate(x=>x.title='[click](https://evil.test)')).files['service-brief.md'].includes('](https://evil.test)'), 'markdown inert');
  const boundedRegistry = makeRegistry(); Demo.makeServiceStudioTools().register(boundedRegistry);
  const dispatchPack = args => boundedRegistry.dispatch({ id: 'bounded-pack', name: 'service.studio.prepare', args });
  for (const field of ['acquisition', 'sales']) {
    for (const value of [undefined, null, -1, 0.5, 100001, '10']) {
      const args = mutate(x => { if (value === undefined) delete x.economics.minutes[field]; else x.economics.minutes[field] = value; });
      A.throws(() => Demo.prepare(args), field + ' requires a bounded integer');
      A.eq((await dispatchPack(args)).ok, false, field + ' invalid input rejected by registry');
    }
    const zero = Demo.prepare(mutate(x => x.economics.minutes[field] = 0));
    A.eq(zero.state, 'NOT_READY', field + ' zero cannot silently pass readiness');
    A.ok(zero.gaps.includes('Acquisition/sales time unresolved'), field + ' explicit gap');
    const max = Demo.prepare(mutate(x => x.economics.minutes[field] = 100000));
    A.eq(max.economics.totalMinutes, 90 - input.economics.minutes[field] + 100000, field + ' upper bound counted');
  }
  const large = mutate(x => {
    x.evidence = Array.from({ length: 30 }, (_, i) => ({ ...fact, id: i === 0 ? 'fact' : i === 1 ? 'estimate' : 'evidence-' + i,
      statement: '\\'.repeat(400), receipt: '\\'.repeat(200), sourceUrl: 'https://example.test/' + 'a'.repeat(479) }));
    x.assets = Array.from({ length: 20 }, (_, i) => ({ ...x.assets[0], id: 'asset-' + i, license: '\\'.repeat(200) }));
    for (const d of x.deliverables) d.specification = '\\'.repeat(400);
    for (const q of x.qa) q.plan = '\\'.repeat(400);
  });
  A.ok(JSON.stringify(Demo.prepare(large)).length > 80000, 'valid escaped pack exceeds central ceiling');
  const oversized = await dispatchPack(large);
  A.eq(oversized.ok, false, 'oversized pack fails through registry');
  A.eq(oversized.isError, true, 'oversized pack never partial success');
  A.ok(oversized.content.length < 300 && oversized.content.includes('shorten supplied input'), 'small actionable failure');
  A.eq(oversized.parkedPath, null, 'no hidden partial export');
  const edge = mutate(x => {
    x.assets = Array.from({ length: 20 }, (_, i) => ({ ...x.assets[0], id: 'asset-' + i, license: 'l'.repeat(400) }));
    for (const d of x.deliverables) d.specification = 'd'.repeat(800);
    x.evidence = Array.from({ length: 30 }, (_, i) => ({ ...fact,
    id: i === 0 ? 'fact' : i === 1 ? 'estimate' : 'evidence-' + i, statement: 'a', receipt: 'r'.repeat(400),
    sourceUrl: 'https://example.test/' + 'a'.repeat(479) })); });
  const baseLength = JSON.stringify(Demo.prepare(edge)).length;
  A.ok(baseLength < 80000 && baseLength + 30 * 799 > 80000, 'fixture spans exact boundary');
  let remaining = 80000 - baseLength;
  for (const e of edge.evidence) { const extra = Math.min(remaining, 799); e.statement += 'a'.repeat(extra); remaining -= extra; }
  A.eq(JSON.stringify(Demo.prepare(edge)).length, 80000, 'exact boundary constructed');
  const atLimit = await dispatchPack(edge);
  A.eq(atLimit.ok, true, 'exact limit succeeds');
  A.eq(JSON.parse(atLimit.content), Demo.prepare(edge), 'exact limit returns complete parseable five-file pack');
  edge.title += 'a';
  A.eq(JSON.stringify(Demo.prepare(edge)).length, 80001, 'one character above boundary');
  A.eq((await dispatchPack(edge)).ok, false, 'one character above limit fails closed');
  const registryPath = require.resolve('../sidecar/tools/registry.js'), cachedRegistry = require.cache[registryPath];
  const previousLimit = process.env.SKYNET_TOOL_OUTPUT_MAX;
  try {
    process.env.SKYNET_TOOL_OUTPUT_MAX = '500'; delete require.cache[registryPath];
    const tiny = require(registryPath).makeRegistry(); Demo.makeServiceStudioTools().register(tiny);
    const result = await tiny.dispatch({ id: 'tiny-pack', name: 'service.studio.prepare', args: input });
    A.eq(result.ok, false, 'studio honors smaller configured registry cap');
    A.eq(result.summary, 'complete-output-required', 'smaller cap fails for complete output contract');
  } finally {
    if (previousLimit === undefined) delete process.env.SKYNET_TOOL_OUTPUT_MAX; else process.env.SKYNET_TOOL_OUTPUT_MAX = previousLimit;
    require.cache[registryPath] = cachedRegistry;
  }
  const source=fs.readFileSync(require.resolve('../sidecar/tools/builtin/service-studio.js'),'utf8'); A.ok(!/require\(|fetch\(|process\.|Date\.now/.test(source), 'pure no I/O or clock');
  const OriginalDate=global.Date; try { global.Date=class extends OriginalDate { constructor(v){if(arguments.length!==1)throw Error('ambient');super(v);} static now(){throw Error('ambient');} }; A.eq(Demo.prepare(input),pack,'no ambient time'); } finally {global.Date=OriginalDate;}
  for (const file of ['../frontend/app/toolprops.js','../website/app/app/toolprops.js']) A.eq(require(file).toolPropType('service.studio.prepare'),'cabinet','tool visibility');
  A.ok(fs.readFileSync(require.resolve('../sidecar/index.js'),'utf8').includes('makeServiceStudioTools().register(registry)'),'production registration');
  const recipe=require('../frontend/app/recipe-catalog/business.js').find(r=>r.id==='digital-service-studio'); A.ok(recipe&&['service.studio.prepare','fs.write','fs.read','read-back-verified','compare exact','No shell','denied','voiceover','music-edit','video-edit','grants no music-generation authority'].every(s=>recipe.task.includes(s)),'verified private export recipe');
  A.eq(require('../website/app/app/recipe-catalog/business.js').find(r=>r.id===recipe.id),recipe,'recipe mirrored');
  const drift=require('../sidecar/recipe-drift.js'); const trace=['service_studio_prepare','fs_write','fs_read'].map(name=>({name,callId:name})); const driftRun=(extra=[])=>({runId:'studio-run',recipeId:recipe.id,reason:'done',model:'m',usd:0,toolTrace:trace.concat(extra),completionEvidence:{completionVerdict:'not_assessed',checks:[]}});
  for(const name of ['web_search','service_publish','code_run']) A.ok(drift.assessDrift([driftRun([{name,callId:'external'}]),driftRun(),driftRun()]).signals.some(s=>s.code==='tool_new'&&s.tool===name),'unexpected external tool signals drift');
  const fixture = SidecarFixture.create({ prefix: 'starnet-service-studio-', timeoutMs: 20000 });
  try {
    const registry = makeRegistry();
    Demo.makeServiceStudioTools().register(registry);
    const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
    const fsTools = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: fixture.workspace });
    fsTools.register(registry);
    A.ok(CAP_REGISTRY.cabinet.some(grant => grant.tool === 'service.studio.prepare' && grant.scope === 'read' && !grant.requiresConsent && grant.network === false), 'tool is narrowly mapped to cabinet/read');
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
    const writes = Object.entries(bundle.files).map(([name, content]) => ['fs.write', { path: 'business/studio-review/' + name, content }]);
    const reads = Object.keys(bundle.files).map(name => ['fs.read', { path: 'business/studio-review/' + name }]);
    const turns = [
      toolTurn([['service.studio.prepare', input]], 'generate'),
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
    A.ok(!resolveTools(agentId, withoutCabinet).tools.includes('service.studio.prepare'), 'no cabinet means no preparation capability');
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
    const run = await runAgentLoop({ messages: [{ role: 'user', content: 'Prepare and export private studio manual preparation preflight.' }], provider, emit, cost: makeCostEngine({ priceOf: provider.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId, runId: 'service-studio-export', limits: { maxIters: 8, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.eq(run.reason, 'done', 'fake provider completes the registered run path');
    A.ok(calls.find(c => c.name === 'service.studio.prepare' && c.result.ok), 'pure generator is called from the harness tool path');
    const deniedProvider = makeReplayProvider({ turns: [toolTurn([['fs.write', { path: 'business/studio-review/replay-denied.txt', content: 'no' }]], 'deny'), reportTurn] });
    await runAgentLoop({ messages: [{ role: 'user', content: 'Attempt denied export' }], provider: deniedProvider, emit, cost: makeCostEngine({ priceOf: deniedProvider.priceOf }), tools: toolDefs, dispatch, capCtx: { ...capCtx, consent: async () => ({ allow: false, reason: 'denied replay' }) }, model: 'replay/model', agentId, runId: 'denied-audit', limits: { maxIters: 4, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.ok(calls.some(c => c.args.path === 'business/studio-review/replay-denied.txt' && c.result.isError), 'actual replay denies write');
    A.ok(!require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'business/studio-review/replay-denied.txt')), 'replay denied write creates no file');
    const denied = await registry.dispatch({ id: 'denied-write', name: 'fs.write', args: { path: 'business/studio-review/denied.txt', content: 'no' } }, { ...capCtx, consent: async () => ({ allow: false, reason: 'test denial' }) });
    A.eq(denied.isError, true, 'write denial is enforced by ordinary registry consent gate');
    A.eq(require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'business/studio-review/denied.txt')), false, 'denied write creates no file');
    for (const [name, content] of Object.entries(bundle.files)) {
      const rel = 'business/studio-review/' + name;
      const write = calls.find(c => c.name === 'fs.write' && c.args.path === rel).result;
      A.eq(write.receipt.state, 'read-back-verified', rel + ' uses the real byte-verified writer');
      receipts.push(write.receipt);
      const read = calls.find(c => c.name === 'fs.read' && c.args.path === rel).result;
      A.ok(read.ok && read.content === content, rel + ' matches generated content after ordinary fs.read readback');
    }
    A.ok(calls.every(c => ['service.studio.prepare','fs.write','fs.read'].includes(c.name)), 'no external tools called');
    A.eq(receipts.length, 5, 'all bundle files receive independent verified writer receipts');
    A.eq(artifacts.list().map(a => a.path).sort(), Object.keys(bundle.files).map(name => 'business/studio-review/' + name).sort(), 'normal writer results populate the existing artifact collector');
  } finally { await fixture.dispose(); }
  A.report('service-studio.test');
})().catch(error => { console.error(error); process.exit(1); });
// End of the focused studio manual preparation preflight acceptance fixture.
