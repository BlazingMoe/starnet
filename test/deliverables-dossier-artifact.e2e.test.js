/* node test/deliverables-dossier-artifact.e2e.test.js — production dossier source receipt + verified write
   through the real sidecar Deliverables API and authenticated file route. No model or provider is started. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { makeWebTools } = require('../sidecar/tools/builtin/web.js');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { makeRunJournal, selectSourceReceipts } = require('../sidecar/run-journal.js');
const { makeArtifactCollector } = require('../sidecar/artifacts.js');
const { makeRunStore } = require('../sidecar/runstore.js');

(async () => {
  const fixture = SidecarFixture.create({ prefix: 'starnet-dossier-deliverable-', timeoutMs: 20000 });
  const journalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-dossier-delivery-journal-'));
  try {
    const agentId = 'dossierfixture', runId = 'fixture-dossier-run-20261025';
    const relPath = 'dossier/decision/sources.md';
    const journalDir = path.join(journalRoot, 'journal');
    let journal = makeRunJournal({ dir: journalDir });
    journal.begin({ runId, agentId });
    const registry = makeRegistry();
    makeWebTools({ lookup: null, sourceReceiptNow: () => 1792886400000,
      sourceReceiptId: () => '1234567890abcdef1234567890abcdef',
      fetchImpl: async () => ({ status: 200, headers: { get: () => 'text/plain' },
        text: async () => 'Synthetic source reports the selected option costs 42 credits.' })
    }).register(registry);
    const getRunSources = (rid, aid) => {
      if (rid !== runId || aid !== agentId) throw new Error('source receipts are limited to this run and agent');
      return selectSourceReceipts(journal.inspect(rid), rid, aid);
    };
    makeFsTools({ fsp, pathMod: path, root: fixture.workspace, getRunSources }).register(registry);
    const ctx = { agentId, runId, canUse: () => ({ ok: true }), consent: async () => ({ allow: true }) };
    async function dispatch(callId, name, args) {
      const tool = registry.get(name);
      A.ok(tool, name + ' exists in the production tool registry');
      journal.toolIntent(runId, { callId, name, argsRaw: JSON.stringify(args), mutating: tool.scope === 'write', boundaryModel: 'prepared-dispatch-v1' });
      journal.toolDispatch(runId, { callId, name, mutating: tool.scope === 'write' });
      const result = await registry.dispatch({ id: callId, name, args }, ctx);
      journal.toolResult(runId, { callId, ok: result.ok, isError: result.isError, content: result.content, summary: result.summary, sourceReceipt: result.sourceReceipt || null });
      return result;
    }
    const fetched = await dispatch('fetch-source', 'web_fetch', { url: 'https://example.test/report?secret=omitted#part' });
    A.eq(fetched.ok, true, 'synthetic web_fetch succeeds through the real registry');
    const receiptId = fetched.sourceReceipt.id;

    // Reopen from the durable journal before manifest validation, matching the cold host recovery boundary.
    journal = makeRunJournal({ dir: journalDir });
    const coldReceipts = selectSourceReceipts(journal.inspect(runId), runId, agentId);
    A.eq(coldReceipts.map(x => x.id), [receiptId], 'host source receipt is recovered from persisted journal');
    const written = await dispatch('write-manifest', 'fs.write_dossier_sources', { path: relPath, claims: [
      { claim: 'The synthetic source reports a cost of 42 credits.', receiptId, publicationDate: null, state: 'reference_checked' }
    ] });
    A.eq(written.ok, true, 'manifest is written using the production consented fs tool');
    const absolutePath = path.join(fixture.workspace, agentId, relPath);
    const diskBytes = await fsp.readFile(absolutePath);
    A.eq(written.receipt.state, 'read-back-verified', 'filesystem writer returns a read-back-verified receipt');
    A.eq(written.receipt.path, relPath, 'write receipt names the requested exact relative path');
    A.eq(written.receipt.verifiedBytes, diskBytes.length, 'verified receipt byte count matches the saved file');
    const manifest = diskBytes.toString('utf8');
    A.ok(manifest.includes(receiptId) && manifest.includes('Structural validation: passed'), 'manifest retains the validated receipt linkage');
    A.ok(manifest.includes('does not validate whether a source supports a claim or whether the claim is true'), 'manifest discloses that semantic support and truth are unverified');
    A.ok(manifest.includes('before the central host output cap') && manifest.includes('fetchedExcerptSha256'), 'manifest explains the excerpt digest scope before the output cap');
    A.ok(manifest.includes('https://example.test/report') && !manifest.includes('secret=omitted') && !manifest.includes('#part'), 'source URL is display-only and query/fragment are omitted');

    const artifacts = makeArtifactCollector();
    artifacts.observe({ toolName: 'fs.write_dossier_sources', args: { path: relPath }, result: written });
    A.eq(artifacts.list(), [{ kind: 'file', path: relPath, bytes: diskBytes.length }], 'only the exact verified dossier file enters the artifact ledger');
    const forged = makeArtifactCollector();
    forged.observe({ toolName: 'fs.write_dossier_sources', args: { path: relPath }, result: { ok: true, receipt: { state: 'read-back-verified', path: 'other/sources.md', verifiedBytes: diskBytes.length } } });
    A.eq(forged.count(), 0, 'mismatched receipt path cannot become an eligible artifact');
    const unverified = makeArtifactCollector();
    unverified.observe({ toolName: 'fs.write_dossier_sources', args: { path: relPath }, result: { ok: true } });
    A.eq(unverified.count(), 0, 'missing verified write receipt cannot become an eligible artifact');
    const persisted = [];
    const runStore = makeRunStore({ io: { readAll: () => persisted.slice(), append: row => persisted.push(row) }, clock: { now: () => 1792886400000 } });
    const run = runStore.record({ runId, agentId, reason: 'done', title: 'synthetic dossier artifact acceptance', artifacts: artifacts.list(), startedAt: 1792886399000, endedAt: 1792886400000 });
    fs.writeFileSync(path.join(fixture.workspace, 'runs.jsonl'), JSON.stringify(run) + '\n', 'utf8');
    A.eq(run.artifacts, [{ kind: 'file', path: relPath, bytes: diskBytes.length }], 'run history persists the exact source-manifest path and size');

    await fixture.start({ STARNET_DEV: '1', STARNET_CRON_ENABLED: '0', STARNET_ENV_DISCOVERY: '0', STARNET_NIGHTSHIFT_ENABLED: '0', STARNET_LIVE_PRICES: '0' });
    const unauth = await fetch(fixture.baseUrl + '/api/deliverables', { headers: { Origin: fixture.baseUrl } });
    A.ok(unauth.status === 401 || unauth.status === 403, 'Deliverables API denies requests without the station token');
    const libraryRes = await fixture.request('/api/deliverables');
    const library = await libraryRes.json();
    A.eq(libraryRes.status, 200, 'authenticated Deliverables API lists the persisted run');
    const row = (library.items || []).find(item => item.runId === runId);
    const file = row && row.files && row.files.find(item => item.path === relPath);
    A.ok(file && file.bytes === diskBytes.length && file.preview === 'markdown' && file.openUrl, 'library exposes the verified sources.md with its measured size and existing open URL');

    const unauthFile = await fetch(fixture.baseUrl + file.openUrl, { headers: { Origin: fixture.baseUrl } });
    A.ok(unauthFile.status === 401 || unauthFile.status === 403, 'file route denies requests without the station token');
    const download = await fixture.request(file.openUrl);
    const downloaded = Buffer.from(await download.arrayBuffer());
    A.eq(download.status, 200, 'existing authenticated file route serves the dossier artifact');
    A.ok(downloaded.equals(diskBytes), 'download has the exact verified on-disk bytes');
    A.eq(downloaded.length, file.bytes, 'download length matches both ledger and writer receipt');

    const unknown = await fixture.request('/api/file?agent=' + encodeURIComponent(agentId) + '&path=' + encodeURIComponent('dossier/decision/forged.md'));
    A.eq(unknown.status, 404, 'unknown artifact path is not served');
    const traversal = await fixture.request('/api/file?agent=' + encodeURIComponent(agentId) + '&path=' + encodeURIComponent('../runs.jsonl'));
    A.eq(traversal.status, 403, 'path traversal is denied by the workspace jail');
    const otherAgent = await fixture.request('/api/file?agent=otherfixture&path=' + encodeURIComponent(relPath));
    A.eq(otherAgent.status, 404, 'another agent namespace cannot resolve this fixture file');
    // Authentication succeeded with the one fixture station token. The existing API has no per-agent token model;
    // this assertion above establishes only workspace namespace/jail behavior across agent IDs.
  } finally {
    await fixture.dispose();
    fs.rmSync(journalRoot, { recursive: true, force: true });
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  A.report('deliverables-dossier-artifact.e2e.test');
})().catch(error => { console.error(error); process.exit(1); });
