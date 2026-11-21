/* node test/deliverables-xlsx-artifact.e2e.test.js — verified XLSX writer receipt through the real artifact
   ledger, Deliverables API, and existing authenticated file download endpoint. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const { makeArtifactCollector } = require('../sidecar/artifacts.js');
const { makeRunStore } = require('../sidecar/runstore.js');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { makeDocExtract } = require('../sidecar/tools/builtin/docextract.js');

(async () => {
  const fixture = SidecarFixture.create({ prefix: 'starnet-xlsx-deliverable-', timeoutMs: 20000 });
  try {
    const agentId = 'xlsxfixture', runId = 'fixture-xlsx-run-20261021', relPath = 'acceptance/summary.xlsx';
    const doc = makeDocExtract({ inflateRaw: b => zlib.inflateRawSync(b) });
    const tools = makeFsTools({ fsp: require('node:fs/promises'), pathMod: path, root: fixture.workspace, docExtract: doc });
    const write = await tools.writeXlsxTool.run({ path: relPath, columns: ['Item', 'Count'], rows: [['Widget', 42]] }, { agentId });
    A.eq(write.receipt.state, 'read-back-verified', 'real XLSX filesystem write returns byte verification');
    const collector = makeArtifactCollector();
    collector.observe({ toolName: 'fs.write_xlsx', args: { path: relPath }, result: { ok: true, receipt: write.receipt } });
    const persisted = [];
    const store = makeRunStore({ io: { readAll: () => persisted.slice(), append: row => persisted.push(row) }, clock: { now: () => 1792540800000 } });
    const run = store.record({ runId, agentId, reason: 'done', title: 'synthetic XLSX acceptance', artifacts: collector.list(), startedAt: 1792540799000, endedAt: 1792540800000 });
    fs.writeFileSync(path.join(fixture.workspace, 'runs.jsonl'), JSON.stringify(run) + '\n', 'utf8');
    A.eq(run.artifacts, [{ kind: 'file', path: relPath, bytes: write.receipt.verifiedBytes }], 'verified receipt is persisted as a downloadable file artifact');
    await fixture.start({ STARNET_DEV: '1', STARNET_CRON_ENABLED: '0', STARNET_ENV_DISCOVERY: '0', STARNET_NIGHTSHIFT_ENABLED: '0', STARNET_LIVE_PRICES: '0' });
    const libraryRes = await fixture.request('/api/deliverables');
    const library = await libraryRes.json();
    A.eq(libraryRes.status, 200, 'Deliverables API responds successfully');
    const row = (library.items || []).find(item => item.runId === runId);
    const file = row && row.files && row.files[0];
    A.ok(file && file.path === relPath && file.bytes === write.receipt.verifiedBytes && file.preview === null && file.openUrl,
      'library lists XLSX with verified size and the ordinary file URL without adding a preview renderer');
    const download = await fixture.request(file.openUrl);
    const downloaded = Buffer.from(await download.arrayBuffer());
    A.eq(download.status, 200, 'existing authenticated file endpoint downloads the XLSX');
    A.ok(downloaded.equals(fs.readFileSync(path.join(fixture.workspace, agentId, relPath))), 'downloaded workbook bytes match the read-back verified file');
    const parsed = doc.xlsxRange(downloaded, { sheetIndex: 0, startRow: 1, rowCount: 2, startCol: 1, colCount: 2 });
    A.eq(parsed.rows[1].cells.map(c => c.value), ['Widget', '42'], 'downloaded artifact remains a readable workbook');
  } finally {
    await fixture.dispose();
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  A.report('deliverables-xlsx-artifact.e2e.test');
})().catch(error => { console.error(error); process.exit(1); });
