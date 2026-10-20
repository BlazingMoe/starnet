#!/usr/bin/env node
// Import the browser-owned part of an OFFLINE station restore into a new Chromium profile.
// This server exposes one recovery document and no application/API routes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Backup = require('../frontend/app/backup.js');
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error('unexpected argument: ' + a);
    const eq = a.indexOf('=');
    const k = a.slice(2, eq < 0 ? undefined : eq);
    out[k] = eq >= 0 ? a.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
  }
  return out;
}
function required(v, key) { if (!v || v === true) throw new Error('--' + key + ' is required'); return path.resolve(String(v)); }
function loadPayload(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES) throw new Error('browser import exceeds the 20 MiB recovery limit or is not a regular file');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const error = Backup.validate(doc);
  if (error) throw new Error('browser import is invalid: ' + error);
  const store = {};
  for (const [raw, value] of Object.entries(doc.store)) {
    if ((raw.startsWith('starnet.') || raw.startsWith('skynet.')) && typeof value === 'string' && !Backup.isCredentialKey(raw)) {
      const key = raw.startsWith('skynet.') ? 'starnet.' + raw.slice(7) : raw;
      store[key] = value;
    }
  }
  if (!store['starnet.save']) throw new Error('browser import has no nonsecret starnet.save');
  const recordBytes = Object.entries(store).reduce((n, [key, value]) => n + (key.length + value.length) * 2, 0);
  if (recordBytes > 8 * 1024 * 1024) throw new Error('browser import exceeds the 8 MiB localStorage recovery limit');
  return { schema: 'starnet.browser-recovery', version: 1, store };
}
function assertFreshProfile(profile) {
  const parsed = path.parse(profile);
  let current = parsed.root;
  for (const segment of profile.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch (e) { if (e && e.code === 'ENOENT') continue; throw e; }
    if (stat.isSymbolicLink()) throw new Error('browser profile path or parent must not be a symbolic link');
    if (current === profile) throw new Error('profile destination already exists; choose a new dedicated browser profile directory');
    if (!stat.isDirectory()) throw new Error('browser profile parent must be a directory');
  }
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const port = srv.address().port; srv.close(e => e ? reject(e) : resolve(port)); });
  });
}
function page(payload, { nonce, ackPath, origin }) {
  const safe = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><meta charset="utf-8"><title>StarNet Offline Browser Recovery</title>
<main><h1>StarNet offline browser recovery</h1><p id="status">Verifying a new browser profile and restoring browser-owned records…</p></main>
<script>(()=>{const payload=${safe},status=document.querySelector('#status'),prefix='starnet.',nonce=${JSON.stringify(nonce)};try{
if(payload.schema!=='starnet.browser-recovery'||payload.version!==1||!payload.store||typeof payload.store!=='object')throw Error('Invalid staged recovery data');
for(let i=0;i<localStorage.length;i++)if(localStorage.key(i).startsWith(prefix)||localStorage.key(i).startsWith('skynet.'))throw Error('This browser profile already has StarNet data; no changes were made. Choose a new profile directory.');
const keys=Object.keys(payload.store);if(!keys.includes('starnet.save')||keys.some(k=>!k.startsWith(prefix)||typeof payload.store[k]!=='string'))throw Error('Staged data failed its safety check');
const written=[];try{for(const k of keys){localStorage.setItem(k,payload.store[k]);written.push(k)}for(const k of keys)if(localStorage.getItem(k)!==payload.store[k])throw Error('Read-back verification failed');}
catch(e){for(const k of written)localStorage.removeItem(k);throw e;}
const hash=()=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload.store))).then(buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join(''));
hash().then(digest=>fetch(${JSON.stringify(ackPath)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce,status:'verified',records:keys.length,digest})})).then(r=>{if(!r.ok)throw Error('Recovery acknowledgement was rejected');status.textContent='Browser state restored and verified ('+keys.length+' records). Close this browser window before starting StarNet. Reuse this same browser profile and '+${JSON.stringify(origin)}+' origin.';document.body.dataset.recovery='verified';}).catch(e=>{for(const k of keys){try{localStorage.removeItem(k)}catch(_){}}status.textContent='Recovery stopped: '+e.message;document.body.dataset.recovery='failed';});
}catch(e){status.textContent='Recovery stopped: '+e.message;document.body.dataset.recovery='failed';const hash=()=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload.store))).then(buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join(''));hash().then(digest=>fetch(${JSON.stringify(ackPath)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce,status:'failed',records:0,digest})})).catch(()=>{});}})();</script>`;
}
function acknowledgementAccepted(report, { nonceHash, digest, recordCount, alreadySettled = false }) {
  if (!report || typeof report !== 'object' || alreadySettled) return false;
  const got = Buffer.from(String(report.nonce || ''), 'hex');
  const verified = report.status === 'verified' && report.records === recordCount;
  const failed = report.status === 'failed' && report.records === 0;
  return got.length === nonceHash.length
    && crypto.timingSafeEqual(crypto.createHash('sha256').update(got).digest(), nonceHash)
    && (verified || failed) && report.digest === digest;
}
function acknowledgementRequestAllowed(req, { host, origin, ackPath }) {
  return req.method === 'POST' && req.url === ackPath && req.headers.host === host
    && req.headers.origin === origin && req.headers['content-type'] === 'application/json';
}
async function main() {
  const a = argsOf(process.argv.slice(2));
  const input = required(a['browser-import'], 'browser-import');
  const profile = required(a.profile, 'profile');
  const chrome = a.chrome && a.chrome !== true ? path.resolve(String(a.chrome)) : (process.env.SKYNET_CHROME || process.env.STARNET_CHROME || '');
  if (!chrome || !fs.existsSync(chrome) || !fs.statSync(chrome).isFile()) throw new Error('Set --chrome to an installed Chrome/Chromium executable (or SKYNET_CHROME).');
  const payload = loadPayload(input);
  assertFreshProfile(profile);
  const token = crypto.randomBytes(32).toString('hex');
  const nonce = crypto.randomBytes(32).toString('hex');
  const nonceHash = crypto.createHash('sha256').update(Buffer.from(nonce, 'hex')).digest();
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload.store)).digest('hex');
  const pathOnly = '/' + token;
  const ackPath = pathOnly + '/ack';
  const port = 8787;
  const origin = 'http://127.0.0.1:' + port;
  let ackResolve;
  let ackSettled = false;
  const ackPromise = new Promise(resolve => { ackResolve = resolve; });
  let server;
  let child;
  try {
    const html = page(payload, { nonce, ackPath, origin });
    server = http.createServer((req, res) => {
      const hostOk = req.headers.host === '127.0.0.1:' + port;
      if (!hostOk) { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end(); }
      if (req.method === 'GET' && req.url === pathOnly) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        return res.end(html);
      }
      if (req.url === ackPath && req.method === 'POST') {
        if (!acknowledgementRequestAllowed(req, { host: '127.0.0.1:' + port, origin, ackPath })) { res.writeHead(403, { 'Cache-Control': 'no-store' }); return res.end(); }
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 1024) req.destroy(); });
        req.on('end', () => {
          try {
            const report = JSON.parse(body);
            if (!acknowledgementAccepted(report, { nonceHash, digest, recordCount: Object.keys(payload.store).length, alreadySettled: ackSettled })) throw new Error('invalid receipt');
            const verified = report.status === 'verified';
            ackSettled = true;
            ackResolve({ ok: verified, records: verified ? report.records : 0, digest });
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"ok":true}');
          } catch (_) { res.writeHead(403, { 'Cache-Control': 'no-store' }); res.end(); }
        });
        return;
      }
      res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end();
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    try { fs.mkdirSync(profile, { recursive: false }); }
    catch (e) { if (e && e.code === 'EEXIST') throw new Error('profile destination already exists; choose a new dedicated browser profile directory'); throw e; }
    const headless = !!a.headless;
    const debugPort = headless ? await freePort() : null;
    child = spawn(chrome, ['--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', ...(headless ? ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-gpu-compositing', '--remote-debugging-port=' + debugPort] : []), origin + pathOnly], { stdio: headless ? 'ignore' : 'inherit', windowsHide: false });
    const exitPromise = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    let ackTimer;
    let early;
    try {
      early = await Promise.race([ackPromise.then(receipt => ({ receipt })), exitPromise.then(exit => ({ exit })), new Promise((_, reject) => { ackTimer = setTimeout(() => reject(new Error('browser recovery was not authenticated within 60 seconds')), 60000); })]);
    } finally { clearTimeout(ackTimer); }
    if (early.exit) throw new Error('Chromium closed before authenticated recovery verification');
    const receipt = early.receipt;
    if (headless) {
      const version = await fetch('http://127.0.0.1:' + debugPort + '/json/version').then(r => r.json());
      const ws = new WebSocket(version.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
      ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      const cleanExit = await Promise.race([exitPromise, new Promise(resolve => setTimeout(() => resolve(null), 5000))]);
      ws.close();
      if (!cleanExit) throw new Error('headless Chromium did not close after verified recovery');
    }
    const exit = await exitPromise;
    if (exit.code !== 0 || exit.signal) throw new Error('Chromium did not close cleanly after verified recovery');
    if (!receipt.ok) throw new Error('browser recovery failed its storage checks; no successful restore was recorded');
    console.log(JSON.stringify({ ok: true, action: 'browser-recovery', profile, origin, records: receipt.records, next: 'Start the restored StarNet sidecar on port 8787, then open this same origin in Chromium with this same --user-data-dir profile. The recovery-only server has now released the port.' }, null, 2));
  } finally {
    if (child && child.exitCode === null && !child.signalCode) { try { child.kill(); } catch (_) {} }
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
export { page, acknowledgementAccepted, acknowledgementRequestAllowed };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(JSON.stringify({ ok: false, action: 'browser-recovery', error: e.message || String(e) }, null, 2)); process.exitCode = 1; });
}
