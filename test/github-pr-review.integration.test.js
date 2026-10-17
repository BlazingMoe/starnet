/* node test/github-pr-review.integration.test.js — PR Sweep through the real MCP manager/registry/consent/loop path.
   All GitHub and model responses are scripted; this proves connector plumbing and report read-back only,
   never an authenticated GitHub account or review quality. */
'use strict';
const A = require('./_assert.js');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const events = require('../shared/events.js');
const { makeEmitter } = require('../shared/emitter.js');
const { makeReplayProvider } = require('../sidecar/providers/replay.js');
const { makeCostEngine } = require('../sidecar/cost.js');
const { runAgentLoop } = require('../sidecar/loop.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { makeConnectorManager } = require('../sidecar/mcp/manager.js');
const PrSweepPolicy = require('../sidecar/mcp/pr-sweep-policy.js');
const connectorCatalog = require('../sidecar/mcp/catalog.js');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { makeToolSearchTool } = require('../sidecar/tools/builtin/toolsearch.js');
const { makeConsentBroker } = require('../sidecar/permissions.js');
const { resolveTools } = require('../sidecar/capability/resolve.js');
const { makeCapCtx } = require('../sidecar/capability/capGate.js');
const { makeRunAuthority } = require('../sidecar/inputpolicy.js');
const { redact } = require('../sidecar/context.js');
const recipe = require('../frontend/app/recipe-catalog/dev.js').find(r => r.id === 'pr-sweep');
const ROOT = path.join(os.tmpdir(), 'starnet-github-review-' + process.pid);
const MODELS = [{ id: 'replay/model', context_length: 12000, pricing: { prompt: '0', completion: '0' }, supportsTools: true }];
const REPORT_ROOT = 'github-pr-review';
const RUN_REPORT_DIR = REPORT_ROOT + '/run-20261011-125002-a9f3';
const PRIOR_REPORT = '# Earlier review\\nKeep this immutable.';
const PRS = [{ number: 17, title: 'Validate import rows before replacing saved records', state: 'open', created_at: '2026-10-01T10:00:00Z', html_url: 'https://github.example/acme/app/pull/17', body: 'Validation change.' }];
const DIFF = 'diff --git a/import.js b/import.js\n@@ -4,1 +4,3 @@\n+if (!row.id) throw new Error("missing id");\n+await replaceRecords(rows);\n';

function mcpTool(name, properties, required, description, readOnlyHint) {
  return { name, description, annotations: { readOnlyHint: readOnlyHint !== false }, inputSchema: { type: 'object', required, properties } };
}
async function runCase(mode) {
  const registry = makeRegistry();
  const agentRoot = path.join(ROOT, mode, 'workspaces');
  const connectorCalls = [];
  if (mode !== 'unavailable') {
    const priorDir = path.join(agentRoot, 'agent', REPORT_ROOT, 'prior-run');
    await fsp.mkdir(priorDir, { recursive: true });
    await fsp.writeFile(path.join(priorDir, 'review.md'), PRIOR_REPORT);
  }
  const objects = [{ instanceId: 'pc', objectType: 'computer' }, { instanceId: 'cab', objectType: 'cabinet' }];
  if (mode !== 'unavailable' && mode !== 'full-access-only') objects.push({ instanceId: 'github-ro', objectType: 'connector', connectorId: 'github-readonly' });
  if (mode === 'full-access-only' || mode === 'both') objects.push({ instanceId: 'github-full', objectType: 'connector', connectorId: 'github' });
  const manager = makeConnectorManager({
    makeTransport: () => ({ send() {}, onMessage() {}, close() {} }),
    makeClient: () => ({
      initialize: async () => ({ serverInfo: { name: 'fixture-github-mcp' } }),
      listTools: async () => [
        mcpTool('list_pull_requests', { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string' }, page: { type: 'number' }, perPage: { type: 'number' } }, ['owner', 'repo'], 'List pull requests.', mode !== 'not-readonly'),
        mcpTool('pull_request_read', { owner: { type: 'string' }, repo: { type: 'string' }, pullNumber: { type: 'number' }, method: { type: 'string' } }, ['owner', 'repo', 'pullNumber', 'method'], 'Read pull request details, files or diff.', mode !== 'not-readonly')
      ],
      callTool: async (name, args) => {
        connectorCalls.push({ name, args });
        if (name === 'list_pull_requests') return { content: [{ type: 'text', text: JSON.stringify(PRS) }] };
        if (name === 'pull_request_read' && args.method === 'get_files') return { content: [{ type: 'text', text: JSON.stringify([{ filename: 'import.js', status: 'modified', additions: 2, deletions: 0 }]) }] };
        if (name === 'pull_request_read' && args.method === 'get_diff' && (mode === 'connected' || mode === 'both')) return { content: [{ type: 'text', text: DIFF }] };
        if (name === 'pull_request_read' && args.method === 'get_diff') return { isError: true, content: [{ type: 'text', text: 'fixture diff unavailable' }] };
        return { isError: true, content: [{ type: 'text', text: 'unavailable fixture method' }] };
      },
      close() {}, isClosed: () => false
    })
  });
  try {
    let githubDefs = [];
    if (mode !== 'unavailable') {
      if (mode !== 'full-access-only') {
        const url = mode === 'wrong-endpoint' ? 'https://example.invalid/mcp' : connectorCatalog.installConfig('github-readonly').url;
        const connected = await manager.configure('github-readonly', { url, token: 'fixture-token', label: 'GitHub (read-only)' });
        A.eq(connected.state, 'up', mode + ': fixture read-only GitHub connector initializes');
      }
      if (mode === 'full-access-only' || mode === 'both') {
        const full = await manager.configure('github', { url: connectorCatalog.installConfig('github').url, token: 'fixture-token', label: 'GitHub' });
        A.eq(full.state, 'up', mode + ': fixture full-access GitHub connector initializes');
      }
    }
    const allDefs = manager.toolDefsForObjects(objects);
    const selected = PrSweepPolicy.selectTools(manager, objects, allDefs);
    if (mode === 'unavailable') {
      A.eq(selected.ok, false, 'unavailable: recipe readiness refuses remote review');
      A.ok(/Connectors catalog/.test(selected.error), 'unavailable: refusal explains the connector setup path');
      A.eq(selected.tools.length, 0, 'unavailable: no GitHub connector tools are exposed');
      A.eq(connectorCalls.length, 0, 'unavailable: no remote connector calls occur');
      return;
    }
    if (mode === 'wrong-endpoint' || mode === 'not-readonly') {
      A.eq(selected.ok, false, mode + ': readiness rejects an endpoint or tool without read-only proof');
      A.ok(/read-only/.test(selected.error), mode + ': refusal explains read-only readiness failure');
      A.eq(selected.tools.length, 0, mode + ': no connector tools are exposed');
      A.eq(connectorCalls.length, 0, mode + ': no connector call is made');
      A.ok(!(await fsp.stat(path.join(agentRoot, 'agent', RUN_REPORT_DIR)).catch(() => null)), mode + ': no run report is fabricated');
      return;
    }
    if (mode !== 'unavailable') {
      if (mode === 'full-access-only') {
        A.eq(selected.ok, false, 'full-access-only: recipe readiness refuses remote review');
        A.ok(/Connectors catalog/.test(selected.error) && /GitHub \(read-only\)/.test(selected.error), 'full-access-only: refusal explains the exact connector and setup path');
        A.eq(selected.tools.length, 0, 'full-access-only: no GitHub connector tools are exposed');
        A.eq(connectorCalls.length, 0, 'full-access-only: no remote connector calls occur before the unavailable result');
        A.ok(!(await fsp.stat(path.join(agentRoot, 'agent', RUN_REPORT_DIR)).catch(() => null)), 'full-access-only: no run report is fabricated');
        return;
      }
      githubDefs = selected.tools;
      A.eq(githubDefs.map(d => d.name).sort(), ['mcp__github-readonly__list_pull_requests', 'mcp__github-readonly__pull_request_read'], mode + ': only the two advertised read-only tools are projected');
      A.ok(githubDefs.every(d => d.requiresConsent && d.readOnly), mode + ': external MCP reads still require explicit consent');
      if (mode === 'both') {
        A.ok(allDefs.some(d => /^mcp__github__/.test(d.name)), 'both: full-access GitHub tools were available before PR Sweep selection');
        A.ok(githubDefs.every(d => !/^mcp__github__/.test(d.name)), 'both: full-access tools are excluded from PR Sweep');
        let rejectedMethod = false, rejectedPage = false, rejectedMissingLimit = false, rejectedNan = false, rejectedFraction = false;
        try { await githubDefs.find(d => d.name === 'mcp__github-readonly__pull_request_read').run({ owner: 'acme', repo: 'app', pullNumber: 17, method: 'get_reviews' }); }
        catch (_) { rejectedMethod = true; }
        try { await githubDefs.find(d => d.name === 'mcp__github-readonly__list_pull_requests').run({ owner: 'acme', repo: 'app', state: 'all', page: 2, perPage: 100 }); }
        catch (_) { rejectedPage = true; }
        try { await githubDefs.find(d => d.name === 'mcp__github-readonly__list_pull_requests').run({ owner: 'acme', repo: 'app', state: 'open', page: 1 }); }
        catch (_) { rejectedMissingLimit = true; }
        try { await githubDefs.find(d => d.name === 'mcp__github-readonly__list_pull_requests').run({ owner: 'acme', repo: 'app', state: 'open', page: 1, perPage: NaN }); }
        catch (_) { rejectedNan = true; }
        try { await githubDefs.find(d => d.name === 'mcp__github-readonly__list_pull_requests').run({ owner: 'acme', repo: 'app', state: 'open', page: 1.5, perPage: 10.5 }); }
        catch (_) { rejectedFraction = true; }
        A.eq(rejectedMethod, true, 'both: non-file/diff read methods are rejected at dispatch');
        A.eq(rejectedPage, true, 'both: unbounded pull request listing is rejected at dispatch');
        A.eq(rejectedMissingLimit, true, 'both: missing page size is rejected at dispatch');
        A.eq(rejectedNan, true, 'both: non-finite page size is rejected at dispatch');
        A.eq(rejectedFraction, true, 'both: fractional page and size are rejected at dispatch');
        A.eq(connectorCalls.length, 0, 'both: rejected operations never reach the connector');
      }
      A.ok(allDefs.some(d => /^mcp__github__/.test(d.name)) ? mode !== 'both' || githubDefs.every(d => !/^mcp__github__/.test(d.name)) : true, mode + ': full-access tools are excluded even when both connectors are configured');
      for (const def of githubDefs) registry.register(def, { provenance: 'connector' });
    }

    makeFsTools({ fsp, pathMod: path, root: agentRoot, limits: { writeBytes: 1 << 20, readReturn: 24000 }, redact }).register(registry);
    makeToolSearchTool({ registry }).register(registry);
    const station = { agents: { agent: { id: 'agent', room: 'office' } }, rooms: { office: { id: 'office', objects } } };
    const resolved = resolveTools('agent', station);
    for (const def of githubDefs) {
      if (!resolved.tools.includes(def.name)) resolved.tools.push(def.name);
      resolved.approvalRules[def.name] = { requiresConsent: true, scope: def.scope, network: true };
      resolved.networkCaps[def.name] = true;
    }
    const approvals = [];
    const consent = makeConsentBroker({ sessionKey: 'github-pr-fixture-' + mode, surface: 'interactive', networkOf: call => !!resolved.networkCaps[call.name], prompt: async call => { approvals.push(call.name); return 'session'; } });
    // Simulate the runtime's watched interactive surface and exact host confirmation. The prompt approves only the fixture's connector-read and jail-scoped file-write classes; it creates no production grant.
    const authority = makeRunAuthority({ surface: 'interactive', isTask: true, confirm: async () => 'session' });
    const capCtx = makeCapCtx(resolved, { consent, authorize: authority.authorize, timeoutMs: 5000 });
    const toolDefs = registry.wireFormat(registry.list(new Set(resolved.tools)));
    const fromWire = new Map();
    for (const d of toolDefs) { const real = d.function.name; const wire = real.replace(/\./g, '_'); fromWire.set(wire, real); d.function.name = wire; }
    const dispatchedResults = new Map();
    const dispatch = async (call, ctx) => {
      const actualCall = fromWire.has(call.name) ? Object.assign({}, call, { name: fromWire.get(call.name) }) : call;
      const result = await registry.dispatch(actualCall, ctx);
      dispatchedResults.set(call.id, result);
      return result;
    };
    const turn = (id, name, args) => [
      { type: 'tool_start', index: 0, id, name }, { type: 'tool_args', index: 0, chunk: JSON.stringify(args) }, { type: 'done', finishReason: 'tool_calls' }
    ];
    const review = '# PR review: acme/app#17\n\nEvidence: import.js diff adds a missing-id check before replacement. This is fixture evidence only.\n';
    const findings = `repo,pr,priority,file,evidence,confidence,coverage
acme/app,17,review,import.js,"missing-id check precedes replaceRecords",fixture,"page 1 only; at most 10 open PRs"
`;
    const coverage = 'Coverage: page 1, at most 10 open PRs; further pages were not fetched, so this is not a complete sweep.';
    const csv = (mode === 'connected' || mode === 'both') ? findings : `repo,pr,priority,file,evidence,confidence,coverage
acme/app,17,unverified,import.js,"diff unavailable; no change claim",unknown,"page 1 only; at most 10 open PRs"
`;
    const report = (mode === 'connected' || mode === 'both')
      ? `# PR review: acme/app#17

${coverage}

Evidence: import.js diff adds a missing-id check before replacement. This is fixture evidence only.
`
      : `# PR review: acme/app#17

${coverage}

PARTIAL / UNVERIFIED: GitHub listed PR #17 and returned its file list, but its diff request failed. No claim is made about the code change; retry after connector access is restored.
`;
    let turns;
    if (mode === 'unavailable') {
      turns = [[{ type: 'text', delta: 'GitHub MCP is not connected in this run. No remote PR list or review was produced; connect the read-only GitHub connector and retry.' }, { type: 'done', finishReason: 'stop' }]];
    } else {
      turns = [
        turn('list-reports', 'fs_list', { path: REPORT_ROOT }),
        turn('list', 'mcp__github-readonly__list_pull_requests', { owner: 'acme', repo: 'app', state: 'open', page: 1, perPage: 10 }),
        turn('files', 'mcp__github-readonly__pull_request_read', { owner: 'acme', repo: 'app', pullNumber: 17, method: 'get_files' }),
        turn('diff', 'mcp__github-readonly__pull_request_read', { owner: 'acme', repo: 'app', pullNumber: 17, method: 'get_diff' })
      ];
      turns.push(turn('write-review', 'fs_write', { path: RUN_REPORT_DIR + '/review.md', content: report }));
      turns.push(turn('write-findings', 'fs_write', { path: RUN_REPORT_DIR + '/findings.csv', content: csv }));
      turns.push(turn('read-review', 'fs_read', { path: RUN_REPORT_DIR + '/review.md' }));
      turns.push(turn('read-findings', 'fs_read', { path: RUN_REPORT_DIR + '/findings.csv' }));
      turns.push([{ type: 'text', delta: (mode === 'connected' || mode === 'both') ? 'Fixture review saved and read back. Live GitHub review acceptance remains open.' : 'Partial fixture report saved and read back; diff evidence remains unavailable.' }, { type: 'done', finishReason: 'stop' }]);
    }
    const bus = A.makeBus(), seen = A.collectBus(bus, events.names()), emit = makeEmitter(bus, () => {});
    const provider = makeReplayProvider({ models: MODELS, turns });
    const result = await runAgentLoop({
      messages: [{ role: 'user', content: require('../frontend/app/recipes.js').fillTask(recipe, { scope: 'acme/app', workspace: 'github-pr-review' }) }],
      provider, emit, cost: makeCostEngine({ priceOf: provider.priceOf }), tools: toolDefs, dispatch, capCtx,
      model: 'replay/model', agentId: 'agent', runId: 'github-review-' + mode,
      limits: { maxIters: 12, maxCostUsd: 1 }, clock: { now: () => 0 }
    });
    A.eq(result.reason, 'done', mode + ': PR Sweep execution ends normally');
    if (mode === 'unavailable') {
      A.eq(githubDefs.length, 0, 'unavailable: no GitHub calls are possible without a room connector');
      A.ok(!seen.some(e => e.name === 'agent.tool_call' && /^mcp__github-readonly__/.test(e.payload.name)), 'unavailable: the run does not fabricate or invoke a GitHub tool');
      A.ok(!(await fsp.stat(path.join(agentRoot, 'agent', REPORT_ROOT)).catch(() => null)), 'unavailable: no empty/fabricated review files are saved');
      return;
    }
    const toolResults = seen.filter(e => e.name === 'agent.tool_result').map(e => e.payload);
    A.eq(toolResults.length, 8, mode + ': preflight list, PR list, files, diff, two writes and two read-backs have results');
    A.ok(!toolResults[0].isError && /prior-run/.test(dispatchedResults.get('list-reports').content), mode + ': preflight lists the prior report folder before writing');
    A.ok(toolResults.slice(1, 3).every(r => !r.isError), mode + ': pull request list and file list succeed');
    if (mode === 'connected' || mode === 'both') A.ok(!toolResults[3].isError, mode + ': diff is retrieved successfully');
    else A.ok(toolResults[3].isError, 'diff-error: MCP failure is surfaced as a failed tool result');
    A.ok(toolResults.slice(4, 8).every(r => !r.isError), mode + ': both writes and both reads succeed');
    A.eq(dispatchedResults.get('read-review').content, report, mode + ': review read-back tool result matches exact saved report');
    A.eq(dispatchedResults.get('read-findings').content, csv, mode + ': findings read-back tool result matches exact saved CSV');
    const reportDir = path.join(agentRoot, 'agent', RUN_REPORT_DIR);
    A.eq(await fsp.readFile(path.join(reportDir, 'review.md'), 'utf8'), report, mode + ': review artifact is persisted exactly');
    A.eq(await fsp.readFile(path.join(reportDir, 'findings.csv'), 'utf8'), csv, mode + ': CSV artifact is persisted exactly');
    A.eq(await fsp.readFile(path.join(agentRoot, 'agent', REPORT_ROOT, 'prior-run', 'review.md'), 'utf8'), PRIOR_REPORT, mode + ': prior report remains byte-for-byte unchanged');
    A.ok(/page 1, at most 10 open PRs/.test(report) && /not a complete sweep/.test(report), mode + ': report discloses bounded first-page coverage');
    if (mode === 'diff-unavailable') {
      A.ok(/PARTIAL \/ UNVERIFIED/.test(report) && /diff request failed/.test(report), 'diff-error: report preserves the missing evidence rather than guessing');
      A.ok(/unknown/.test(csv), 'diff-error: CSV marks confidence unknown');
    }    A.ok(!seen.some(e => e.name === 'agent.run.error'), mode + ': no run-level failure');
    A.ok(githubDefs.every(d => /mcp__github-readonly__/.test(d.name)), mode + ': remote access stays in the MCP connector boundary');
    A.eq(connectorCalls.map(c => c.name), ['list_pull_requests', 'pull_request_read', 'pull_request_read'], mode + ': connector dispatch performs only bounded list/files/diff reads and no remote write');
    A.eq(connectorCalls[0].args.page, 1, mode + ': GitHub listing explicitly starts at page one');
    A.eq(connectorCalls[0].args.perPage, 10, mode + ': GitHub listing is capped at ten results per page');
    A.eq(approvals, ['mcp__github-readonly__list_pull_requests', 'fs.write'], mode + ': the watched consent broker asks once per danger class and caches only the human session approvals');
  } finally { await manager.close(); }
}

(async () => {
  await fsp.mkdir(ROOT, { recursive: true });
  try {
    await runCase('connected');
    await runCase('both');
    await runCase('full-access-only');
    await runCase('diff-unavailable');
    await runCase('unavailable');
    await runCase('wrong-endpoint');
    await runCase('not-readonly');
    A.report('github-pr-review.integration.test');
  } finally { await fsp.rm(ROOT, { recursive: true, force: true }); }
})().catch(e => { console.error('FAIL github-pr-review.integration.test: ' + (e && e.stack || e)); process.exit(1); });
