/* Pure fictional website demo plus the ordinary verified fs.write/read export path. */
'use strict';
const A = require('./_assert.js');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Demo = require('../sidecar/tools/builtin/website-demo.js');
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
  const salon = Demo.generate({ industry: 'salon' });
  A.eq(Object.keys(salon.files), ['index.html', 'README.md'], 'generator returns only fixed standalone filenames');
  A.ok(/Fiktives Konzept/.test(salon.files['index.html']) && /MUSTERIDENTITÄT/.test(salon.files['index.html']), 'fictional labeling is visible in the page');
  A.ok(/NUR DEMO/.test(salon.files['README.md']) && /überträgt und speichert nichts/.test(salon.files['README.md']), 'README documents provenance and no-send limits');
  A.ok(!/https?:\/\//i.test(salon.files['index.html']) && !/<img\b/i.test(salon.files['index.html']), 'page has no external URLs or externally loaded images');
  A.ok(/addEventListener\('submit'/.test(salon.files['index.html']) && /preventDefault\(\)/.test(salon.files['index.html']) && !/fetch\(|XMLHttpRequest|localStorage|sessionStorage/.test(salon.files['index.html']), 'sample form handles locally with no network or browser storage');
  A.ok(/form-action 'none'/.test(salon.files['index.html']) && /connect-src 'none'/.test(salon.files['index.html']), 'content policy blocks fallback form submission and connections');
  A.throws(() => Demo.generate({ industry: 'salon', write: true }), 'generator rejects unknown tool inputs instead of trusting schema-only validation');
  const hostile = Demo.generate({ industry: 'salon', businessName: '<script>alert(1)</script>' }).files['index.html'];
  A.ok(hostile.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !hostile.includes('<script>alert(1)</script>'), 'hostile input is escaped in HTML text context');
  A.throws(() => Demo.generate({ industry: 'salon', tagline: 'x'.repeat(101) }), 'oversized field is rejected');
  A.throws(() => Demo.generate({ industry: 'real-prospect' }), 'industry must come from the fixed fictional set');
  const trades = Demo.generate({ industry: 'trades', businessName: 'Sample Works' });
  A.ok(trades.files['index.html'].includes('Sample Works') && trades.files['index.html'].includes('MUSTERIDENTITÄT'), 'second supported industry uses an invented identity');
  const mdInjection = Demo.generate({ industry: 'salon', businessName: 'Demo [link](https://example.test)' }).files['README.md'];
  A.ok(!/\]\(https?:\/\//.test(mdInjection), 'README escapes Markdown link input so fields cannot add external content');

  const fixture = SidecarFixture.create({ prefix: 'starnet-website-demo-', timeoutMs: 20000 });
  try {
    const registry = makeRegistry();
    Demo.makeWebsiteDemoTools().register(registry);
    const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
    const fsTools = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: fixture.workspace });
    fsTools.register(registry);
    A.ok(CAP_REGISTRY.cabinet.some(grant => grant.tool === 'website.demo.generate' && grant.scope === 'read' && !grant.requiresConsent), 'tool is narrowly mapped to cabinet/read');
    const agentId = 'demo-test', receipts = [], artifacts = makeArtifactCollector();
    const generated = Demo.generate({ industry: 'salon' }), bundle = generated;
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
    const reportTurn = [{ type: 'text', delta: 'Two files exported and read back.' }, { type: 'usage', usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }, { type: 'done', finishReason: 'stop' }];
    const writes = Object.entries(bundle.files).map(([name, content]) => ['fs.write', { path: 'demos/fictional-salon/' + name, content }]);
    const reads = Object.keys(bundle.files).map(name => ['fs.read', { path: 'demos/fictional-salon/' + name }]);
    const turns = [
      toolTurn([['website.demo.generate', { industry: 'salon' }]], 'generate'),
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
    const run = await runAgentLoop({ messages: [{ role: 'user', content: 'Generate and export the fictional salon demo.' }], provider, emit, cost: makeCostEngine({ priceOf: provider.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId, runId: 'website-demo-export', limits: { maxIters: 8, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.eq(run.reason, 'done', 'fake provider completes the registered run path');
    A.ok(calls.find(c => c.name === 'website.demo.generate' && c.result.ok), 'pure generator is called from the harness tool path');
    const denied = await registry.dispatch({ id: 'denied-write', name: 'fs.write', args: { path: 'demos/fictional-salon/denied.txt', content: 'no' } }, { ...capCtx, consent: async () => ({ allow: false, reason: 'test denial' }) });
    A.eq(denied.isError, true, 'write denial is enforced by ordinary registry consent gate');
    A.eq(require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'demos/fictional-salon/denied.txt')), false, 'denied write creates no file');
    for (const [name, content] of Object.entries(bundle.files)) {
      const rel = 'demos/fictional-salon/' + name;
      const write = calls.find(c => c.name === 'fs.write' && c.args.path === rel).result;
      A.eq(write.receipt.state, 'read-back-verified', rel + ' uses the real byte-verified writer');
      receipts.push(write.receipt);
      const read = calls.find(c => c.name === 'fs.read' && c.args.path === rel).result;
      A.ok(read.ok && read.content.includes(content), rel + ' matches generated content after ordinary fs.read readback');
    }
    A.eq(receipts.length, 2, 'both bundle files receive independent verified writer receipts');
    A.eq(artifacts.list().map(a => a.path).sort(), ['demos/fictional-salon/README.md', 'demos/fictional-salon/index.html'], 'normal writer results populate the existing artifact collector');
  } finally { await fixture.dispose(); }
  A.report('website-demo.test');
})().catch(error => { console.error(error); process.exit(1); });
