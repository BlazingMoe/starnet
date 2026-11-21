import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { CDP, connectCDP, evalJS } from '../scripts/lib/cdp.mjs';
import { page, acknowledgementAccepted, acknowledgementRequestAllowed } from '../scripts/station-browser-recovery.mjs';
const require = createRequire(import.meta.url);
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const Recovery = require('../sidecar/station-recovery.js');
const Save = require('../frontend/app/save.js');
const BrowserTools = require('../sidecar/tools/builtin/browser.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-browser-recovery-'));
const cli = path.join(process.cwd(), 'scripts', 'station-recovery.mjs');
const script = path.join(process.cwd(), 'scripts', 'station-browser-recovery.mjs');
const sourceRoot = path.join(root, 'source-workspaces');
const restoredRoot = path.join(root, 'restored-workspaces');
const bundlePath = path.join(root, 'station.bundle.json');
const browserOut = path.join(root, 'browser-import.json');
const profile = path.join(root, 'browser-profile');
const recoveryMarker = 'browser-only-canary-20261021';
const appPort = 8787;
const chrome = BrowserTools._internals.findChrome();
const saveDoc = { schema: 'starnet.save', version: Save.CURRENT, updatedAt: 1000, agent: { id: 'recovery-canary', name: 'Recovery Canary', model: 'test/replay', provider: 'replay' }, station: { rooms: [{ id: 'command' }], props: [] }, workstreams: [{ id: 'general', title: 'Browser recovery', messages: [{ role: 'user', content: 'synthetic recovery canary' }] }], activeId: 'general', generalId: 'general' };
const browserStore = { 'starnet.save': JSON.stringify(saveDoc), 'starnet.station.v1': JSON.stringify({ selectedRoom: 'command' }), 'starnet.recovery.browserMarker': recoveryMarker, 'starnet.credentials.apiKey': 'MUST_NOT_IMPORT' };
function runRecoveryPage({ failWriteAt = 0, rejectReceipt = false } = {}) {
  const data = new Map(); let writes = 0; let receipt;
  const localStorage = {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.get(k) ?? null; },
    setItem(k, v) { if (++writes === failWriteAt) { const e = new Error('quota exceeded'); e.name = 'QuotaExceededError'; throw e; } data.set(k, String(v)); },
    removeItem(k) { data.delete(k); }
  };
  const status = { textContent: '' };
  const document = { querySelector: () => status, body: { dataset: {} } };
  const html = page({ schema: 'starnet.browser-recovery', version: 1, store: { 'starnet.save': 'synthetic-save', 'starnet.extra': 'synthetic-extra' } }, { nonce: 'ab'.repeat(32), ackPath: '/secret/ack', origin: 'http://127.0.0.1:8787' });
  const scriptBody = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = { document, localStorage, crypto: webcrypto, TextEncoder, fetch: async (_url, options) => { receipt = JSON.parse(options.body); return { ok: !rejectReceipt }; } };
  vm.runInNewContext(scriptBody, context);
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const observe = () => {
      const state = document.body.dataset.recovery;
      if (state && receipt) return resolve({ data, receipt, state, status: status.textContent });
      if (Date.now() >= deadline) return reject(new Error('recovery page did not publish an observable receipt and final state'));
      setTimeout(observe, 10);
    };
    observe();
  });
}
function write(rel, value) {
  const file = path.join(sourceRoot, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}
function snapshot(dir) {
  const rows = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...snapshot(full).map(([name, hash]) => [path.join(entry.name, name), hash]));
    else if (entry.isFile()) rows.push([entry.name, crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')]);
  }
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
}
function childRun(file, args, env = process.env, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', timer;
    child.stdout.setEncoding('utf8').on('data', s => { stdout += s; });
    child.stderr.setEncoding('utf8').on('data', s => { stderr += s; });
    timer = setTimeout(() => { try { child.kill(); } catch (_) {} reject(new Error('child timed out: ' + path.basename(file) + ' ' + stderr.slice(-500))); }, timeoutMs);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
}
async function portBindable(port) {
  return new Promise(resolve => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, '127.0.0.1', () => s.close(() => resolve(true))); });
}
async function waitForPort(port, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { if (!(await portBindable(port))) return; await delay(50); }
  throw new Error('port did not become occupied: ' + port);
}
async function freePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(e => e ? reject(e) : resolve(port)); }); }); }
async function launchBrowser(url, profileDir, debuggingPort) {
  const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-gpu-compositing', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + debuggingPort, '--user-data-dir=' + profileDir, url], { stdio: 'ignore', windowsHide: true });
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  return { child, exit };
}
function hashSnapshot(rows) { return rows; }
async function checkCdpTimerLifecycle() {
  const listeners = {};
  const ws = { addEventListener: (type, fn) => { listeners[type] = fn; }, send: raw => { ws.last = JSON.parse(raw); } };
  const cdp = new CDP(ws);
  const response = cdp.send('Ping');
  const pending = cdp.pending.get(ws.last.id);
  const originalClearTimeout = globalThis.clearTimeout;
  let clearedRequestTimer = false;
  globalThis.clearTimeout = timer => { if (timer === pending.timer) clearedRequestTimer = true; return originalClearTimeout(timer); };
  try { listeners.message({ data: JSON.stringify({ id: ws.last.id, result: { ok: true } }) }); }
  finally { globalThis.clearTimeout = originalClearTimeout; }
  assert.deepEqual(await response, { ok: true });
  assert.equal(clearedRequestTimer, true, 'successful CDP response clears its timeout handle');

  const unresolved = cdp.send('Slow');
  const unresolvedEntry = cdp.pending.get(ws.last.id);
  assert.equal(unresolvedEntry.timer.hasRef(), true, 'unanswered CDP request retains its timeout guard');
  clearTimeout(unresolvedEntry.timer);
  cdp.pending.delete(ws.last.id);
  // Avoid an intentionally unresolved promise retaining test state; its timeout remains covered above.
  void unresolved;
}
let sidecar;
let browser;
let recoveryChild;
let cdp;
let cdpCloseSent = false;
try {
  await checkCdpTimerLifecycle();
  console.log('station-browser-recovery: CDP timer lifecycle passed');
  const nonce = crypto.randomBytes(32);
  const nonceHash = crypto.createHash('sha256').update(nonce).digest();
  const digest = 'ab'.repeat(32);
  const validReport = { nonce: nonce.toString('hex'), status: 'verified', records: 2, digest };
  assert.equal(acknowledgementAccepted(validReport, { nonceHash, digest, recordCount: 2 }), true);
  assert.equal(acknowledgementAccepted({ ...validReport, nonce: '00'.repeat(32) }, { nonceHash, digest, recordCount: 2 }), false, 'wrong nonce cannot authenticate a receipt');
  assert.equal(acknowledgementAccepted(validReport, { nonceHash, digest, recordCount: 2, alreadySettled: true }), false, 'receipt replay is rejected');
  assert.equal(acknowledgementAccepted({ ...validReport, digest: '00'.repeat(32) }, { nonceHash, digest, recordCount: 2 }), false, 'wrong staged-state digest cannot authenticate');
  const request = { method: 'POST', url: '/secret/ack', headers: { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787', 'content-type': 'application/json' } };
  assert.equal(acknowledgementRequestAllowed(request, { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787', ackPath: '/secret/ack' }), true);
  assert.equal(acknowledgementRequestAllowed({ ...request, headers: { ...request.headers, origin: 'https://attacker.invalid' } }, { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787', ackPath: '/secret/ack' }), false, 'cross-origin receipt is rejected');
  assert.equal(acknowledgementRequestAllowed({ ...request, headers: { ...request.headers, host: 'localhost:8787' } }, { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787', ackPath: '/secret/ack' }), false, 'unexpected Host receipt is rejected');
  const quotaFailure = await runRecoveryPage({ failWriteAt: 2 });
  assert.equal(quotaFailure.state, 'failed', 'quota failure is reported as a failed import');
  assert.deepEqual([...quotaFailure.data.keys()], [], 'quota failure rolls back prior localStorage writes');
  assert.equal(quotaFailure.receipt.status, 'failed', 'browser sends a failed receipt after rollback');
  const rejectedReceipt = await runRecoveryPage({ rejectReceipt: true });
  assert.equal(rejectedReceipt.state, 'failed', 'rejected browser receipt is a failed import');
  assert.deepEqual([...rejectedReceipt.data.keys()], [], 'rejected browser receipt rolls back staged values');
  console.log('station-browser-recovery: rollback and acknowledgement contracts passed');
  if (!chrome || !fs.existsSync(chrome)) {
    const message = 'station-browser-recovery needs installed Chrome/Chromium; configure STARNET_CHROME or SKYNET_CHROME to enable it.';
    if (process.env.CI === 'true') throw new Error(message);
    console.log('SKIP: ' + message);
  } else {
  assert.ok(await portBindable(appPort), 'default app loopback origin is available');
  const apiSave = { schema: 'starnet.save', version: Save.CURRENT, updatedAt: 1000, agent: { id: 'recovery-canary', name: 'Recovery Canary' }, station: { rooms: [{ id: 'command' }], props: [] } };
  const durable = { version: 1, agentId: 'recovery-canary', updatedAt: 1000, savedAt: 1000, doc: apiSave };
  write('agent.save.json', durable);
  write('agent.roster.json', { version: 1, agents: [{ agentId: 'recovery-canary', name: 'Recovery Canary', provider: 'replay', model: 'test/replay', system: 'synthetic test' }] });
  write('transcript.jsonl', '{}\n');
  write('agent.notebook.json', { entries: [] });
  write('cron.jobs.json', { jobs: [] });
  write('loops.json', { loops: [] });
  write('agent.todo.json', { items: [] });
  write('projects.json', { projects: [] });
  write('agent.deliverables.json', { records: [] });
  write('permissions.allow.json', { allow: [] });
  write('connectors/state.json', { configs: [], oauth: { byId: {}, clients: {} } });
  const bundle = Recovery.capture({ workspaceRoot: sourceRoot, browserStore, now: Date.now(), appVersion: 'synthetic-test', lastCompletedMutation: 1 });
  assert.equal(bundle.report.complete, true, 'synthetic browser recovery fixture covers all required workspace categories');
  Recovery.writeBundleAtomic({ bundle, file: bundlePath });
  const restored = await childRun(cli, ['restore', '--bundle', bundlePath, '--target', restoredRoot, '--browser-output', browserOut]);
  assert.equal(restored.code, 0, restored.stderr);
  const staged = JSON.parse(fs.readFileSync(browserOut, 'utf8'));
  assert.equal(staged.store['starnet.recovery.browserMarker'], recoveryMarker, 'offline CLI projection carries the browser-only canary');
  assert.equal(staged.store['starnet.credentials.apiKey'], undefined, 'offline CLI excludes browser credentials');

  // Run the recovery launcher asynchronously so probes can use its server while Chromium is active.
  recoveryChild = spawn(process.execPath, [script, '--browser-import', browserOut, '--profile', profile, '--headless'], { cwd: process.cwd(), env: { ...process.env, SKYNET_CHROME: chrome }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let recoveryStdout = '', recoveryStderr = '';
  recoveryChild.stdout.setEncoding('utf8').on('data', s => { recoveryStdout += s; });
  recoveryChild.stderr.setEncoding('utf8').on('data', s => { recoveryStderr += s; });
  const recoveryExit = new Promise(resolve => recoveryChild.once('exit', (code, signal) => resolve({ code, signal })));
  await waitForPort(appPort);
  for (const url of [`http://127.0.0.1:${appPort}/`, `http://127.0.0.1:${appPort}/index.html`]) {
    const response = await fetch(url);
    assert.equal(response.status, 404, 'recovery server rejects predictable path ' + new URL(url).pathname);
    assert.doesNotMatch(await response.text(), /starnet\.save|Recovery Canary/, 'predictable path reveals no recovery payload');
  }
  const recovered = await recoveryExit;
  assert.equal(recovered.code, 0, recoveryStderr.slice(-1000));
  const recoveryReceipt = JSON.parse(recoveryStdout);
  assert.equal(recoveryReceipt.ok, true, 'CLI success follows authenticated browser acknowledgement and clean close');
  assert.equal(recoveryReceipt.records, 3, 'browser marker restored while credential-like record remains excluded');
  assert.doesNotMatch(recoveryStdout + recoveryStderr, new RegExp(recoveryMarker + '|MUST_NOT_IMPORT|[a-f0-9]{64}'), 'receipt and logs disclose neither imported values nor random route/nonce/digest');

  // Start the production sidecar on the exact same loopback origin and boot Chromium with the same
  // dedicated profile. Keep this process asynchronous so it can serve the browser under test.
  sidecar = SidecarFixture.create({ prefix: 'starnet-browser-recovery-boot-', env: {
    SKYNET_DEV: '1', SKYNET_CRON_ENABLED: '0', SKYNET_LOOP_ENABLED: '0', SKYNET_EDGE_TTS: '0',
    OPENROUTER_API_KEY: '', SKYNET_OPENROUTER_KEY: '', STARNET_OPENROUTER_KEY: '', OPENAI_API_KEY: '',
    STARNET_DEFAULT_MODEL: 'test/replay', SKYNET_DEFAULT_MODEL: 'test/replay'
  }, timeoutMs: 15000, portAllocator: async () => appPort });
  fs.rmSync(sidecar.workspace, { recursive: true, force: true });
  sidecar.workspace = restoredRoot;
  await sidecar.start();
  const cdpPort = await freePort();
  browser = await launchBrowser(sidecar.baseUrl + '/', profile, cdpPort);
  cdp = await connectCDP(cdpPort);
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: sidecar.baseUrl + '/' });
  let boot = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const pageOrigin = await evalJS(cdp, 'location.origin');
    if (pageOrigin !== sidecar.baseUrl) { await delay(200); continue; }
    boot = await evalJS(cdp, `({marker:localStorage.getItem('starnet.recovery.browserMarker'), screen:document.querySelector('.screen.active')?.id||'', text:(document.body?.innerText||'').slice(0,300)})`);
    if (boot.marker === recoveryMarker && boot.screen === 'screen-game') break;
    await delay(200);
  }
  assert.equal(boot.marker, recoveryMarker, 'browser-only state survives close and reopens in the same profile/origin');
  assert.equal(boot.screen, 'screen-game', 'normal StarNet app boot completes from the restored browser profile');
  assert.match(boot.text, /Recovery Canary/i, 'normal app UI hydrates the restored agent identity');
  cdp.ws.send(JSON.stringify({ id: 999, method: 'Browser.close' }));
  cdpCloseSent = true;
  const browserDone = await Promise.race([browser.exit, delay(5000).then(() => null)]);
  if (!browserDone) { try { browser.child.kill(); } catch (_) {} }
  await browser.exit;
  cdp.ws.close();
  browser = null;
  await sidecar.dispose(); sidecar = null;

  // Existing destination, corrupt import, parent/profile symlinks and port collision are all fail-closed.
  const beforeReplay = hashSnapshot(snapshot(profile));
  const replay = await childRun(script, ['--browser-import', browserOut, '--profile', profile, '--headless'], { ...process.env, SKYNET_CHROME: chrome });
  assert.notEqual(replay.code, 0);
  assert.match(replay.stderr, /profile destination already exists/);
  assert.deepEqual(snapshot(profile), beforeReplay, 'replay refusal preserves all profile bytes');
  const corrupt = path.join(root, 'corrupt.json'); fs.writeFileSync(corrupt, '{broken');
  const corruptProfile = path.join(root, 'corrupt-profile');
  const bad = await childRun(script, ['--browser-import', corrupt, '--profile', corruptProfile, '--headless'], { ...process.env, SKYNET_CHROME: chrome });
  assert.notEqual(bad.code, 0); assert.equal(fs.existsSync(corruptProfile), false);
  const oversized = path.join(root, 'oversized.json'); fs.writeFileSync(oversized, Buffer.alloc(20 * 1024 * 1024 + 1));
  const oversizedProfile = path.join(root, 'oversized-profile');
  const tooLarge = await childRun(script, ['--browser-import', oversized, '--profile', oversizedProfile, '--headless'], { ...process.env, SKYNET_CHROME: chrome });
  assert.notEqual(tooLarge.code, 0); assert.match(tooLarge.stderr, /20 MiB recovery limit/); assert.equal(fs.existsSync(oversizedProfile), false);
  const linkedParent = path.join(root, 'linked-parent');
  try {
    fs.symlinkSync(root, linkedParent, 'junction');
    const linkedProfile = path.join(linkedParent, 'profile');
    const linked = await childRun(script, ['--browser-import', browserOut, '--profile', linkedProfile, '--headless'], { ...process.env, SKYNET_CHROME: chrome });
    assert.notEqual(linked.code, 0); assert.match(linked.stderr, /must not be a symbolic link/); assert.equal(fs.existsSync(path.join(root, 'profile')), false);
  } catch (e) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(e?.code)) throw e;
    console.log('SKIP: profile-parent symlink creation unavailable on this host (' + e.code + ')');
  }
  const earlyProfile = path.join(root, 'early-close-profile');
  const earlyClose = await childRun(script, ['--browser-import', browserOut, '--profile', earlyProfile, '--chrome', process.execPath], { ...process.env, SKYNET_CHROME: chrome });
  assert.notEqual(earlyClose.code, 0, 'browser exit before authenticated acknowledgement is failure');
  assert.match(earlyClose.stderr, /closed before authenticated recovery verification/);
  assert.doesNotMatch(earlyClose.stdout, /"ok"\s*:\s*true/, 'early browser close can never produce a successful recovery receipt');
  const occupied = http.createServer();
  await new Promise((resolve, reject) => { occupied.once('error', reject); occupied.listen(appPort, '127.0.0.1', resolve); });
  const blockedProfile = path.join(root, 'blocked-profile');
  const blocked = await childRun(script, ['--browser-import', browserOut, '--profile', blockedProfile, '--headless'], { ...process.env, SKYNET_CHROME: chrome });
  await new Promise(resolve => occupied.close(resolve));
  assert.notEqual(blocked.code, 0); assert.equal(fs.existsSync(blockedProfile), false);
  console.log('station-browser-recovery: authenticated isolated import, same-profile normal app boot, replay/corrupt/port refusal passed');
  }
} finally {
  if (cdp && !cdpCloseSent) { try { cdp.ws.send(JSON.stringify({ id: 998, method: 'Browser.close' })); cdpCloseSent = true; } catch (_) {} }
  if (browser?.child && browser.child.exitCode === null) {
    await Promise.race([browser.exit, delay(5000)]);
    if (browser.child.exitCode === null) { try { browser.child.kill(); } catch (_) {} }
    await browser.exit;
  }
  try { cdp?.ws.close(); } catch (_) {}
  if (recoveryChild && recoveryChild.exitCode === null) { try { recoveryChild.kill(); } catch (_) {} }
  if (sidecar) await sidecar.dispose();
  try { fs.rmSync(root, { recursive: true, force: true }); }
  catch (e) { console.error('cleanup failed for owned synthetic root (' + e.code + '): ' + root); }
}
