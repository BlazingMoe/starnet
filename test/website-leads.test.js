/* Private evidence bundle plus the ordinary verified fs.write/read export path. */
'use strict';
const A = require('./_assert.js');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Demo = require('../sidecar/tools/builtin/website-leads.js');
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
  const checkedAt = '2026-10-28T12:00:00.000Z';
  const row = { listingId: 'l1', sourceId: 's1', publicListingUrl: 'https://directory.example.test/one', label: 'Synthetic Salon', addressEvidence: '1 Sample Road', localityEvidence: 'Example Town', checkedAt, websiteStatus: 'found', websiteUrl: 'https://salon.example.test/', evidenceNote: 'Operator observed a website link on this public listing', uncertainty: 'Identity, ownership and freshness unconfirmed' };
  const input = { region: { country: 'Example Country', locality: 'Example Town', radiusKm: 10 }, trade: 'salon', allowedSources: [{ sourceId: 's1', name: 'Allowed public directory', publicUrl: 'https://directory.example.test/', receipt: 'Synthetic operator receipt', checkedAt }], observations: [row] };
  const fs = require('node:fs');
  const sourceText = fs.readFileSync(require.resolve('../sidecar/tools/builtin/website-leads.js'), 'utf8');
  A.ok(!/require\(|fetch\(|XMLHttpRequest|process\.|localStorage|Date\.now/.test(sourceText), 'no I/O imports, network or current clock');
  class SuppliedDate extends Date {
    constructor(value) { if (arguments.length !== 1) throw new Error('Ambient clock unavailable'); super(value); }
    static now() { throw new Error('Ambient clock unavailable'); }
  }
  const sandbox = { module: { exports: {} }, URL, Date: SuppliedDate };
  require('node:vm').runInNewContext(sourceText + '\nmodule.exports.generate(' + JSON.stringify(input) + ')', sandbox, { timeout: 1000 });
  A.ok(true, 'pure generator runs without filesystem network or process');
  const pack = Demo.generate(input);
  A.eq(Demo.generate(input), pack, 'deterministic output');
  A.eq(Object.keys(pack.files), ['research-register.json', 'duplicate-review.md', 'source-log.md', 'next-checks.md'], 'fixed filenames');
  const register = JSON.parse(pack.files['research-register.json']);
  A.eq(register.input, input, 'exact original validated observations and source receipts preserved');
  A.eq(pack.limits, { network: false, send: false, write: false, private: true }, 'no I/O authority');
  A.eq(register.derived[0].auditHandoff, 'pending-human-confirmation-and-website-inspection', 'found alone cannot authorize audit');
  for (const status of ['not-found-in-checked-source', 'unknown', 'blocked', 'stale-or-misleading']) {
    const observation = { ...row, websiteStatus: status }; delete observation.websiteUrl;
    const generated = Demo.generate({ ...input, observations: [observation] });
    const data = JSON.parse(generated.files['research-register.json']);
    A.eq(data.derived[0].auditHandoff, 'unresolved', status + ' remains unresolved');
    A.eq(data.derived[0].eligibleAfterHumanConfirmation, false, status + ' requires new observed evidence');
    A.ok(generated.files['next-checks.md'].includes(status === 'not-found-in-checked-source' ? 'does not establish that there is no website' : status === 'blocked' ? 'Inspection was blocked' : status === 'unknown' ? 'existence and condition are unknown' : 'not current website evidence'), 'honest state wording');
  }
  const mutate = fn => { const x = JSON.parse(JSON.stringify(input)); fn(x); return x; };
  const bad = [
    x => delete x.region, x => delete x.region.locality, x => delete x.trade, x => delete x.allowedSources,
    x => x.extra = true, x => x.region.extra = true, x => x.observations[0].extra = true,
    x => x.trade = 'x'.repeat(81), x => x.region.radiusKm = 201, x => x.region.radiusKm = 0.5,
    x => x.observations = Array(25).fill(row), x => x.allowedSources = [],
    x => x.observations[0].sourceId = 'missing', x => x.allowedSources.push(x.allowedSources[0]),
    x => x.observations[0].publicListingUrl = 'https://unlisted.example.test/one',
    x => x.allowedSources[0].publicUrl = 'https:directory.example.test',
    x => x.observations.push(x.observations[0]), x => x.allowedSources[0].sourceId = '__proto__\n',
    x => x.allowedSources[0].publicUrl = 'javascript:alert(1)', x => x.allowedSources[0].publicUrl = 'https://user:secret@example.test',
    x => x.observations[0].publicListingUrl = 'file:///private', x => x.observations[0].websiteUrl = 'https://u:p@example.test',
    x => x.allowedSources[0].checkedAt = '2026-02-30T12:00:00.000Z', x => x.observations[0].checkedAt = '2026-10-28T12:00:00Z',
    x => delete x.observations[0].websiteUrl, x => x.observations[0].websiteStatus = 'blocked',
    x => x.observations[0].websiteStatus = 'stale-or-misleading', x => x.observations[0].websiteStatus = 'no-website',
    x => x.observations[0].label = '<script>evil</script>', x => x.observations[0].evidenceNote = 'text\n# instruction',
    x => x.observations[0].label = '\u202eevil', x => x.observations[0].evidenceNote = 'CSV\r\n=1+1'
  ];
  for (const fn of bad) A.throws(() => Demo.generate(mutate(fn)), 'strict malformed bounded field rejection');
  const inert = mutate(x => { x.allowedSources[0].name = '[click](https://evil.test)'; x.observations[0].label = '=HYPERLINK("https://evil.test","x")'; });
  const safe = Demo.generate(inert);
  A.ok(!safe.files['source-log.md'].includes('](https://evil.test)'), 'Markdown is escaped');
  A.eq(JSON.parse(safe.files['research-register.json']).input, inert, 'formula-shaped data stays inert JSON; no CSV evaluation');
  const candidates = Demo.generate({ ...input, observations: [
    row, { ...row, listingId: 'l2' },
    { ...row, listingId: 'l3', publicListingUrl: 'https://directory.example.test/three', label: 'SYNTHETIC SALON', addressEvidence: '2 Other Road', websiteUrl: 'https://other.example.test/' },
    { ...row, listingId: 'l4', publicListingUrl: 'https://directory.example.test/four', label: 'Distinct Trade', addressEvidence: '9 Distinct Road', websiteUrl: 'https://distinct.example.test/' }
  ] });
  const dedup = JSON.parse(candidates.files['research-register.json']);
  A.eq(dedup.input.observations.length, 4, 'no destructive merging or deletion');
  A.eq(dedup.duplicateCandidates.map(x => [x.listingIds, x.kind]), [[['l1','l2'],'exact-evidence-candidate'],[['l1','l3'],'similarity-candidate'],[['l2','l3'],'similarity-candidate']], 'exact evidence and fuzzy candidates separated; distinct record retained');
  A.ok(dedup.duplicateCandidates.every(x => x.requiresHumanVerification), 'all candidates require human verification');
  A.ok(Demo.generate({ ...input, region: { country: 'Example Country', postcode: '12345', radiusKm: 0 } }).files['research-register.json'], 'explicit postcode supports region without inferred locality');
  const bounded = Demo.generate({ ...input, observations: Array.from({ length: 24 }, (_, i) => ({ ...row, listingId: 'listing-' + String(i).padStart(16, '0'), label: '"'.repeat(100), addressEvidence: '"'.repeat(200), localityEvidence: '"'.repeat(100), evidenceNote: '"'.repeat(300), uncertainty: '"'.repeat(300) })) });
  A.eq(JSON.parse(bounded.files['research-register.json']).duplicateCandidates.length, 276, 'bounded worst-case pairwise candidate count');
  A.ok(Object.values(bounded.files).every(text => text.length < 200000), 'maximum duplicate bundle fits ordinary exact fs.read limit');
  A.eq(require('../frontend/app/toolprops.js').toolPropType('website.leads.prepare'), 'cabinet', 'frontend tool mapping');
  A.eq(require('../website/app/app/toolprops.js').toolPropType('website.leads.prepare'), 'cabinet', 'website tool mapping');
  A.ok(fs.readFileSync(require.resolve('../sidecar/index.js'), 'utf8').includes('makeWebsiteLeadsTools().register(registry)'), 'production registration');
  const recipe = require('../frontend/app/recipe-catalog/business.js').find(r => r.id === 'regional-website-research');
  A.ok(recipe && ['website.leads.prepare', 'fs.write', 'fs.read', 'research-register.json', 'denied', 'read-back-verified', 'compare exact', 'No shell'].every(x => recipe.task.includes(x)), 'normal verified export recipe');
  A.ok(recipe.params.every(x => x.required) && recipe.cadence === null, 'explicit intake and no background loop');
  A.eq(require('../website/app/app/recipe-catalog/business.js').find(r => r.id === recipe.id), recipe, 'recipe mirror identical');
  const fixture = SidecarFixture.create({ prefix: 'starnet-website-leads-', timeoutMs: 20000 });
  try {
    const registry = makeRegistry();
    Demo.makeWebsiteLeadsTools().register(registry);
    const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
    const fsTools = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: fixture.workspace });
    fsTools.register(registry);
    A.ok(CAP_REGISTRY.cabinet.some(grant => grant.tool === 'website.leads.prepare' && grant.scope === 'read' && !grant.requiresConsent && grant.network === false), 'tool is narrowly mapped to cabinet/read');
    const agentId = 'demo-test', receipts = [], artifacts = makeArtifactCollector();
    const generated = Demo.generate(input), bundle = generated;
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
    const reportTurn = [{ type: 'text', delta: 'Four files exported and read back.' }, { type: 'usage', usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }, { type: 'done', finishReason: 'stop' }];
    const writes = Object.entries(bundle.files).map(([name, content]) => ['fs.write', { path: 'demos/regional-research/' + name, content }]);
    const reads = Object.keys(bundle.files).map(name => ['fs.read', { path: 'demos/regional-research/' + name }]);
    const turns = [
      toolTurn([['website.leads.prepare', input]], 'generate'),
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
    const run = await runAgentLoop({ messages: [{ role: 'user', content: 'Prepare and export private operator-supplied regional research.' }], provider, emit, cost: makeCostEngine({ priceOf: provider.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId, runId: 'website-leads-export', limits: { maxIters: 8, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.eq(run.reason, 'done', 'fake provider completes the registered run path');
    A.ok(calls.find(c => c.name === 'website.leads.prepare' && c.result.ok), 'pure generator is called from the harness tool path');
    const deniedProvider = makeReplayProvider({ turns: [toolTurn([['fs.write', { path: 'demos/regional-research/replay-denied.txt', content: 'no' }]], 'deny'), reportTurn] });
    await runAgentLoop({ messages: [{ role: 'user', content: 'Attempt denied export' }], provider: deniedProvider, emit, cost: makeCostEngine({ priceOf: deniedProvider.priceOf }), tools: toolDefs, dispatch, capCtx: { ...capCtx, consent: async () => ({ allow: false, reason: 'denied replay' }) }, model: 'replay/model', agentId, runId: 'denied-audit', limits: { maxIters: 4, maxCostUsd: 1 }, clock: { now: () => 0 } });
    A.ok(calls.some(c => c.args.path === 'demos/regional-research/replay-denied.txt' && c.result.isError), 'actual replay denies write');
    A.ok(!require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'demos/regional-research/replay-denied.txt')), 'replay denied write creates no file');
    const denied = await registry.dispatch({ id: 'denied-write', name: 'fs.write', args: { path: 'demos/regional-research/denied.txt', content: 'no' } }, { ...capCtx, consent: async () => ({ allow: false, reason: 'test denial' }) });
    A.eq(denied.isError, true, 'write denial is enforced by ordinary registry consent gate');
    A.eq(require('node:fs').existsSync(path.join(fixture.workspace, agentId, 'demos/regional-research/denied.txt')), false, 'denied write creates no file');
    for (const [name, content] of Object.entries(bundle.files)) {
      const rel = 'demos/regional-research/' + name;
      const write = calls.find(c => c.name === 'fs.write' && c.args.path === rel).result;
      A.eq(write.receipt.state, 'read-back-verified', rel + ' uses the real byte-verified writer');
      receipts.push(write.receipt);
      const read = calls.find(c => c.name === 'fs.read' && c.args.path === rel).result;
      A.ok(read.ok && read.content === content, rel + ' matches generated content after ordinary fs.read readback');
    }
    A.eq(receipts.length, 4, 'all bundle files receive independent verified writer receipts');
    A.eq(artifacts.list().map(a => a.path).sort(), Object.keys(pack.files).map(name => 'demos/regional-research/' + name).sort(), 'normal writer results populate the existing artifact collector');
  } finally { await fixture.dispose(); }
  A.report('website-leads.test');
})().catch(error => { console.error(error); process.exit(1); });
