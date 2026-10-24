/* node test/dossier-source-manifest.test.js — run-local source receipts and the consented manifest writer. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.SKYNET_TOOL_OUTPUT_MAX = '4000'; // exercise the central host cap offline; fetch excerpt still fits, long result must retain receipt identity.
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { makeWebTools } = require('../sidecar/tools/builtin/web.js');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { makeRunJournal, selectSourceReceipts } = require('../sidecar/run-journal.js');
const { makeArtifactCollector } = require('../sidecar/artifacts.js');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-dossier-manifest-'));
  try {
    const journalDir = path.join(root, 'journal');
    const journal = makeRunJournal({ dir: journalDir, redact: value => String(value).replace(/0123456789abcdef0123456789abcdef/g, '[redacted]').replace(/scrub-me/g, '[redacted]') });
    const runId = 'dossier-run', agentId = 'agent';
    journal.begin({ runId, agentId });
    const html = '<html><body><article>Fixture says option A costs 42.</article></body></html>';
    const registry = makeRegistry();
    let receiptSequence = 0;
    makeWebTools({ lookup: null, sourceReceiptId: () => (++receiptSequence === 1 ? '0123456789abcdef0123456789abcdef' : receiptSequence.toString(16).padStart(32, '0')), fetchImpl: async url => String(url).includes('duckduckgo')
      ? { status: 200, headers: { get: () => 'text/html' }, text: async () => '' }
      : String(url).includes('/network-error')
        ? Promise.reject(new Error('network down'))
      : String(url).includes('/long')
        ? { status: 200, headers: { get: () => 'text/plain' }, text: async () => 'x'.repeat(7000) }
      : String(url).includes('/host-clamp')
        ? { status: 200, headers: { get: () => 'text/plain' }, text: async () => 'y'.repeat(4500) }
        : String(url).includes('/missing')
          ? { status: 404, headers: { get: () => 'text/plain' }, text: async () => '' }
          : { status: 200, headers: { get: () => 'text/html' }, text: async () => html }
    }).register(registry);
    const getRunSources = (rid, aid) => selectSourceReceipts(journal.inspect(rid), rid, aid);
    makeFsTools({ fsp, pathMod: path, root: path.join(root, 'workspace'), getRunSources }).register(registry);
    const ctx = { agentId, runId, canUse: () => ({ ok: true }), consent: async () => ({ allow: true }) };
    const call = async (id, name, args) => {
      const tool = registry.get(name);
      journal.toolIntent(runId, { callId: id, name, argsRaw: JSON.stringify(args), mutating: tool.scope === 'write', boundaryModel: 'prepared-dispatch-v1' });
      journal.toolDispatch(runId, { callId: id, name, mutating: tool.scope === 'write' });
      const result = await registry.dispatch({ id, name, args }, ctx);
      journal.toolResult(runId, { callId: id, ok: result.ok, isError: result.isError, content: result.content, summary: result.summary, sourceReceipt: result.sourceReceipt || null });
      return result;
    };
    const fetched = await call('fetch-1', 'web_fetch', { url: 'https://example.com/article?token=secret#frag' });
    A.eq(fetched.ok, true, 'web fetch succeeds through the registry');
    A.ok(/source receipt: [a-f0-9]{32}/.test(fetched.content), 'model-facing content receives an opaque host receipt marker');
    A.ok(!fetched.content.includes('token=secret') && !fetched.content.includes('#frag'), 'model-facing source label does not expose query or fragment');
    const sourceReceipt = journal.inspect(runId).completed[0].result.sourceReceipt;
    A.ok(sourceReceipt && sourceReceipt.state === 'fetched' && sourceReceipt.callId === 'fetch-1', 'journal stores whitelisted host metadata tied to the exact call');
    A.eq(sourceReceipt.id, '0123456789abcdef0123456789abcdef', 'journal redaction preserves the host receipt match key');
    A.eq(sourceReceipt.requestedUrlDisplay, 'https://example.com/article', 'receipt uses an explicitly display-only redacted requested URL');
    const redactionJournalDir = path.join(root, 'redaction-journal');
    const redactionJournal = makeRunJournal({ dir: redactionJournalDir, redact: value => String(value).replace(/0123456789abcdef0123456789abcdef/g, '[redacted]').replace(/scrub-me/g, '[redacted]') });
    redactionJournal.begin({ runId: 'redaction-run', agentId });
    redactionJournal.toolIntent('redaction-run', { callId: 'model-input', name: 'web_fetch', argsRaw: JSON.stringify({ sourceReceipt: { note: '0123456789abcdef0123456789abcdef' } }), metadata: { sourceReceipt: { note: '0123456789abcdef0123456789abcdef' } }, mutating: false });
    redactionJournal.toolDispatch('redaction-run', { callId: 'model-input', name: 'web_fetch', mutating: false });
    redactionJournal.toolResult('redaction-run', { callId: 'model-input', ok: true, isError: false, sourceReceipt: { id: sourceReceipt.id, runId: 'redaction-run', agentId, callId: 'model-input', state: 'fetched', method: 'direct', fetchedAt: '2026-10-24T00:00:00.000Z', truncated: false, textSha256: 'a'.repeat(64), requestedUrlDisplay: 'https://example.com/scrub-me', blockedReason: 'scrub-me', note: 'scrub-me' } });
    const redactionRecords = fs.readFileSync(path.join(redactionJournalDir, redactionJournal._internals.runFileName('redaction-run')), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    const redactedIntent = redactionRecords.find(x => x.type === 'tool_intent').payload;
    const redactedReceipt = redactionRecords.find(x => x.type === 'tool_result').payload.sourceReceipt;
    A.eq(JSON.parse(redactedIntent.argsRaw).sourceReceipt.note, '[redacted]', 'model-controlled sourceReceipt nested in argsRaw remains redacted');
    A.eq(redactedIntent.metadata.sourceReceipt.note, '[redacted]', 'model-controlled sourceReceipt nested in journal metadata remains redacted');
    A.eq(redactedReceipt.id, sourceReceipt.id, 'only the host-generated opaque ID stays stable at the typed tool-result seam');
    A.eq(redactedReceipt.textSha256, 'a'.repeat(64), 'only the typed excerpt digest stays stable for journal linkage');
    A.eq(redactedReceipt.requestedUrlDisplay, 'https://example.com/[redacted]', 'host receipt display URL still goes through normal redaction');
    A.eq(redactedReceipt.blockedReason, '[redacted]', 'host receipt status details still go through normal redaction');
    A.eq(selectSourceReceipts(journal.inspect(runId), runId, agentId).map(x => x.id), [sourceReceipt.id], 'shared production selector returns only a successful dispatched fetch receipt');
    A.throws(() => selectSourceReceipts(journal.inspect(runId), runId, 'other-agent'), 'shared selector refuses cross-agent journal access');
    const mismatchState = JSON.parse(JSON.stringify(journal.inspect(runId)));
    mismatchState.completed[0].result.sourceReceipt.callId = 'different-call';
    A.throws(() => selectSourceReceipts(mismatchState, runId, agentId), 'shared selector rejects receipt/call mismatch');
    const undispatchedState = JSON.parse(JSON.stringify(journal.inspect(runId)));
    undispatchedState.completed[0].dispatch = null;
    A.throws(() => selectSourceReceipts(undispatchedState, runId, agentId), 'shared selector rejects success without durable dispatch');
    const incompleteState = JSON.parse(JSON.stringify(journal.inspect(runId)));
    incompleteState.corrupt = true;
    A.throws(() => selectSourceReceipts(incompleteState, runId, agentId), 'shared selector rejects corrupt/incomplete journal');

    const args = { path: 'dossier/sources.md', claims: [{ claim: 'Option A costs 42 (fixture excerpt).', receiptId: sourceReceipt.id, publicationDate: null, state: 'reference_checked' }] };
    const written = await call('write-1', 'fs.write_dossier_sources', args);
    A.eq(written.ok, true, 'manifest validator writes through the normal consented filesystem path');
    const saved = await fsp.readFile(path.join(root, 'workspace', agentId, args.path), 'utf8');
    A.ok(saved.includes('Structural validation: passed') && saved.includes(sourceReceipt.id), 'saved manifest contains validated host receipt linkage');
    A.ok(saved.includes('does not validate whether a source supports a claim or whether the claim is true'), 'saved manifest clearly limits validation to structure');
    A.ok(saved.includes('fetchedExcerptSha256') && saved.includes('before the central host output cap'), 'manifest names the excerpt digest and its pre-cap scope precisely');
    A.ok(!saved.includes('token=secret') && !saved.includes('#frag'), 'saved manifest does not contain query or fragment secrets');
    const artifact = makeArtifactCollector();
    artifact.observe({ toolName: 'fs.write_dossier_sources', args, result: written });
    A.eq(artifact.list(), [{ kind: 'file', path: args.path, bytes: Buffer.byteLength(saved) }], 'verified dossier source manifest enters the downloadable artifact ledger');
    const noReceipt = makeArtifactCollector();
    noReceipt.observe({ toolName: 'fs.write_dossier_sources', args, result: { ok: true } });
    A.eq(noReceipt.count(), 0, 'manifest download is omitted without an exact verified write receipt');

    const before = saved;
    const refused = await call('write-spoof', 'fs.write_dossier_sources', { path: 'dossier/spoof/sources.md', claims: [{ claim: 'spoof', receiptId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicationDate: null, state: 'reference_checked' }] });
    A.eq(refused.isError, true, 'invented receipt IDs are rejected');
    A.ok(refused.content.includes('references no observed host receipt'), 'spoof fails specifically at host receipt resolution');
    A.ok(!fs.existsSync(path.join(root, 'workspace', agentId, 'dossier/spoof/sources.md')), 'spoof rejection writes no artifact');
    const wrongCtx = Object.assign({}, ctx, { runId: 'another-run' });
    const wrongRun = await registry.dispatch({ id: 'crossrun', name: 'fs.write_dossier_sources', args }, wrongCtx);
    A.eq(wrongRun.isError, true, 'receipts cannot be queried from another run');
    const denied = await registry.dispatch({ id: 'deny-write', name: 'fs.write_dossier_sources', args }, Object.assign({}, ctx, { consent: async () => ({ allow: false }) }));
    A.eq(denied.isError, true, 'manifest writing remains consent gated');
    A.ok(!fs.existsSync(path.join(root, 'workspace', agentId, 'dossier/sources.md')) || (await fsp.readFile(path.join(root, 'workspace', agentId, 'dossier/sources.md'), 'utf8')) === before, 'denied replacement preserves existing bytes');
    const traversal = await call('write-traversal', 'fs.write_dossier_sources', Object.assign({}, args, { path: '../escape/sources.md' }));
    A.eq(traversal.isError, true, 'manifest path remains inside the normal filesystem jail');
    const longFetch = await call('fetch-long', 'web_fetch', { url: 'https://example.com/long' });
    const longReceipt = journal.inspect(runId).completed.find(x => x.intent.callId === 'fetch-long').result.sourceReceipt;
    A.eq(longReceipt.truncated, true, 'fetch truncation is recorded by the host from the returned text bound');
    A.ok(longFetch.content.includes(longReceipt.id) && longFetch.content.includes('host output truncated'), 'central output cap keeps receipt ID visible and upgrades truncation honestly');
    const hostClamped = await call('fetch-host-clamp', 'web_fetch', { url: 'https://example.com/host-clamp' });
    const hostClampReceipt = journal.inspect(runId).completed.find(x => x.intent.callId === 'fetch-host-clamp').result.sourceReceipt;
    A.eq(hostClampReceipt.truncated, true, 'central registry cap marks a fetch truncated when its 4500-character excerpt exceeds the host output limit');
    A.ok(hostClamped.content.includes(hostClampReceipt.id) && hostClamped.content.includes('host output truncated'), 'central-clamp-only receipt identity remains visible');
    const falseComplete = await call('write-false-complete', 'fs.write_dossier_sources', { path: 'dossier/false/sources.md', claims: [{ claim: 'claim', receiptId: longReceipt.id, publicationDate: null, state: 'reference_checked' }] });
    A.eq(falseComplete.isError, true, 'truncated fetched evidence cannot be labeled complete');
    const truncatedManifest = await call('write-truncated', 'fs.write_dossier_sources', { path: 'dossier/truncated/sources.md', claims: [{ claim: 'claim', receiptId: longReceipt.id, publicationDate: null, state: 'truncated' }] });
    A.eq(truncatedManifest.ok, true, 'truncated fetch can be disclosed with its explicit state');
    const blockedFetch = await call('fetch-blocked', 'web_fetch', { url: 'https://example.com/missing' });
    const blockedReceipt = journal.inspect(runId).completed.find(x => x.intent.callId === 'fetch-blocked').result.sourceReceipt;
    A.eq(blockedReceipt.state, 'blocked', 'soft transport answer is represented as a host blocked receipt: ' + JSON.stringify(journal.inspect(runId).completed.find(x => x.intent.callId === 'fetch-blocked')));
    const blockedManifest = await call('write-blocked', 'fs.write_dossier_sources', { path: 'dossier/blocked/sources.md', claims: [{ claim: 'claim could not be checked', receiptId: blockedReceipt.id, publicationDate: null, state: 'blocked' }] });
    A.eq(blockedManifest.ok, true, 'blocked transport result can be explicitly recorded');
    const networkFailure = await call('fetch-network-error', 'web_fetch', { url: 'https://example.com/network-error' });
    A.eq(networkFailure.isError, true, 'a genuine fetch failure remains an error');
    A.eq(journal.inspect(runId).completed.find(x => x.intent.callId === 'fetch-network-error').result.sourceReceipt, null, 'a failed fetch does not mint a source receipt');
    const failedFetchClaim = await call('write-failed-fetch', 'fs.write_dossier_sources', { path: 'dossier/failed/sources.md', claims: [{ claim: 'claim after failed fetch', receiptId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', publicationDate: null, state: 'reference_checked' }] });
    A.eq(failedFetchClaim.isError, true, 'failed fetch cannot be cited as an observed source');
    const repeated = await call('write-reuse', 'fs.write_dossier_sources', { path: 'dossier/other/sources.md', claims: [args.claims[0], { claim: 'A second distinct claim also references the observed source.', receiptId: sourceReceipt.id, publicationDate: null, state: 'reference_checked' }] });
    A.eq(repeated.ok, true, 'multiple distinct claims may cite one observed source');
    const duplicate = await call('write-dup', 'fs.write_dossier_sources', { path: 'dossier/dup/sources.md', claims: [args.claims[0], args.claims[0]] });
    A.eq(duplicate.isError, true, 'duplicate manifest entries are rejected');
    const missing = await call('write-unknown', 'fs.write_dossier_sources', { path: 'dossier/unknown/sources.md', claims: [{ claim: 'unknown source', receiptId: 'cccccccccccccccccccccccccccccccc', publicationDate: null, state: 'reference_checked' }] });
    A.ok(missing.isError && missing.content.includes('references no observed host receipt'), 'unknown receipt ID at a valid sources.md path fails reference validation');
    const invalidDate = await call('write-date', 'fs.write_dossier_sources', { path: 'dossier/date/sources.md', claims: [{ claim: 'date', receiptId: sourceReceipt.id, publicationDate: '2026-02-30', state: 'reference_checked' }] });
    A.ok(invalidDate.isError && invalidDate.content.includes('publicationDate'), 'invalid calendar dates are rejected');
    const invalidState = await call('write-state', 'fs.write_dossier_sources', { path: 'dossier/state/sources.md', claims: [{ claim: 'state', receiptId: sourceReceipt.id, publicationDate: null, state: 'verified' }] });
    A.ok(invalidState.isError, 'unsupported states are rejected by schema or writer validation');
    const tooMany = await call('write-101', 'fs.write_dossier_sources', { path: 'dossier/count/sources.md', claims: Array.from({ length: 101 }, (_, i) => ({ claim: 'claim ' + i, receiptId: null, publicationDate: null, state: 'unverifiable' })) });
    A.ok(tooMany.isError && tooMany.content.includes('1-100'), '101 claims exceed the manifest item bound');
    const maxCount = await call('write-100', 'fs.write_dossier_sources', { path: 'dossier/count100/sources.md', claims: Array.from({ length: 100 }, (_, i) => ({ claim: 'claim ' + i, receiptId: null, publicationDate: null, state: 'unverifiable' })) });
    A.eq(maxCount.ok, true, '100 claims fit the item-count bound');
    const tooLong = await call('write-claim-long', 'fs.write_dossier_sources', { path: 'dossier/longclaim/sources.md', claims: [{ claim: 'x'.repeat(1001), receiptId: null, publicationDate: null, state: 'unverifiable' }] });
    A.ok(tooLong.isError && tooLong.content.includes('1-1000'), 'claim text above 1000 characters is rejected');
    const oversized = await call('write-oversize', 'fs.write_dossier_sources', { path: 'dossier/oversize/sources.md', claims: Array.from({ length: 100 }, (_, i) => ({ claim: String(i).padEnd(1000, 'z'), receiptId: null, publicationDate: null, state: 'unverifiable' })) });
    A.ok(oversized.isError && oversized.content.includes('64 KiB'), 'serialized manifest above 64 KiB is rejected before write');
    const badPath = await call('write-suffix', 'fs.write_dossier_sources', { path: 'dossier/not-sources.md/extra', claims: args.claims });
    A.ok(badPath.isError && badPath.content.includes('must name sources.md'), 'path must end with the exact sources.md basename');
    const longPath = await call('write-path-long', 'fs.write_dossier_sources', { path: 'x'.repeat(513), claims: args.claims });
    A.ok(longPath.isError && longPath.content.includes('512 characters'), 'path length is bounded before filesystem resolution');
    const fenced = await call('write-fence', 'fs.write_dossier_sources', { path: 'dossier/fence/sources.md', claims: [{ claim: 'hostile ```json\n``` injection', receiptId: null, publicationDate: null, state: 'unverifiable' }] });
    A.eq(fenced.ok, true, 'fence-like untrusted claim text can be safely serialized');
    const fencedBytes = await fsp.readFile(path.join(root, 'workspace', agentId, 'dossier/fence/sources.md'), 'utf8');
    A.eq((fencedBytes.match(/```/g) || []).length, 2, 'hostile backticks cannot close the host JSON fence');
    A.eq(await fsp.readFile(path.join(root, 'workspace', agentId, args.path), 'utf8'), before, 'validation attempts do not change an existing source artifact');

    // A malformed durable journal disables source validation even though a good prefix remains.
    const journalFile = path.join(journalDir, journal._internals.runFileName(runId));
    fs.appendFileSync(journalFile, '{torn');
    const corrupt = await registry.dispatch({ id: 'write-corrupt', name: 'fs.write_dossier_sources', args: { path: 'dossier/corrupt/sources.md', claims: [{ claim: 'x', receiptId: sourceReceipt.id, publicationDate: null, state: 'reference_checked' }] } }, ctx);
    A.eq(corrupt.isError, true, 'corrupt journal fails closed');
    A.ok(corrupt.content.includes('corrupt, incomplete or mismatched'), 'corrupt journal is rejected by shared authoritative selector');
    A.ok(!fs.existsSync(path.join(root, 'workspace', agentId, 'dossier/corrupt/sources.md')), 'corrupt-journal refusal creates no artifact');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  A.report('dossier-source-manifest.test');
})().catch(e => { console.log('FAIL: dossier-source-manifest threw — ' + (e && e.stack || e)); process.exit(1); });
