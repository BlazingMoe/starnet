/* node test/harness.integration.test.js — THE real-harness contract, end to end and headless.
   Wires the SAME graph the sidecar host builds (registry + web + fs + notebook tools, object=capability
   resolution, the dotted->underscore wire-name boundary, the dispatch guard) and drives a four-step
   mission — web_search -> web_fetch -> fs.write -> final answer — through the UNCHANGED agentic loop on
   the replay provider. Zero network, zero spend (fetch + DNS injected). Proves the agent can actually ACT.

   This is the test that would have caught BOTH default-path showstoppers: the dotted tool names (the wire
   regex assertion) and a CAP_REGISTRY/registration drift (the resolved-toolset assertion). */
'use strict';
const A = require('./_assert.js');
const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('node:zlib');
const events = require('../shared/events.js');
const { makeEmitter } = require('../shared/emitter.js');
const { makeReplayProvider } = require('../sidecar/providers/replay.js');
const { makeCostEngine } = require('../sidecar/cost.js');
const { runAgentLoop } = require('../sidecar/loop.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { makeWebTools } = require('../sidecar/tools/builtin/web.js');
const { makeConnectorTools } = require('../sidecar/tools/builtin/connectors.js');
const { makeBrowserTools } = require('../sidecar/tools/builtin/browser.js');
const { makeDesktopTools } = require('../sidecar/tools/builtin/desktop.js');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { makeDocExtract } = require('../sidecar/tools/builtin/docextract.js');
const { makeNotebookTools } = require('../sidecar/tools/builtin/notebook.js');
const { makeWidgetTools } = require('../sidecar/tools/builtin/widgets.js');
const { makeTodoTool } = require('../sidecar/tools/builtin/todo.js');
const { makeDeliverableTool } = require('../sidecar/tools/builtin/deliverable.js');
const { makeRecallTool } = require('../sidecar/tools/builtin/recall.js');
const { makeToolSearchTool } = require('../sidecar/tools/builtin/toolsearch.js');
const { makeCodeTools } = require('../sidecar/tools/builtin/code.js');
const { makeStationInspectTool } = require('../sidecar/tools/builtin/station-inspect.js');
const { makeTranscriptStore } = require('../sidecar/transcriptstore.js');
const { makeSkillTools } = require('../sidecar/tools/builtin/skills.js');
const { makeSkillStore } = require('../sidecar/skillstore.js');
const { makeQuestTools } = require('../sidecar/tools/builtin/quests.js');
const { makeCommsTools } = require('../sidecar/tools/builtin/comms.js');
const { makeRoutineTools } = require('../sidecar/tools/builtin/routines.js');
const { makeQuestStore } = require('../sidecar/quest-store.js');
const { resolveTools } = require('../sidecar/capability/resolve.js');
const { makeCapCtx } = require('../sidecar/capability/capGate.js');
const { makeConsentBroker } = require('../sidecar/permissions.js');
const { renderRecall, injectRecall, rank, redact } = require('../sidecar/context.js');

const ROOT = path.join(os.tmpdir(), 'starnet-itest-' + process.pid);
const docExtract = makeDocExtract({ inflateRaw:zlib.inflateRawSync });

function zipFixture(files) {
  const locals=[],central=[]; let offset=0;
  for(const [name,text] of Object.entries(files)){
    const nameBuf=Buffer.from(name),data=Buffer.from(text),body=zlib.deflateRawSync(data),lh=Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);lh.writeUInt32LE(body.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(nameBuf.length,26);locals.push(lh,nameBuf,body);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(8,10);ch.writeUInt32LE(body.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(nameBuf.length,28);ch.writeUInt32LE(offset,42);central.push(ch,nameBuf);
    offset+=lh.length+nameBuf.length+body.length;
  }
  const localBuf=Buffer.concat(locals),centralBuf=Buffer.concat(central),eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(Object.keys(files).length,8);eocd.writeUInt16LE(Object.keys(files).length,10);eocd.writeUInt32LE(centralBuf.length,12);eocd.writeUInt32LE(localBuf.length,16);
  return Buffer.concat([localBuf,centralBuf,eocd]);
}

// canned web: a DDG results page for search, and the ARTICLE ITSELF for fetch. (No real network.)
// The article is served on the DIRECT url, not through r.jina.ai, because that is the path a default
// install actually takes: Jina Reader is keyed now (keyless returns 401), so web_fetch only attempts it
// when a key is configured — which no default station has. This mock used to answer ONLY r.jina.ai, so the
// integration mission was silently exercising a path real users never reach.
const DDG_HTML = '<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example Article</a>' +
  '<div class="result__snippet">A great article about the answer.</div>';
const ARTICLE_HTML = '<html><body><article>The top result confirms the answer is 42.</article></body></html>';
function cannedFetch(url) {
  const u = String(url);
  if (u.indexOf('duckduckgo') >= 0) return Promise.resolve({ status: 200, text: async () => DDG_HTML });
  if (u.indexOf('r.jina.ai') >= 0) return Promise.resolve({ status: 200, text: async () => 'Title: Example\nURL Source: https://example.com/article\nMarkdown Content:\nThe top result confirms the answer is 42.' });
  if (u.indexOf('example.com/article') >= 0) {
    return Promise.resolve({ status: 200, text: async () => ARTICLE_HTML, headers: { get: (h) => (/content-type/i.test(h) ? 'text/html' : '') } });
  }
  return Promise.resolve({ status: 404, text: async () => '', headers: { get: () => '' } });
}

// the model's scripted run: search -> fetch -> write -> report. Tool names are the WIRE names the model
// would actually return (fs_write, not fs.write) — the dispatch boundary maps them back.
const fixture = {
  models: [{ id: 'replay/model', context_length: 8000, pricing: { prompt: '0.000001', completion: '0.000002' }, supportsTools: true }],
  turns: [
    [ { type: 'text', delta: 'On it, Commander — searching.' },
      { type: 'tool_start', index: 0, id: 'c1', name: 'web_search' },
      { type: 'tool_args', index: 0, chunk: '{"query":"the answer"}' },
      { type: 'usage', usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48 } },
      { type: 'done', finishReason: 'tool_calls' } ],
    [ { type: 'tool_start', index: 0, id: 'c2', name: 'web_fetch' },
      { type: 'tool_args', index: 0, chunk: '{"url":"https://example.com/article"}' },
      { type: 'usage', usage: { prompt_tokens: 60, completion_tokens: 10, total_tokens: 70 } },
      { type: 'done', finishReason: 'tool_calls' } ],
    [ { type: 'tool_start', index: 0, id: 'c3', name: 'fs_write' },
      { type: 'tool_args', index: 0, chunk: '{"path":"report.md","content":"# Report\\nThe answer is 42."}' },
      { type: 'usage', usage: { prompt_tokens: 80, completion_tokens: 12, total_tokens: 92 } },
      { type: 'done', finishReason: 'tool_calls' } ],
    [ { type: 'text', delta: 'Done, Commander. Saved report.md.' },
      { type: 'usage', usage: { prompt_tokens: 90, completion_tokens: 9, total_tokens: 99 } },
      { type: 'done', finishReason: 'stop' } ]
  ]
};

(async () => {
  const bus = A.makeBus();
  const seq = A.collectBus(bus, events.names());
  const emit = makeEmitter(bus, () => {});

  // ---- build the graph EXACTLY as sidecar/index.js does ----
  const registry = makeRegistry();
  makeWebTools({ fetchImpl: cannedFetch, lookup: null }).register(registry);
  makeBrowserTools({ driver: { navigate: async u => u, snapshot: async () => [], click: async () => '', type: async () => '', press: async k => k, scroll: async () => '', back: async () => '', getText: async () => '', consoleLog: () => [], handleDialog: async () => ({}), screenshot: async () => '' } }).register(registry);
  makeDesktopTools({ opener: async () => 'launched' }).register(registry);
  makeFsTools({ fsp, pathMod: path, root: ROOT, limits: { writeBytes: 1 << 20, readReturn: 24000 }, redact, docExtract }).register(registry);
  makeNotebookTools({ store: new Map(), clock: { now: () => 0 } }).register(registry);
  makeWidgetTools({ store: new Map(), clock: { now: () => 0 } }).register(registry);   // WIDGET RAILS Phase 2: widget.set rides the notebook (memory) grant
  makeTodoTool({ store: new Map() }).register(registry);
  makeDeliverableTool({ notes: new Map() }).register(registry);   // deliverable_note rides COMPUTER, so the full office resolves it
  makeToolSearchTool({ registry }).register(registry);   // tool.search — rides the computer object, so it is in every office
  makeCodeTools({}).register(registry);
  makeStationInspectTool({ inspect: () => ({ schemaVersion: 1 }) }).register(registry);
  makeRecallTool({ transcriptStore: makeTranscriptStore({ io: { readAll() { return []; }, append() {} }, clock: { now: () => 0 } }) }).register(registry);
  makeSkillTools({ store: makeSkillStore({ io: { readAll() { return []; }, append() {} }, clock: { now: () => 0 } }) }).register(registry);
  // QUEST V2 §B: quest.update rides the COMPUTER (the 'quest' freebie), present in this office. In-memory questStore
  // so registration + resolve mirror sidecar/index.js exactly (the drift guard below expects quest.update resolved).
  const _qFiles = new Map();
  const _qFs = {
    readFileSync(f) { if (!_qFiles.has(String(f))) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return _qFiles.get(String(f)); },
    writeFileSync(f, d) { _qFiles.set(String(f), String(d)); }, renameSync(a, b) { _qFiles.set(String(b), _qFiles.get(String(a))); _qFiles.delete(String(a)); },
    existsSync(f) { return _qFiles.has(String(f)); }, mkdirSync() {}, unlinkSync(f) { _qFiles.delete(String(f)); }, openSync() { return 1; }, fsyncSync() {}, closeSync() {}
  };
  makeQuestTools({ store: makeQuestStore({ fs: _qFs, path, workspaces: '/ws', writeDurable: ({ fs }, file, data) => fs.writeFileSync(file, data) }), clock: { now: () => 0 } }).register(registry);
  // COMMS: channel.targets / channel.send ride the placed DISH (capId 'comms'), so this office resolves them —
  // register them here for the same reason every other family is registered: the drift guard below proves the
  // CAP_REGISTRY and the tool registrations agree, and a resolved-but-unregistered tool is exactly the "dark
  // tool" bug it exists to catch. No reachable chats in a headless fixture, which is the honest empty case.
  makeCommsTools({ listTargets: () => [], sendTo: () => Promise.resolve({ ok: false, error: 'no channel in test' }) }).register(registry);
  // connectors.list rides the same placed DISH as web_request (capId 'web'). Registered with NO deps: the
  // honest empty station, which is also the case that must not pretend "you have nothing to add".
  makeConnectorTools({}).register(registry);
  // routine.notepad rides the computer on every runnable station but remains inert without a host-minted
  // scheduled cronJobId. Register the honest unwired shape so the capability/registration drift guard stays exact.
  makeRoutineTools({}).register(registry);

  const station = { agents: { agent: { id: 'agent', room: 'office' } }, rooms: { office: { id: 'office', objects: [
    { instanceId: 'pc1', objectType: 'computer' }, { instanceId: 'd1', objectType: 'dish' },
    { instanceId: 'cab1', objectType: 'cabinet' }, { instanceId: 'nb1', objectType: 'notebook' }
  ] } } };
  const resolved = resolveTools('agent', station);
  // P1.5: drive the mission through the REAL consent broker, not an allow-all stub. The mission's single
  // write (report.md) is sanctioned up-front via a session grant on its danger class (cabinet:write), so it
  // flows through the cache tier — proving a granted mutation is allowed without resorting to Full Access.
  const consent = makeConsentBroker({ sessionKey: 'itest', surface: 'autonomous' });
  consent.grant('session', { name: 'fs.write' }, registry.get('fs.write'));
  consent.grant('session', { name: 'fs.write_csv' }, registry.get('fs.write_csv'));
  consent.grant('session', { name: 'fs.write_xlsx' }, registry.get('fs.write_xlsx'));
  const capCtx = makeCapCtx(resolved, { emit, consent, timeoutMs: 5000 });

  // ---- DRIFT GUARDS (these alone would have caught both default-path showstoppers) ----
  const EXPECTED = ['browser.attach', 'browser.back', 'browser.click', 'browser.console', 'browser.detach', 'browser.dialog', 'browser.drag', 'browser.emulate', 'browser.eval', 'browser.find', 'browser.forward', 'browser.get_text', 'browser.hover', 'browser.inspect', 'browser.intercept', 'browser.login', 'browser.navigate', 'browser.network', 'browser.pdf', 'browser.press', 'browser.screenshot', 'browser.scroll', 'browser.select', 'browser.snapshot', 'browser.tab_close', 'browser.tab_select', 'browser.tabs', 'browser.type', 'browser.upload', 'browser.viewport', 'browser.vision', 'browser.wait', 'channel.send', 'channel.targets', 'code.run', 'connectors.list', 'deliverable_note', 'fs.append', 'fs.edit', 'fs.list', 'fs.patch', 'fs.profile_csv', 'fs.read', 'fs.read_csv_rows', 'fs.read_xlsx_range', 'fs.search', 'fs.write', 'fs.write_csv', 'fs.write_xlsx', 'fs.xlsx_sheets', 'notebook.feedback', 'notebook.read', 'notebook.write', 'quest.update', 'recall_conversation', 'routine.notepad', 'skill.list', 'skill.manage', 'skill.view', 'skill.write', 'station.inspect', 'todo', 'tool.search', 'web_fetch', 'web_request', 'web_search', 'widget.get', 'widget.set'];
  A.eq(resolved.tools.slice().sort(), EXPECTED.slice().sort(), 'office objects resolve to the full toolset (object=capability is real)');
  for (const name of EXPECTED) A.ok(registry.get(name), 'tool registered: ' + name);

  /* DEFERRAL IS ADVERTISING, NOT CAPABILITY: `resolved.tools` above is the full GRANT set and is what the gate
     reads, so it must still list every deferred tool. Only the wire list narrows. */
  A.ok(resolved.deferred.length > 0, 'this office defers part of its toolset');
  for (const n of resolved.deferred) A.ok(resolved.tools.indexOf(n) >= 0, 'a deferred tool is still granted: ' + n);
  A.ok(resolved.deferred.indexOf('tool.search') < 0, 'tool.search is never itself deferred — the finder cannot be the thing that must be found');
  A.ok(resolved.deferred.indexOf('browser.navigate') < 0, 'the core browsing path stays advertised');
  // Measured with real models (2026-07-26): deferring browser.screenshot made gpt-4.1-mini report a
  // screenshot it never took. A headline capability the model may CLAIM to have performed stays advertised;
  // only the specialist tail is deferred.
  A.ok(resolved.deferred.indexOf('browser.screenshot') < 0, 'a headline capability is never deferred (fabrication risk)');
  A.ok(resolved.deferred.indexOf('browser.vision') < 0, 'nor the other half of "look at the page"');
  A.ok(resolved.deferred.indexOf('browser.network') >= 0, 'the specialist tail IS deferred');
  A.ok(resolved.deferred.indexOf('browser.upload') >= 0, 'and so is the rest of it');

  const deferredNames = new Set(resolved.deferred);
  const coreNames = resolved.tools.filter(n => !deferredNames.has(n));
  const toolDefs = registry.wireFormat(registry.list(new Set(coreNames)));
  const deferredToolDefs = registry.wireFormat(registry.list(deferredNames));
  A.ok(toolDefs.length < resolved.tools.length, 'the advertised list is smaller than the granted list');
  const fromWire = new Map();
  // BOTH lists translate: a revealed tool still has to carry a provider-legal name.
  for (const d of toolDefs.concat(deferredToolDefs)) { const real = d.function.name; const w = real.replace(/\./g, '_'); fromWire.set(w, real); d.function.name = w; }
  for (const d of toolDefs.concat(deferredToolDefs)) A.ok(/^[A-Za-z0-9_-]{1,64}$/.test(d.function.name), 'wire tool name is provider-legal: ' + d.function.name);

  const dispatch = async (c, ctx) => {
    if (fromWire.has(c.name)) c = Object.assign({}, c, { name: fromWire.get(c.name) });
    return registry.dispatch(c, ctx);
  };

  // ---- run the mission ----
  const provider = makeReplayProvider(fixture);
  const cost = makeCostEngine({ priceOf: provider.priceOf });
  const res = await runAgentLoop({
    messages: [{ role: 'user', content: 'find the answer and write report.md' }],
    provider, emit, cost, tools: toolDefs, dispatch, capCtx,
    model: 'replay/model', agentId: 'agent', runId: 'itest',
    limits: { maxIters: 8, maxCostUsd: 1 }, clock: { now: () => 0 }
  });

  // ---- assert the agent actually ACTED ----
  A.eq(res.reason, 'done', 'multi-step mission ends done');
  A.eq(provider.callCount(), 4, 'four model turns (search, fetch, write, report)');

  const calls = seq.filter(e => e.name === 'agent.tool_call').map(e => e.payload.name);
  A.eq(calls, ['web_search', 'web_fetch', 'fs_write'], 'tools called in order (wire names)');

  const tr = seq.filter(e => e.name === 'agent.tool_result').map(e => e.payload);
  A.eq(tr.length, 3, 'exactly one result per call (pairing held)');
  A.ok(tr.every(r => r.isError === false), 'every tool succeeded — no 400, no capdenied, no jail/SSRF block');
  A.ok(seq.find(e => e.name === 'agent.run.error') === undefined, 'no run error across the whole multi-tool run');

  const dl = seq.find(e => e.name === 'deliverable');
  A.ok(dl && dl.payload.kind === 'file' && dl.payload.title === 'report.md', 'fs.write produced a deliverable');

  const onDisk = await fsp.readFile(path.join(ROOT, 'agent', 'report.md'), 'utf8');
  A.ok(/answer is 42/.test(onDisk), 'the report was REALLY written into the agent workspace on disk');

  A.ok(seq.filter(e => e.name === 'agent.token').some(e => /Saved report\.md/.test(e.payload.delta)), 'the final answer streamed to the user');

  // Decision-dossier acceptance fixture: real registry, permissions, loop and disk; scripted model/web.
  // This proves execution plumbing, not research quality or a live provider acceptance.
  {
    const recipe = require('../frontend/app/recipe-catalog/research.js').find(r => r.id === 'decision-dossier');
    const task = require('../frontend/app/recipes.js').fillTask(recipe, { question: 'Compare the fixture options', constraints: 'Use only observed evidence', workspace: 'dossier' });
    A.ok(/save the four deliverables in this order: sources\.md, comparison\.csv, decision\.md, progress\.md/i.test(task), 'dossier recipe prioritizes the complete artifact set in a fixed order');
    A.ok(/instead of reopening research merely to make a file look complete/i.test(task), 'remaining gaps are recorded without repeating research for cosmetic completeness');
    const outputs = {
      'sources.md': '# Sources\nhttps://example.com/article\nClaim: the fixture answer is 42. Checked: 2026-10-04. Publication date: unknown.\n',
      'comparison.csv': 'option,criterion,evidence,source,uncertainty,fit\nA,answer,42,https://example.com/article,fixture only,meets\nB,answer,unknown,,no evidence,unknown\n',
      'decision.md': '# Decision\nPrefer A in this fixture because the source reports 42. B is unknown.\nConfidence is limited to the fixture. Next reversible step: verify with a real primary source.\n',
      'progress.md': '# Progress\nSource recorded; comparison and decision saved. Real-world verification remains open.\n'
    };
    const turn = (id, name, args) => [
      { type: 'tool_start', index: 0, id, name }, { type: 'tool_args', index: 0, chunk: JSON.stringify(args) }, { type: 'done', finishReason: 'tool_calls' }
    ];
    const turns = [turn('ds', 'web_search', { query: 'the answer' }), turn('df', 'web_fetch', { url: 'https://example.com/article' })];
    for (const [name, content] of Object.entries(outputs)) turns.push(turn('write-' + name, 'fs_write', { path: 'dossier/' + name, content }));
    for (const name of Object.keys(outputs)) turns.push(turn('read-' + name, 'fs_read', { path: 'dossier/' + name }));
    turns.push([{ type: 'text', delta: 'Fixture dossier saved and read back; live acceptance remains unverified.' }, { type: 'done', finishReason: 'stop' }]);
    const db = A.makeBus(), ds = A.collectBus(db, events.names()), de = makeEmitter(db, () => {});
    const dp = makeReplayProvider({ models: fixture.models, turns });
    const journalDir = path.join(ROOT, 'dossier-journal');
    const journal = require('../sidecar/run-journal.js').makeRunJournal({ dir: journalDir });
    journal.begin({ runId: 'dossier-fixture', agentId: 'agent' });
    const result = await runAgentLoop({ messages: [{ role: 'user', content: task }], provider: dp, emit: de,
      cost: makeCostEngine({ priceOf: dp.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId: 'agent', runId: 'dossier-fixture',
      onCheckpoint({ phase, messages, turn }) { journal.checkpointMessages('dossier-fixture', { phase, messages, turn }); },
      limits: { maxIters: 15, maxCostUsd: 1 }, clock: { now: () => 0 }
    });
    A.eq(result.reason, 'done', 'decision dossier completes through the shared execution path');
    const results = ds.filter(e => e.name === 'agent.tool_result').map(e => e.payload);
    A.eq(results.length, 10, 'search, fetch, four writes and four read-backs have paired results');
    A.ok(results.every(r => r.isError === false), 'all dossier tool operations succeed');
    for (const [name, content] of Object.entries(outputs)) A.eq(await fsp.readFile(path.join(ROOT, 'agent', 'dossier', name), 'utf8'), content, 'dossier file is really persisted: ' + name);
    const restored = require('../sidecar/run-journal.js').makeRunJournal({ dir: journalDir }).inspect('dossier-fixture');
    A.eq(restored.corrupt, false, 'cold journal inspection reconstructs dossier checkpoints');
    for (const content of Object.values(outputs)) A.ok(restored.checkpoint.messages.some(m => m.role === 'tool' && String(m.content).includes(content.trim())), 'read-back evidence survives a fresh journal instance');
  }

  // CSV data-explanation acceptance fixture: real tool registry/capability/consent, bounded input,
  // paged rows, redaction, two saved artifacts, and independent read-back on the normal agent loop.
  {
    const dataDir = path.join(ROOT, 'agent', 'analysis');
    await fsp.mkdir(dataDir, { recursive: true });
    const csvPath = path.join(ROOT, 'agent', 'sales.csv');
    const csvBytes = Buffer.from('region,amount,note,credential\nNorth,10,first,password=fixture-sensitive-value\nSouth,20,"two\nlines",none\nNorth,30,"=SUM(1,2)",none\n');
    await fsp.writeFile(csvPath, csvBytes);
    const csvStat = await fsp.stat(csvPath);
    const taskRecipe = require('../frontend/app/recipe-catalog/data.js').find(r => r.id === 'data-explain');
    const task = require('../frontend/app/recipes.js').fillTask(taskRecipe, {
      file: 'sales.csv', question: 'Which region has the most revenue?', workspace: 'analysis'
    });
    const turns = [];
    const tool = (id, name, args) => turns.push([
      { type: 'tool_start', index: 0, id, name },
      { type: 'tool_args', index: 0, chunk: JSON.stringify(args) },
      { type: 'done', finishReason: 'tool_calls' }
    ]);
    tool('profile-csv', 'fs_profile_csv', { path: 'sales.csv', delimiter: ',', hasHeader: true, maxRows: 2 });
    tool('rows-1', 'fs_read_csv_rows', { path: 'sales.csv', delimiter: ',', hasHeader: true, offset: 0, limit: 2 });
    tool('rows-2', 'fs_read_csv_rows', { path: 'sales.csv', delimiter: ',', hasHeader: true, offset: 2, limit: 2 });
    tool('choose-output-folder', 'fs_list', { path: 'analysis' });
    const report = '# Dataset brief\n\nSource: sales.csv; bytes: ' + csvStat.size + '; last modified: ' + csvStat.mtime.toISOString() + '. Profile is PARTIAL: exactly the first 2 data rows were profiled, so these are not whole-file totals. Finite IEEE-754 binary64 values; decimal summaries are approximate and integers outside the safe range may be rounded. The row review covered source rows 1-3 in pages 1-2. Credential-shaped content was scrubbed by StarNet’s configured key-pattern redactor; this is not general PII detection. The quoted multiline field stayed on one logical row and the formula-looking value remained inert. North has $40 and South $20 in this three-row fixture. This describes the fixture data only, not a causal or population claim.\n';
    const findings = 'finding,evidence_range,observed_evidence,interpretation,confidence\r\nRevenue by region,rows 1-3,North 10+30; South 20,North is highest in the complete row review,high within this fixture\r\nCoverage,profile rows 1-2,profile status partial,Profile totals describe only the first two rows,high\r\n';
    tool('write-report', 'fs_write', { path: 'analysis/dataset-brief-fixture/report.md', content: report });
    tool('write-findings', 'fs_write_csv', { path: 'analysis/dataset-brief-fixture/findings.csv', columns: ['finding','evidence_range','observed_evidence','interpretation','confidence'], rows: [['Revenue by region','rows 1-3','North 10+30; South 20','North is highest in the complete row review','high within this fixture'],['Coverage','profile rows 1-2','profile status partial','Profile totals describe only the first two rows','high']] });
    tool('read-report', 'fs_read', { path: 'analysis/dataset-brief-fixture/report.md' });
    tool('read-findings', 'fs_read', { path: 'analysis/dataset-brief-fixture/findings.csv' });
    turns.push([{ type: 'text', delta: 'Fixture analysis saved and both files read back. The profile covers only rows 1-2; all three data rows were reviewed.' }, { type: 'done', finishReason: 'stop' }]);

    const eb = A.makeBus(), es = A.collectBus(eb, events.names()), ee = makeEmitter(eb, () => {});
    const ep = makeReplayProvider({ models: fixture.models, turns });
    const dispatched = [];
    const dataDispatch = async (call, ctx) => {
      const result = await dispatch(call, ctx);
      dispatched.push({ call, result });
      return result;
    };
    const er = await runAgentLoop({
      messages: [{ role: 'user', content: task }], provider: ep, emit: ee,
      cost: makeCostEngine({ priceOf: ep.priceOf }), tools: toolDefs, dispatch: dataDispatch, capCtx,
      model: 'replay/model', agentId: 'agent', runId: 'csv-explain-fixture',
      limits: { maxIters: 12, maxCostUsd: 1 }, clock: { now: () => 0 }
    });
    A.eq(er.reason, 'done', 'dataset workflow completes through the shared execution path');
    const calls = es.filter(e => e.name === 'agent.tool_call').map(e => e.payload.name);
    A.eq(calls, ['fs_profile_csv','fs_read_csv_rows','fs_read_csv_rows','fs_list','fs_write','fs_write_csv','fs_read','fs_read'],
      'workflow profiles, pages rows, checks output folder, saves both files and reads both back');
    const results = dispatched.map(entry => entry.result);
    const csvProfile = JSON.parse(dispatched[0].result.content);
    A.eq(csvProfile.source.bytes, csvStat.size, 'report fixture captures the exact source byte count');
    A.eq(csvProfile.source.lastModified, csvStat.mtime.toISOString(), 'report fixture captures the source timestamp returned by the tool');
    A.ok(report.includes(csvProfile.numericSemantics), 'saved report preserves the exact numeric approximation caveat from the profiler');
    A.ok(report.includes('Source: ' + csvProfile.source.path + '; bytes: ' + csvProfile.source.bytes + '; last modified: ' + csvProfile.source.lastModified), 'saved report metadata matches the actual tool provenance');
    A.eq(results.length, calls.length, 'each dataset workflow action has a paired result');
    A.ok(results.every(r => r.isError === false), 'all dataset workflow tool calls succeed');
    A.ok(results.some(r => /"status":"partial"/.test(r.content || '')), 'fixture exercises and exposes an actual partial CSV profile');
    A.ok(!results.some(r => /fixture-sensitive-value/.test(r.content || '')), 'CSV row output scrubs key-shaped secrets with the shared production redactor');
    A.ok(results.some(r => (r.content || '').includes('[redacted-secret]')), 'row pages contain the configured redaction result');
    const firstCsvPage = JSON.parse(dispatched[1].result.content);
    const secondCsvPage = JSON.parse(dispatched[2].result.content);
    A.eq(firstCsvPage.rows[1][2], 'two\nlines', 'quoted newline stays inside one logical CSV cell');
    A.eq(secondCsvPage.rows[0][2], '=SUM(1,2)', 'formula-like input remains an inert string');
    A.eq(await fsp.readFile(csvPath), csvBytes, 'source dataset remains byte-for-byte unchanged');
    A.eq(await fsp.readFile(path.join(dataDir, 'dataset-brief-fixture', 'report.md'), 'utf8'), report, 'report artifact is persisted exactly');
    A.eq(await fsp.readFile(path.join(dataDir, 'dataset-brief-fixture', 'findings.csv'), 'utf8'), findings, 'structured findings artifact is persisted exactly');
    A.ok(results.some(r => (r.content || '').includes('PARTIAL: exactly the first 2 data rows')), 'read-back tool returns the explicit partial coverage caveat');
    A.ok(results.some(r => (r.content || '').includes('Revenue by region,rows 1-3')), 'read-back tool returns the structured findings artifact');
  }

  // XLSX Explain This Data: actual cabinet capability, redacted metadata/cells, bounded pages, consented
  // saved outputs/read-back, an unchanged source, jailed path denial, and no read-side freshness refresh.
  {
    const bytes=zipFixture({
      'xl/workbook.xml':'<workbook><sheets><sheet name="sk-or-v1-abcdef0123456789abcdef0123456789" sheetId="sk-or-v1-abcdef0123456789abcdef0123456789" state="hidden" r:id="r1"/><sheet name="Other" sheetId="2" state="visible" r:id="r2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>',
      'xl/sharedStrings.xml':'<sst><si><t>Region</t></si><si><t>Amount</t></si><si><t>North</t></si><si><t>South</t></si></sst>',
      'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>credential</t></is></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>10</v></c><c r="C2" t="inlineStr"><is><t>sk-or-v1-abcdef0123456789abcdef0123456789</t></is></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><f>10+10</f><v>20</v></c></row></sheetData></worksheet>',
      'xl/worksheets/sheet2.xml':'<worksheet><sheetData><row r="1"><c r="A1"><v>99</v></c></row></sheetData></worksheet>'
    });
    const source=path.join(ROOT,'agent','survey.xlsx'); await fsp.writeFile(source,bytes); const stat=await fsp.stat(source);
    const recipe=require('../frontend/app/recipe-catalog/data.js').find(r=>r.id==='data-explain');
    const task=require('../frontend/app/recipes.js').fillTask(recipe,{file:'survey.xlsx',question:'Which region has the higher amount?',workspace:'analysis'});
    const turns=[],tool=(id,name,args)=>turns.push([{type:'tool_start',index:0,id,name},{type:'tool_args',index:0,chunk:JSON.stringify(args)},{type:'done',finishReason:'tool_calls'}]);
    tool('xlsx-sheets','fs_xlsx_sheets',{path:'survey.xlsx'});
    tool('xlsx-page-1','fs_read_xlsx_range',{path:'survey.xlsx',sheetIndex:0,startRow:1,rowCount:2,startCol:1,colCount:3});
    tool('xlsx-page-2','fs_read_xlsx_range',{path:'survey.xlsx',sheetIndex:0,startRow:3,rowCount:2,startCol:1,colCount:3});
    tool('xlsx-output-folder','fs_list',{path:'analysis'});
    const report='# Workbook findings\n\nSource: survey.xlsx; bytes: '+stat.size+'; modified: '+stat.mtime.toISOString()+'. Selected sheetIndex 0; its returned name was redacted. Rows 1-3 show North 10 and South 20 from stored cells. The formula cache for South is present but unverified and may be stale. A credential-shaped cell was redacted; no sensitive-data scan was performed. This fixture does not establish causation.\n';
    const findings='finding,evidence_range,observed_evidence,interpretation,confidence\r\nHigher amount,rows 1-3,North 10; South cached 20,South is higher in the observed fixture,medium because its cache is unverified\r\n';
    tool('xlsx-report','fs_write',{path:'analysis/xlsx-fixture/report.md',content:report});
    tool('xlsx-findings','fs_write_csv',{path:'analysis/xlsx-fixture/findings.csv',columns:['finding','evidence_range','observed_evidence','interpretation','confidence'],rows:[['Higher amount','rows 1-3','North 10; South cached 20','South is higher in the observed fixture','medium because its cache is unverified']]});
    tool('xlsx-read-report','fs_read',{path:'analysis/xlsx-fixture/report.md'}); tool('xlsx-read-findings','fs_read',{path:'analysis/xlsx-fixture/findings.csv'});
    turns.push([{type:'text',delta:'Workbook pages reviewed; report and findings saved and read back.'},{type:'done',finishReason:'stop'}]);
    const eb=A.makeBus(),es=A.collectBus(eb,events.names()),ee=makeEmitter(eb,()=>{}),ep=makeReplayProvider({models:fixture.models,turns}),results=[];
    const er=await runAgentLoop({messages:[{role:'user',content:task}],provider:ep,emit:ee,cost:makeCostEngine({priceOf:ep.priceOf}),tools:toolDefs,dispatch:async(c,ctx)=>{const r=await dispatch(c,ctx);results.push({call:c,result:r});return r;},capCtx,model:'replay/model',agentId:'agent',runId:'xlsx-explain-fixture',limits:{maxIters:12,maxCostUsd:1},clock:{now:()=>0}});
    A.eq(er.reason,'done','XLSX data workflow completes through the shared agent loop');
    A.eq(es.filter(e=>e.name==='agent.tool_call').map(e=>e.payload.name),['fs_xlsx_sheets','fs_read_xlsx_range','fs_read_xlsx_range','fs_list','fs_write','fs_write_csv','fs_read','fs_read'], 'recipe run discovers sheets, pages cells, saves both artifacts and reads them back');
    A.ok(results.every(x=>!x.result.isError),'all XLSX recipe tools complete successfully');
    const sheetListing=JSON.parse(results[0].result.content),page1=JSON.parse(results[1].result.content),page2=JSON.parse(results[2].result.content);
    A.eq(sheetListing.sheets[0].name,'[redacted-key]','production redactor is applied to workbook sheet names');
    A.eq(sheetListing.sheets[0].state,'hidden','hidden sheet state remains visible when not sensitive');
    A.ok(!JSON.stringify(sheetListing).includes('sk-or-v1-abcdef0123456789abcdef0123456789'),'workbook listing does not leak raw name or sheetId');
    A.eq(page1.rows[1].cells[2].value,'[redacted-key]','production redactor is applied to XLSX cell content');
    A.eq(page2.rows[0].cells[1].formulaCache,'present_unverified','formula cache confidence is explicit in real tool output');
    A.ok(!results.some(x=>String(x.result.content).includes('sk-or-v1-abcdef0123456789abcdef0123456789')),'credential-shaped XLSX value never appears in tool output');
    A.eq(await fsp.readFile(source),bytes,'XLSX recipe leaves original source bytes unchanged');
    A.eq(await fsp.readFile(path.join(ROOT,'agent','analysis','xlsx-fixture','report.md'),'utf8'),report,'XLSX recipe report is saved exactly');
    A.eq(await fsp.readFile(path.join(ROOT,'agent','analysis','xlsx-fixture','findings.csv'),'utf8'),findings,'XLSX structured findings are saved exactly');
    const denied=await dispatch({name:'fs.xlsx_sheets',args:{path:'../outside.xlsx'}},capCtx);
    A.eq(denied.isError,true,'XLSX path traversal outside the agent jail is denied');
    const freshness=path.join(ROOT,'agent','freshness.xlsx'); await fsp.writeFile(freshness,bytes);
    const seen=await dispatch({name:'fs.xlsx_sheets',args:{path:'freshness.xlsx'}},capCtx); A.eq(seen.isError,false,'XLSX metadata read succeeds');
    await fsp.writeFile(freshness,'external replacement');
    const overwrite=await dispatch({name:'fs.write',args:{path:'freshness.xlsx',content:'authorized fixture replacement'}},capCtx);
    A.eq(overwrite.isError,false,'read-only XLSX access does not refresh overwrite freshness stamps');
  }

  // ---- P1.5 default-deny: an UN-granted mutation under an autonomous surface is denied, body never runs ----
  // (a fresh broker with no grant — the same fs.write the model is fully capable of calling otherwise.)
  const denyCtx = makeCapCtx(resolved, { emit, consent: makeConsentBroker({ sessionKey: 'deny', surface: 'autonomous' }), timeoutMs: 5000 });
  const denied = await dispatch({ name: 'fs_write', args: { path: 'unsanctioned.md', content: 'nope' } }, denyCtx);
  A.eq(denied.isError, true, 'un-granted mutation default-denies');
  const deniedCsv = await dispatch({ name: 'fs_write_csv', args: { path: 'unsanctioned.csv', columns: ['x'], rows: [['=1+1']] } }, denyCtx);
  A.eq(deniedCsv.isError, true, 'un-granted structured CSV mutation default-denies');
  const deniedXlsx = await dispatch({ name: 'fs_write_xlsx', args: { path: 'unsanctioned.xlsx', columns: ['x'], rows: [['value']] } }, denyCtx);
  A.eq(deniedXlsx.isError, true, 'un-granted structured XLSX mutation default-denies');
  let csvWrote = true; try { await fsp.access(path.join(ROOT, 'agent', 'unsanctioned.csv')); } catch (e) { csvWrote = false; }
  A.ok(!csvWrote, 'the denied CSV mutation never touched disk');
  let xlsxWrote = true; try { await fsp.access(path.join(ROOT, 'agent', 'unsanctioned.xlsx')); } catch (e) { xlsxWrote = false; }
  A.ok(!xlsxWrote, 'the denied XLSX mutation never touched disk');
  const grantedXlsx = await dispatch({ name: 'fs_write_xlsx', args: { path: 'analysis/approved.xlsx', columns: ['x'], rows: [['consented']] } }, capCtx);
  A.eq(grantedXlsx.isError, false, 'session-granted XLSX mutation succeeds through the real capability/consent boundary');
  A.eq(grantedXlsx.receipt.state, 'read-back-verified', 'granted XLSX write retains the verified mutation receipt');
  A.ok((await fsp.stat(path.join(ROOT, 'agent', 'analysis', 'approved.xlsx'))).size === grantedXlsx.receipt.verifiedBytes,
    'granted XLSX lands inside the agent workspace with the receipted byte count');
  A.eq(denied.summary, 'denied', 'denial surfaced as a consent denial, not a crash');
  A.ok(/silence is not consent/.test(denied.content), 'denial carries the silence-is-not-consent reason');
  let wrote = true; try { await fsp.access(path.join(ROOT, 'agent', 'unsanctioned.md')); } catch (e) { wrote = false; }
  A.ok(!wrote, 'the denied write never touched disk (no action on deny)');

  // ---- Cortex (M-mem.3): the recalled-memory injection the host performs before a run. Mirrors index.js's
  //      composition exactly — RANK the notebook by relevance to THIS message (BM25 + recency/trust/pin),
  //      surface the top few as a fence before the user message, and emit memory.used per surfaced record.
  //      An empty notebook is byte-identical (the memoryless run is unchanged). ----
  {
    const notes = [{ id: 'note_1', title: 'API base', body: 'openrouter.ai/api/v1', ts: 1 },
                   { id: 'note_2', title: 'User tz', body: 'PST timezone', ts: 2 }];
    const convo = [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'what is the api base url again?' }];
    const ranked = rank(notes, 'what is the api base url again?', { now: 100 });
    A.eq(ranked[0].id, 'note_1', 'M-mem.3: the query-relevant note ranks first');
    A.eq(ranked.length, 1, 'relevance floor: the zero-overlap note is DROPPED under a real query (no off-topic padding)');
    const r = renderRecall(ranked, { limit: 1500 });
    A.eq(r.count, 1, 'only the relevant note is recalled');
    A.ok(r.text.indexOf('API base') >= 0 && r.text.indexOf('User tz') === -1, "recall surfaces the relevant note and withholds the off-topic one");
    const withMem = injectRecall(convo, r.text);
    A.eq(withMem.length, 3, 'recall adds exactly one system note');
    A.eq(withMem[2], convo[1], 'fence sits immediately before the newest user message');
    A.ok(withMem[1].role === 'system' && /recalled-memory/.test(withMem[1].content), 'fence is a system note');
    // index.js emits memory.used for the ids renderRecall actually SURFACED (excludes blocked/skipped) — mirror it
    A.eq(JSON.stringify(r.usedIds), JSON.stringify(['note_1']),
      'memory.used fires for each surfaced record (driven by renderRecall.usedIds, not positional ranked[i])');
    const empty = injectRecall(convo, renderRecall(rank([], 'q', { now: 0 }), {}).text);
    A.eq(JSON.stringify(empty), JSON.stringify(convo), 'empty notebook -> byte-identical messages (memoryless run unchanged)');
  }

  // ---- Lane 5 (truthful telemetry): a PROVIDER-TRUNCATED reply must surface finishReason on BOTH the return
  //      value (index.js gates reflection/study/skills on it) AND the emitted agent.run.end event (the frontend
  //      renders a "cut short" recap instead of a delivered crate). A clean 'stop' still omits it. ----
  {
    const cutBus = A.makeBus();
    const cutSeq = A.collectBus(cutBus, events.names());
    const cutEmit = makeEmitter(cutBus, () => {});
    // Explicit opt-out preserves the cut-short telemetry contract for a host that disables semantic continuation.
    const cutProvider = makeReplayProvider({
      models: fixture.models,
      turns: [[ { type: 'text', delta: 'The answer begins but is cut o' },
                { type: 'usage', usage: { prompt_tokens: 30, completion_tokens: 7, total_tokens: 37 } },
                { type: 'done', finishReason: 'length' } ]]
    });
    const cutCost = makeCostEngine({ priceOf: cutProvider.priceOf });
    const cutRes = await runAgentLoop({
      messages: [{ role: 'user', content: 'write me a long essay' }],
      provider: cutProvider, emit: cutEmit, cost: cutCost, tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId: 'agent', runId: 'cut1',
      limits: { maxIters: 8, maxCostUsd: 1, outputContinuation: false }, clock: { now: () => 0 }
    });
    A.eq(cutRes.reason, 'done', 'a truncated turn with prose still ends reason:done (not a new run-end reason)');
    A.eq(cutRes.finishReason, 'length', 'finishReason:length rides the RETURN value (index.js reflection gate)');
    const cutEnd = cutSeq.find(e => e.name === 'agent.run.end' && e.payload.runId === 'cut1');
    A.ok(cutEnd, 'agent.run.end emitted for the truncated run');
    A.eq(cutEnd.payload.finishReason, 'length', 'finishReason:length rides the EMITTED event too (the frontend reads it)');
    A.ok(events.validate('agent.run.end', cutEnd.payload).ok, 'the finishReason-carrying run-end payload is still schema-valid');
    // a CLEAN stop omits finishReason entirely (old clean-run payloads stay byte-identical).
    const cleanEnd = seq.find(e => e.name === 'agent.run.end' && e.payload.runId === 'itest');
    A.ok(cleanEnd && cleanEnd.payload.finishReason === undefined, 'a clean run omits finishReason (additive, not always-on)');
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (e) {}
  A.report('harness.integration.test');
})();
