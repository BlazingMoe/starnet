/* One-off local acceptance proof: pure generator -> normal fs.write receipt/readback -> isolated Chromium. */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { capture, connectCDP, evalJS, sleep } from '../scripts/lib/cdp.mjs';
const require = createRequire(import.meta.url);
const Demo = require('../sidecar/tools/builtin/website-demo.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const A = require('./_assert.js');

const out = path.resolve(process.argv.find(a => a.startsWith('--output='))?.slice('--output='.length) || path.join(tmpdir(), 'starnet-fictional-salon-demo'));
const agentId = path.basename(out);
const workspaceRoot = path.dirname(out);
const profileDir = mkdtempSync(path.join(tmpdir(), 'starnet-demo-chrome-'));
let chromeProc, cdp;
try {
  const generated = Demo.generate({ industry: 'salon' });
  const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
  const tools = makeFsTools({ fsp, pathMod: path, root: workspaceRoot, limits: { writeBytes: 1 << 20 } });
  await fsp.mkdir(out, { recursive: true });
  const receipts = [];
  for (const [name, content] of Object.entries(generated.files)) {
    const result = await tools.writeTool.run({ path: name, content }, { agentId });
    A.eq(result.receipt.state, 'read-back-verified', `${name} has normal verified fs.write receipt`);
    receipts.push(result.receipt);
    const read = await tools.readTool.run({ path: name }, { agentId });
    A.ok(read.content.includes(content), `${name} readback matches generator bytes`);
  }
  A.eq(receipts.length, 2, 'both files were exported independently');

  let portServer;
  const net = await import('node:net');
  portServer = net.createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  const chrome = process.env.SKYNET_CHROME;
  if (!chrome || !existsSync(chrome)) throw new Error('Set SKYNET_CHROME to the isolated Chromium executable');
  chromeProc = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', `--remote-debugging-port=${port}`, '--window-size=1365,1000', `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore' });
  cdp = await connectCDP(port);
  const external = [];
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', e => { if (/^https?:/i.test(e.request.url)) external.push(e.request.url); });
  await cdp.send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: pathToFileURL(path.join(out, 'index.html')).href });
  await sleep(1200);
  A.eq(await evalJS(cdp, 'document.documentElement.lang'), 'de', 'page is presented in German');
  A.ok((await evalJS(cdp, 'document.querySelector(".demo-bar").textContent')).includes('Fiktives Konzept'), 'fictional/demo notice is visible');
  const resources = await evalJS(cdp, 'performance.getEntriesByType("resource").map(x=>x.name)');
  A.eq(resources.filter(x => /^https?:/i.test(x)), [], 'render made no external resource requests');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  const focused = await evalJS(cdp, 'document.activeElement.tagName + "#" + document.activeElement.id');
  A.ok(focused.startsWith('A#'), 'keyboard Tab reaches a navigation link');
  await capture(cdp, out, 'desktop');
  const formResult = await evalJS(cdp, `(()=>{const input=document.getElementById('visitor-name');input.value='Musterperson';document.getElementById('sample-form').requestSubmit();return document.getElementById('form-status').textContent})()`);
  A.ok(formResult.includes('nichts gesendet oder gespeichert'), 'sample form displays only the local no-send confirmation');
  A.eq(external, [], 'network request observer saw no external requests');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const mobile = await evalJS(cdp, '({width:innerWidth,scroll:document.documentElement.scrollWidth,nav:document.querySelectorAll("nav a").length > 0})');
  A.eq(mobile.width, 390, 'mobile viewport is applied');
  A.ok(mobile.scroll <= mobile.width, 'mobile page has no horizontal overflow');
  A.ok(mobile.nav, 'mobile navigation retains its sample action');
  await capture(cdp, out, 'mobile');
  console.log(`Browser proof artifacts: ${out}; receipts: ${receipts.map(r => r.sha256).join(', ')}`);
  A.report('website-demo.browser');
} finally {
  if (cdp) { try { cdp.ws.close(); } catch {} }
  if (chromeProc && !chromeProc.killed) { chromeProc.kill(); }
  await new Promise(resolve => setTimeout(resolve, 250));
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
