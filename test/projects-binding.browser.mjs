/* Production Projects rail binding check. Synthetic sidecar/project only; no real account or provider call. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { bootSeededSidecar, materializeSeedWorkspace, waitUp } from '../scripts/lib/seed.mjs';
import { connectCDP, evalJS, sleep } from '../scripts/lib/cdp.mjs';
import { collectDiagnostics } from '../scripts/lib/cdp.mjs';
import { bootToken } from './_httpToken.js';

process.env.SKYNET_CHROME ||= 'F:/chrome-win/chrome.exe';

async function freePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
async function eventually(fn, label, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const result = await fn();
    if (result) return result;
    await sleep(250);
  }
  throw new Error('timed out waiting for ' + label);
}
function tempPath(p) {
  const base = path.resolve(os.tmpdir()) + path.sep;
  const resolved = path.resolve(p);
  if (!resolved.startsWith(base)) throw new Error('refusing cleanup outside OS temp root: ' + resolved);
  return resolved;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-project-binding-browser-'));
const workspace = path.join(scratch, 'workspace');
materializeSeedWorkspace(workspace);
const project = path.join(scratch, 'synthetic-project');
fs.mkdirSync(path.join(project, '.git'), { recursive:true });
fs.writeFileSync(path.join(project, 'synthetic.txt'), 'synthetic project fixture');
const port = await freePort();
let cdpPort = await freePort();
while (cdpPort === port) cdpPort = await freePort();
const base = 'http://127.0.0.1:' + port;
const browserProfile = path.join(scratch, 'chromium-profile'); fs.mkdirSync(browserProfile);
let sidecar = null, chrome = null, cdp = null, chromeError = '';
let screenshotPath = '';
  const requestHeaders = [], projectNetwork = [], projectRequestIds = new Set();
try {
  sidecar = bootSeededSidecar({ port, scratchDir:workspace, fullAccess:true });
  if (!(await waitUp(base, 90))) throw new Error('seeded sidecar failed to become ready');
  const apiToken = await bootToken(base, base);
  if (!apiToken) throw new Error('sidecar did not issue the API token');
  const hdr = { 'Content-Type':'application/json', 'X-StarNet-Token':apiToken, Origin:base };
  const bless = await fetch(base + '/api/projects/bless', { method:'POST', headers:hdr, body:JSON.stringify({ path:project }) });
  if (!bless.ok) throw new Error('synthetic project bless failed: ' + bless.status + ' ' + await bless.text());
  const blessed = await bless.json();

  chrome = spawn(process.env.SKYNET_CHROME, [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${cdpPort}`,
    '--window-size=1440,1000', `--user-data-dir=${browserProfile}`, 'about:blank'
  ], { stdio:['ignore','ignore','pipe'], windowsHide:true });
  chrome.stderr.on('data', chunk => { chromeError += chunk.toString(); });
  cdp = await connectCDP(cdpPort);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  const pageDiagnostics = collectDiagnostics(cdp);
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.url.includes('/api/projects/lesson-binding')) requestHeaders.push(event.request.headers || {});
    if (event.request.url.includes('/api/projects')) {
      projectRequestIds.add(event.requestId);
      projectNetwork.push({type:'request',url:event.request.url,method:event.request.method,headers:event.request.headers});
    }
  });
  cdp.on('Network.responseReceived', event => { if (projectRequestIds.has(event.requestId)) projectNetwork.push({type:'response',url:event.response.url,status:event.response.status}); });
  cdp.on('Network.loadingFinished', event => { if (projectRequestIds.has(event.requestId)) projectNetwork.push({type:'finished',bytes:event.encodedDataLength}); });
  cdp.on('Network.loadingFailed', event => { if (projectRequestIds.has(event.requestId)) projectNetwork.push({type:'failed',error:event.errorText}); });
  await cdp.send('Page.navigate', { url:base + '/' });
  await eventually(() => evalJS(cdp, `!!window.__STARNET_DEV__ && !!document.querySelector('#screen-game.active')`).catch(() => false), 'seeded station floor');
  await evalJS(cdp, `document.querySelector('#ws-tab-projects').click()`);
  try {
    await eventually(() => evalJS(cdp, `document.querySelector('#projects .lesson-bind')?.dataset.action === 'bind'`).catch(() => false), 'unbound project control');
  } catch (error) {
    const dom = await evalJS(cdp, `(()=>({url:location.href,screen:(document.querySelector('.screen.active')||{}).id,tab:document.querySelector('#ws-tab-projects')?.outerHTML,projectsHidden:document.querySelector('#projects')?.hidden,projects:document.querySelector('#projects')?.innerText,rows:[...document.querySelectorAll('#projects li')].map(x=>({root:x.dataset.root,text:x.innerText,html:x.outerHTML.slice(0,500)})),apiToken:!!window.__STARNET_API_TOKEN__,fetchHardened:!!window.__STARNET_FETCH_HARDENED__}))()`);
    const directFetch = await evalJS(cdp, `Promise.race([fetch('/api/projects').then(async r=>({status:r.status,text:(await r.text()).slice(0,1000)})),new Promise(resolve=>setTimeout(()=>resolve('fetch-timeout'),3000))])`).catch(e=>'fetch-error:'+e.message);
    console.error('Projects rail DOM at timeout:', JSON.stringify({dom,directFetch,projectNetwork,pageDiagnostics}));
    throw error;
  }
  const initial = await evalJS(cdp, `(()=>{const li=[...document.querySelectorAll('#projects .proj-row')].find(x=>x.dataset.root===${JSON.stringify(blessed.root)});return li?{text:li.innerText,button:li.querySelector('.lesson-bind')?.innerText,box:li.querySelector('.lesson-binding')?.getBoundingClientRect().toJSON(),row:li.getBoundingClientRect().toJSON()}:null})()`);
  if (!initial || !initial.text.includes('No lesson context bound') || initial.button !== 'Bind for lesson proposals') throw new Error('production Projects rail did not show the operator bind control: ' + JSON.stringify(initial));
  if (initial.box.right > initial.row.right + 1) throw new Error('unbound controls overflow the project row: ' + JSON.stringify(initial));
  await evalJS(cdp, `window.confirm=()=>true;document.querySelector('#projects .lesson-bind[data-action="bind"]').focus()`);
  const focusedBind = await evalJS(cdp, `document.activeElement===document.querySelector('#projects .lesson-bind[data-action="bind"]')`);
  if (!focusedBind) throw new Error('binding control could not receive keyboard focus');
  await evalJS(cdp, `document.querySelector('#projects .lesson-bind[data-action="bind"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  if (await evalJS(cdp, `!!document.querySelector('#projects .proj-crumb')`)) throw new Error('nested button Enter key was intercepted as project-row activation');
  await evalJS(cdp, `document.querySelector('#projects .lesson-bind[data-action="bind"]').click()`);
  await eventually(() => evalJS(cdp, `document.querySelector('#projects .lesson-binding')?.innerText.includes('Lesson context bound')`).catch(() => false), 'bound state render');
  let saved = await (await fetch(base + '/api/projects', { headers:{ 'X-StarNet-Token':apiToken, Origin:base } })).json();
  let row = saved.projects.find(p => p.root === blessed.root);
  if (!row?.lessonProjectId) throw new Error('UI binding did not persist through token-authenticated API');
  const firstId = row.lessonProjectId;
  await eventually(() => requestHeaders.some(h => Object.keys(h).some(k => k.toLowerCase() === 'x-starnet-token' && h[k])), 'API token on browser binding request');
  const rebindButton = await evalJS(cdp, `!!document.querySelector('#projects .lesson-bind[data-action="rebind"]')`);
  if (!rebindButton) throw new Error('bound state does not offer the explicit identity rotation control');
  const boundBox = await evalJS(cdp, `(()=>{const e=document.querySelector('#projects .lesson-binding'),r=e.closest('.proj-row');return {text:e.innerText,box:e.getBoundingClientRect().toJSON(),row:r.getBoundingClientRect().toJSON(),scroll:e.scrollWidth,client:e.clientWidth}})()`);
  if (boundBox.box.right > boundBox.row.right + 1 || boundBox.scroll > boundBox.client + 2) throw new Error('bound controls overflow the project row: ' + JSON.stringify(boundBox));
  const boundShot = await cdp.send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
  screenshotPath = path.join(os.tmpdir(), 'starnet-project-binding-ui-' + process.pid + '.png');
  fs.writeFileSync(screenshotPath, Buffer.from(boundShot.data, 'base64'));
  await evalJS(cdp, `window.confirm=()=>true;document.querySelector('#projects .lesson-bind[data-action="rebind"]').click()`);
  await eventually(async () => {
    const latest = await (await fetch(base + '/api/projects', { headers:{ 'X-StarNet-Token':apiToken, Origin:base } })).json();
    return latest.projects.find(p => p.root === blessed.root)?.lessonProjectId !== firstId;
  }, 'rebound identity');
  await eventually(() => evalJS(cdp, `!!document.querySelector('#projects .lesson-bind[data-action="clear"]')`).catch(() => false), 'rebound controls render');
  await evalJS(cdp, `document.querySelector('#projects .lesson-bind[data-action="clear"]').click()`);
  await eventually(() => evalJS(cdp, `document.querySelector('#projects .lesson-bind[data-action="bind"]')?.innerText === 'Bind for lesson proposals'`).catch(() => false), 'cleared state render');
  saved = await (await fetch(base + '/api/projects', { headers:{ 'X-StarNet-Token':apiToken, Origin:base } })).json();
  row = saved.projects.find(p => p.root === blessed.root);
  if (row?.lessonProjectId !== null) throw new Error('UI clear did not persist null binding');
  const evidence = { ok:true, project:blessed.root, authHeaderObserved:true, unboundText:initial.text, boundText:boundBox.text, controlsFit:true, rebindRotated:true, clearReturnedNull:true, chromium:process.env.SKYNET_CHROME };
  console.log(JSON.stringify(evidence));
  console.log('screenshot=' + screenshotPath);
} catch (error) {
  if (chrome && chromeError) console.error('Chromium diagnostics:', chromeError.slice(-2000));
  throw error;
} finally {
  try { cdp?.ws?.close(); } catch {}
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill();
    await Promise.race([exited, sleep(5000).then(() => { throw new Error('Chromium did not stop for fixture cleanup'); })]);
  }
  if (sidecar && sidecar.exitCode === null && sidecar.signalCode === null) {
    const exited = new Promise(resolve => sidecar.once('exit', resolve)); sidecar.kill();
    await Promise.race([exited, sleep(5000).then(() => { throw new Error('seeded sidecar did not stop for fixture cleanup'); })]);
  }
  fs.rmSync(tempPath(scratch), { recursive:true, force:true });
}
