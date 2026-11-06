'use strict';
// Real HTTP scheduler + real local script. No model/mock provider, no user profile.
// Two one-minute firings with a host restart between them, then another due window.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { once } = require('events');
const { bootToken } = require('./_httpToken.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-bounded-cron-'));
const workspace = path.join(root, 'workspaces');
const agentDir = path.join(workspace, 'bounded');
const artifact = path.join(agentDir, 'receipts.jsonl');
let child, base, token;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit'); child.kill(); await exited; child = null;
}
async function boot() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  base = 'http://127.0.0.1:' + port;
  const env = Object.assign({}, process.env);
  for (const key of Object.keys(env)) {
    if (/^(STARNET_|SKYNET_)|KEY|TOKEN|SECRET|PASSWORD/i.test(key)) delete env[key];
  }
  Object.assign(env, {
    STARNET_PORT: String(port), STARNET_WORKSPACES: workspace,
    STARNET_CRON_TICK_MS: '250', STARNET_LOOP_ENABLED: '0', STARNET_EDGE_TTS: '0',
    HOME: root, USERPROFILE: root, LOCALAPPDATA: root, APPDATA: root, XDG_DATA_HOME: root,
  });
  // The production script runner resolves node on PATH, including on Windows.
  const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = path.dirname(process.execPath) + path.delimiter + (env[pathKey] || '');
  child = spawn(process.execPath, [path.resolve(__dirname, '../sidecar/index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let ready = false;
  child.stdout.on('data', d => { if (String(d).includes(base)) ready = true; });
  child.stderr.on('data', () => {});
  const until = Date.now() + 15000;
  while (!ready && Date.now() < until && child.exitCode === null) await sleep(100);
  assert.ok(ready, 'isolated host starts');
  token = await bootToken(base, base); assert.ok(token, 'host supplies session token');
}
async function api(method, route, body) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-StarNet-Token': token }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(r.status, 200, method + ' ' + route); return r.json();
}
async function waitForCount(id, expected) {
  const until = Date.now() + 85000;
  while (Date.now() < until) {
    const job = (await api('GET', '/api/cron')).jobs.find(j => j.id === id);
    if (job.repeat.completed >= expected) return job;
    assert.notEqual(job.state, 'error', 'scheduler must not silently fail');
    await sleep(250);
  }
  throw new Error('timed out awaiting scheduled settlement ' + expected);
}
(async () => {
  try {
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'receipt.cjs'), 'const fs = require("fs"); fs.appendFileSync("receipts.jsonl", JSON.stringify({result:"local-check-ok"}) + "\\n"); console.log("local-check-ok");\n');
    await boot();
    assert.equal((await api('GET', '/api/cron')).enabled, false, 'fresh station is disarmed');
    const { job } = await api('POST', '/api/cron', { name: 'Bounded local rehearsal', prompt: 'Record a local health receipt', schedule: 'every 1m', agentId: 'bounded', noAgent: true, script: 'receipt.cjs', unattendedGrants: ['workbench'], repeat: { times: 2 } });
    await api('POST', '/api/cron/arm', { enabled: true });
    const first = await waitForCount(job.id, 1);
    assert.equal(first.lastStatus, 'ok'); assert.equal(first.enabled, true);
    assert.equal(fs.readFileSync(artifact, 'utf8').trim().split('\n').length, 1);
    console.log('First scheduled script settled; restarting the isolated host.');
    await stop(); await boot();
    const restored = await api('GET', '/api/cron');
    assert.equal(restored.enabled, true, 'operator arm intent survives restart');
    assert.equal(restored.jobs.find(j => j.id === job.id).repeat.completed, 1, 'settlement counter survives restart');
    const second = await waitForCount(job.id, 2);
    assert.equal(second.lastStatus, 'ok'); assert.equal(second.enabled, false); assert.equal(second.state, 'completed');
    assert.equal(second.nextRunAt, null, 'exhaustion removes the next automatic fire');
    assert.equal(second.lastOutput, 'local-check-ok', 'real script output is durable');
    assert.notEqual(second.lastRunId, first.lastRunId, 'each firing has a separate run receipt');
    const bytes = fs.readFileSync(artifact, 'utf8');
    assert.equal(bytes.trim().split('\n').length, 2, 'exactly two real script executions');
    const transcript = await api('GET', '/api/transcript?agent=bounded&stream=cron-' + second.lastRunId + '&limit=20');
    assert.ok(transcript.turns.some(t => t.role === 'assistant' && t.content === 'local-check-ok'));
    console.log('Second scheduled script settled and stopped; checking another cadence window after restart.');
    await stop(); await boot();
    for (let i = 0; i < 65; i++) await sleep(1000);
    const final = (await api('GET', '/api/cron')).jobs.find(j => j.id === job.id);
    assert.equal(final.repeat.completed, 2); assert.equal(final.enabled, false);
    assert.equal(fs.readFileSync(artifact, 'utf8'), bytes, 'exhausted routine never fires a third time after restart');
    await api('POST', '/api/cron/arm', { enabled: false });
    console.log('cron.bounded-restart.e2e: PASS (real script, two firings, two restarts, durable output, no third firing; no model acceptance)');
  } finally {
    await stop();
    // Only this test-owned mkdtemp directory is removed.
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
