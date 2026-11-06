/* node test/deliverables-csv-artifact.e2e.test.js — a synthetic, no-model proof of the forward CSV path:
   verified fs.write_csv receipt -> run artifact ledger -> real sidecar Deliverables API/file route ->
   production browser OPEN handler and safe CSV preview. The isolated profile is discarded at test end. */
'use strict';

const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const { makeArtifactCollector } = require('../sidecar/artifacts.js');
const { makeRunStore } = require('../sidecar/runstore.js');
const D = require('../frontend/app/deliverables.js');

(async () => {
  const fixture = SidecarFixture.create({ prefix: 'starnet-csv-deliverable-', timeoutMs: 20000 });
  const oldWindow = global.window;
  try {
    const agentId = 'csvfixture';
    const runId = 'fixture-csv-run-20261019';
    const relPath = 'acceptance/findings.csv';
    const csv = 'item,amount\r\nWidget,42\r\n"Widget, deluxe",7\r\n';
    const artifactPath = path.join(fixture.workspace, agentId, relPath);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, csv, 'utf8');
    const verifiedBytes = Buffer.byteLength(csv, 'utf8');

    // This receipt is the production fs.write_csv success shape: matching path and byte-exact read-back proof.
    const collector = makeArtifactCollector();
    collector.observe({
      toolName: 'fs.write_csv',
      args: { path: relPath },
      result: {
        ok: true,
        receipt: { path: relPath, state: 'read-back-verified', verifiedBytes }
      }
    });
    const persisted = [];
    const runStore = makeRunStore({
      io: { readAll: () => persisted.slice(), append: row => persisted.push(row) },
      clock: { now: () => 1792435200000 }
    });
    const run = runStore.record({
      runId, agentId, reason: 'done', title: 'synthetic CSV acceptance',
      artifacts: collector.list(), startedAt: 1792435199000, endedAt: 1792435200000
    });
    fs.writeFileSync(path.join(fixture.workspace, 'runs.jsonl'), JSON.stringify(run) + '\n', 'utf8');
    A.eq(run.artifacts, [{ kind: 'file', path: relPath, bytes: verifiedBytes }],
      'the production collector receipt becomes a byte-sized run artifact');

    await fixture.start({
      STARNET_DEV: '1', STARNET_CRON_ENABLED: '0', STARNET_ENV_DISCOVERY: '0',
      STARNET_NIGHTSHIFT_ENABLED: '0', STARNET_LIVE_PRICES: '0'
    });

    const libraryRes = await fixture.request('/api/deliverables');
    const library = await libraryRes.json();
    A.eq(libraryRes.status, 200, 'isolated sidecar Deliverables API responds successfully');
    const row = (library.items || []).find(item => item.runId === runId);
    A.ok(row && row.status === 'produced', 'persisted synthetic run appears as a completed library row');
    const file = row && row.files && row.files[0];
    A.ok(file && file.path === relPath && file.bytes === verifiedBytes && file.preview === 'csv' && file.openUrl,
      'the library classifies the persisted .csv artifact with its verified size and OPEN preview URL');

    // Run the real browser OPEN handler against the real sidecar file endpoint and a minimal card host.
    global.window = { __STARNET_API__: fixture.baseUrl, __STARNET_API_TOKEN__: fixture.token };
    const host = { innerHTML: '' };
    const card = { dataset: { i: '0' }, querySelector: selector => selector === '[data-preview]' ? host : null };
    const link = { dataset: { file: '0' }, closest: selector => selector === 'a[data-file]' || selector === '[data-i]' ? card : null };
    // closest() on the anchor returns itself for a[data-file], as the delegated production handler expects.
    link.closest = selector => selector === 'a[data-file]' ? link : (selector === '[data-i]' ? card : null);
    const event = { target: link, preventDefault() {}, stopPropagation() {} };
    await D.handleOpenClick(event, [row]);
    A.ok(host.innerHTML.includes('SAFE PREVIEW · ' + relPath), 'the production OPEN handler renders its SAFE PREVIEW heading');
    A.ok(host.innerHTML.includes('<th>item</th>') && host.innerHTML.includes('<td>Widget, deluxe</td>')
      && host.innerHTML.includes('<td>7</td>'), 'the browser CSV renderer reads the real API bytes and parses quoted commas');
    A.eq((host.innerHTML.match(/<tr>/g) || []).length, 3, 'CRLF-terminated writer output renders exactly three records without an invented blank row');
  } finally {
    global.window = oldWindow;
    await fixture.dispose();
    // Let Windows finish closing the sidecar child's stdio/process handles before report() exits Node.
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  A.report('deliverables-csv-artifact.e2e.test');
})().catch(error => { console.error(error); process.exit(1); });
