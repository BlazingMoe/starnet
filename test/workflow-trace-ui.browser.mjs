/* Manual browser fixture for the workflow trace row. Uses the production wallClock/decisionTrail/row functions
   with synthetic ledger data, opens only a data URL in isolated headless Chromium, and writes one screenshot to
   the OS temp directory for visual inspection. It never starts the station or contacts a provider. */
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { connectCDP, evalJS, findChrome, sleep } from '../scripts/lib/cdp.mjs';

const source = fs.readFileSync(new URL('../frontend/app/windows/routines.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const wall = source.slice(source.indexOf('  function wallClock(iso, timeZone) {'), source.indexOf('\n  /* cron.js'));
const decision = source.slice(source.indexOf('    function decisionTrail(j) {'), source.indexOf('\n    // TICKER HEALTH'));
const rowSource = source.slice(source.indexOf('    function row(j) {'), source.indexOf('    async function refresh()'));
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const ledger = [
  { jobId: 'routine-fixture', runId: 'scheduled-run-20261025', binding: 'workflow-trace', ts: Date.now(), detail: { observedDecisionCount: 2, retainedDecisionCount: 2, traceTruncated: false } },
  { jobId: 'routine-fixture', runId: 'scheduled-run-20261025', binding: 'workflow-decision', detail: { index: 0, kind: 'route', outcome: 'route', junction: '2,3', lane: 'N', selectedAgent: 'writer', fanoutCount: 2 } },
  { jobId: 'routine-fixture', runId: 'scheduled-run-20261025', binding: 'workflow-decision', detail: { index: 1, kind: 'filter', outcome: 'selected', junction: '<img src=x>' } },
  { jobId: 'routine-fixture', runId: 'scheduled-run-20261025', binding: 'schedule', kind: 'fire', ts: Date.now(), detail: { scheduledFor: Date.now() } },
];
const rowHtml = vm.runInNewContext(wall + '\n' + decision + '\n' + rowSource + '\nrow(job)', {
  job: { id: 'routine-fixture', name: 'Synthetic workflow rehearsal', enabled: true, scheduleDisplay: 'every 1h' },
  recentCronDecisions: ledger, esc, fmtRel: String, human: String, schedulerArmed: true,
  runsLine: () => 'runs as Writer', lastResult: () => '<span class="pos">✓ ok</span>', spendLine: () => '',
  failureStreakLine: () => '', deliveryLine: () => '',
});
const page = '<!doctype html><meta charset="utf-8"><title>Routines workflow trace fixture</title>' +
  '<style>body{background:#111820;color:#eaf0f4;font:15px Segoe UI,Arial;margin:0;padding:36px}.mc-row{max-width:1050px;background:#202b35;border:1px solid #536273;border-radius:8px;padding:20px}.mc-detail{margin-top:10px;line-height:1.55}.dim{color:#bfccd7}.pos{color:#9bd6ae}.mc-url{margin-top:10px}.mc-acts{display:flex;gap:8px;margin-top:16px}button{background:#26394a;color:#e8eef5;border:1px solid #687c8e;border-radius:5px;padding:8px}</style>' +
  '<h1>Routines</h1>' + rowHtml;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-workflow-trace-browser-'));
const fixturePath = path.join(scratch, 'workflow-trace-ui.fixture.html');
fs.writeFileSync(fixturePath, page);
if (process.argv.includes('--render-only')) {
  console.log(JSON.stringify({ ok: true, fixture: fixturePath, note: 'production routine renderer with synthetic ledger rows', renderedHtml: rowHtml }));
  process.exit(0);
}
const profile = path.join(scratch, 'profile'); fs.mkdirSync(profile);
const screenshot = path.join(os.tmpdir(), 'starnet-workflow-trace-' + process.pid + '.png');
const cdpPort = await new Promise((resolve, reject) => {
  const server = net.createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
});
const chrome = spawn(findChrome(), [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${cdpPort}`,
  '--window-size=1200,800', `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', chunk => process.stderr.write(String(chunk)));
chrome.once('exit', (code, signal) => console.error('Chromium exit:', code, signal));
let cdp;
try {
  cdp = await connectCDP(cdpPort);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(page) });
  await sleep(700);
  const evidence = await evalJS(cdp, `(() => { const row = document.querySelector('.mc-row'); return { text: row && row.innerText, escaped: !!row && row.innerHTML.includes('&lt;img src=x&gt;'), injected: !!(row && row.querySelector('img')) }; })()`);
  if (!evidence || !String(evidence.text || '').includes('scheduled workflow choices for run scheduled-ru')) throw new Error('production routine row did not render expected workflow summary: ' + JSON.stringify(evidence));
  if (!evidence.escaped || evidence.injected) throw new Error('hostile synthetic junction was not rendered as escaped text');
  const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(screenshot, Buffer.from(image.data, 'base64'));
  console.log(JSON.stringify({ ok: true, screenshot, fixture: fixturePath, evidence }));
} finally {
  try { cdp?.ws?.close(); } catch {}
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    await Promise.race([exited, sleep(5000).then(() => { throw new Error('Chromium did not exit before fixture cleanup'); })]);
  }
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  const resolvedScratch = path.resolve(scratch);
  if (!resolvedScratch.startsWith(tempRoot)) throw new Error('Refusing to clean fixture outside the OS temp directory');
  let cleanupError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(resolvedScratch, { recursive: true, force: true });
      if (!fs.existsSync(resolvedScratch)) { cleanupError = null; break; }
      cleanupError = new Error('Fixture scratch directory remains after cleanup');
    } catch (error) { cleanupError = error; }
    if (attempt < 4) await sleep(250);
  }
  if (cleanupError) throw cleanupError;
}
