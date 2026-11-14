/* Pure synthetic CRM demo plus the ordinary verified fs.write/read export path. */
'use strict';
const A = require('./_assert.js');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Demo = require('../sidecar/tools/builtin/crm-demo.js');
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
  const fs = require('node:fs'), vm = require('node:vm');
  const generatedOnce = Demo.generate({ industry: 'workshop' });
  A.eq(generatedOnce, Demo.generate({ industry: 'workshop' }), 'deterministic repeat output');
  A.eq(Object.keys(generatedOnce.files), ['index.html', 'synthetic-data.json', 'README.md'], 'only three fixed filenames');
  const html = generatedOnce.files['index.html'];
  const data = JSON.parse(generatedOnce.files['synthetic-data.json']);
  A.eq(JSON.parse(html.match(/<script id="synthetic-data" type="application\/json">([\s\S]*?)<\/script>/)[1]), data, 'JSON and embedded data are identical');
  A.ok(data.synthetic && data.leads.every(x => /^SYN-/.test(x.id)), 'all data explicitly synthetic');
  A.ok(/form-action 'none'/.test(html) && /connect-src 'none'/.test(html), 'CSP blocks connections and forms');
  A.ok(!/https?:|innerHTML|fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|sendBeacon/.test(html), 'no external URL, unsafe HTML sink, network or storage API');
  for (const input of [null, [], 'workshop', {}, {industry: 'other'}, {industry: 'x'.repeat(1000)}, {industry: 'workshop\n'}, {industry: '<script>alert(1)</script>'}, {industry: 'workshop', contacts: []}, {industry: 'workshop', businessName: 'Real firm'}]) A.throws(() => Demo.generate(input), 'reject invalid or untrusted input');
  const isolated = {module: {exports: {}}, Date: class {constructor(){throw Error('ambient clock');} static now(){throw Error('ambient clock');}}, require(){throw Error('I/O forbidden');}, fetch(){throw Error('network forbidden');}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../sidecar/tools/builtin/crm-demo.js'), 'utf8'), isolated);
  A.eq(JSON.stringify(isolated.module.exports.generate({industry:'workshop'})), JSON.stringify(generatedOnce), 'runs without filesystem, network, provider or ambient clock');
  for (const term of ['verifizierte Felder', 'Rechte', 'Datenschutz', 'Rollen/Zugriffe', 'Datenmigration/Backups', 'Integrationen', 'Nachrichten/Automationen', 'Hosting', 'separat']) A.ok(generatedOnce.files['README.md'].includes(term), 'customer boundary: '+term);
  const recipes = require('../frontend/app/recipe-catalog/business.js');
  const recipe = recipes.find(x=>x.id==='digital-service-studio');
  A.eq(recipes.filter(x=>x.id==='digital-service-studio').length, 1, 'extends one existing recipe');
  A.eq(fs.readFileSync(require.resolve('../frontend/app/recipe-catalog/business.js'),'utf8'),fs.readFileSync(require.resolve('../website/app/app/recipe-catalog/business.js'),'utf8'),'recipe mirrors byte-identical');
  for(const term of ['CRM PROTOTYPE:', 'service.studio.prepare', 'crm-prototype', 'READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW', 'separate explicit operator request', 'crm.demo.generate', 'synthetic-data.json', 'three independent read-back-verified receipts', 'byte-exact', 'stop for human private review', 'No real data, import, integration, account, outreach, message, deploy, hosting, shell, network or background loop']) A.ok(recipe.task.includes(term), 'recipe boundary: '+term);
  A.ok(fs.readFileSync(require.resolve('../sidecar/index.js'),'utf8').includes('makeCrmDemoTools().register(registry)'), 'production registers CRM tool');
  for (const file of ['../frontend/app/toolprops.js','../website/app/app/toolprops.js']) A.eq(require(file).toolPropType('crm.demo.generate'),'cabinet','tool visibility');

  const fixture = SidecarFixture.create({ prefix: 'starnet-crm-demo-', timeoutMs: 20000 });
  try {
    const registry = makeRegistry();
    Demo.makeCrmDemoTools().register(registry);
    const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
    const fsTools = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: fixture.workspace });
    fsTools.register(registry);
    A.ok(CAP_REGISTRY.cabinet.some(grant => grant.tool === 'crm.demo.generate' && grant.scope === 'read' && !grant.requiresConsent && grant.network === false), 'tool is narrowly mapped to cabinet/read');
    const agentId = 'demo-test', receipts = [], artifacts = makeArtifactCollector();
    const generated = Demo.generate({ industry: 'workshop' }), bundle = generated;
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
    const reportTurn = [{ type: 'text', delta: 'Three files exported and read back.' }, { type: 'usage', usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }, { type: 'done', finishReason: 'stop' }];
    const writes = Object.entries(bundle.files).map(([name, content]) => ['fs.write', { path: 'demos/synthetic-crm/' + name, content }]);
    const reads = Object.keys(bundle.files).map(name => ['fs.read', { path: 'demos/synthetic-crm/' + name }]);
    const turns = [
      toolTurn([['crm.demo.generate', { industry: 'workshop' }]], 'generate'),
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
    A.ok(resolved.tools.includes('crm.demo.generate'), 'cabinet exposes CRM');
    A.ok(!resolveTools(agentId, {agents:station.agents,rooms:{office:{id:'office',objects:[{instanceId:'only-computer',objectType:'computer'}]}}}).tools.includes('crm.demo.generate'), 'no cabinet hides CRM');
    const tool = registry.get('crm.demo.generate');
    A.eq([tool.capability,tool.scope,tool.requiresConsent,Demo.makeCrmDemoTools().tool.network], ['cabinet','read',false,false], 'pure tool authority');
    A.eq(tool.schema.additionalProperties, false, 'schema rejects unknown properties');
    A.eq(tool.schema.properties.industry.enum, ['workshop'], 'schema bounds industry');
    const capCtx = makeCapCtx(resolved, { consent: async () => ({ allow: true }) });
    const invalid = await registry.dispatch({id:'invalid',name:'crm.demo.generate',args:{industry:'workshop',extra:true}}, capCtx);
    A.ok(invalid.isError, 'registered path rejects unknown fields');
    const noConsent = await registry.dispatch({id:'no-consent',name:'crm.demo.generate',args:{industry:'workshop'}}, {...capCtx,consent:async()=>{throw Error('pure tool must not prompt');}});
    A.ok(noConsent.ok, 'generation requires no consent');
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
    const run = await runAgentLoop({ messages: [{ role: 'user', content: 'Generate and export the synthetic CRM demo.' }], provider, emit, cost: makeCostEngine({ priceOf: provider.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId, runId: 'crm-demo-export', limits: { maxIters: 8, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.eq(run.reason, 'done', 'fake provider completes the registered run path');
    A.ok(calls.find(c => c.name === 'crm.demo.generate' && c.result.ok), 'pure generator is called from the harness tool path');
    const deniedProvider = makeReplayProvider({turns:[toolTurn([['fs.write',{path:'demos/synthetic-crm/replay-denied.txt',content:'no'}]],'deny'),reportTurn]});
    await runAgentLoop({messages:[{role:'user',content:'Attempt denied export'}],provider:deniedProvider,emit,cost:makeCostEngine({priceOf:deniedProvider.priceOf}),tools:toolDefs,dispatch,capCtx:{...capCtx,consent:async()=>({allow:false,reason:'denied replay'})},model:'replay/model',agentId,runId:'crm-denied',limits:{maxIters:4,maxCostUsd:1},clock:{now:()=>0}});
    A.ok(calls.some(c=>c.args.path==='demos/synthetic-crm/replay-denied.txt'&&c.result.isError),'replay write denial enforced');
    A.ok(!require('node:fs').existsSync(path.join(fixture.workspace,agentId,'demos/synthetic-crm/replay-denied.txt')),'denied replay creates no file');
    A.ok(calls.every(c=>['crm.demo.generate','fs.write','fs.read'].includes(c.name)),'complete replay uses only generator and ordinary export tools');
    const denied = await registry.dispatch({ id: 'denied-write', name: 'fs.write', args: { path: 'demos/synthetic-crm/denied.txt', content: 'no' } }, { ...capCtx, consent: async () => ({ allow: false, reason: 'test denial' }) });
    A.eq(denied.isError, true, 'write denial is enforced by ordinary registry consent gate');
    A.eq(require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'demos/synthetic-crm/denied.txt')), false, 'denied write creates no file');
    for (const [name, content] of Object.entries(bundle.files)) {
      const rel = 'demos/synthetic-crm/' + name;
      const write = calls.find(c => c.name === 'fs.write' && c.args.path === rel).result;
      A.eq(write.receipt.state, 'read-back-verified', rel + ' uses the real byte-verified writer');
      receipts.push(write.receipt);
      A.eq(write.receipt.sha256,require('node:crypto').createHash('sha256').update(content,'utf8').digest('hex'),'receipt hash binds exact generated bytes');
      const read = calls.find(c => c.name === 'fs.read' && c.args.path === rel).result;
      A.ok(read.ok && read.content === content, rel + ' matches generated content after ordinary fs.read readback');
    }
    A.eq(receipts.length, 3, 'all three bundle files receive independent verified writer receipts');
    A.eq(artifacts.list().map(a => a.path).sort(), ['demos/synthetic-crm/README.md', 'demos/synthetic-crm/index.html', 'demos/synthetic-crm/synthetic-data.json'], 'normal writer results populate the existing artifact collector');
  } finally { await fixture.dispose(); }
  A.report('crm-demo.test');
})().catch(error => { console.error(error); process.exit(1); });
