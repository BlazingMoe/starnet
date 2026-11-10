/* One-off local acceptance proof: pure generator -> normal fs.write receipt/readback -> isolated Chromium. */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { capture, connectCDP, evalJS, sleep } from '../scripts/lib/cdp.mjs';
const require = createRequire(import.meta.url);
const Demo = require('../sidecar/tools/builtin/crm-demo.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const A = require('./_assert.js');

const out = path.resolve(process.argv.find(a => a.startsWith('--output='))?.slice('--output='.length) || path.join(tmpdir(), 'starnet-synthetic-crm-demo'));
const agentId = path.basename(out);
const workspaceRoot = path.dirname(out);
const profileDir = mkdtempSync(path.join(tmpdir(), 'starnet-demo-chrome-'));
let chromeProc, cdp;
try {
  const generated = Demo.generate({ industry: 'workshop' });
  const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
  const tools = makeFsTools({ fsp, pathMod: path, root: workspaceRoot, limits: { writeBytes: 1 << 20 } });
  await fsp.mkdir(out, { recursive: true });
  const receipts = [];
  for (const [name, content] of Object.entries(generated.files)) {
    const result = await tools.writeTool.run({ path: name, content }, { agentId });
    A.eq(result.receipt.state, 'read-back-verified', `${name} has normal verified fs.write receipt`);
    receipts.push(result.receipt);
    const read = await tools.readTool.run({ path: name }, { agentId });
    A.ok(read.content === content, `${name} readback matches generator bytes`);
  }
  A.eq(receipts.length, 3, 'all three files were exported independently');

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
  A.ok((await evalJS(cdp, 'document.querySelector(".notice").textContent')).includes('synthetische Daten'), 'fictional/demo notice is visible');
  const resources = await evalJS(cdp, 'performance.getEntriesByType("resource").map(x=>x.name)');
  A.eq(resources.filter(x => /^https?:/i.test(x)), [], 'render made no external resource requests');
  await capture(cdp, out, 'desktop');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  const focused = await evalJS(cdp, 'document.activeElement.tagName + "#" + document.activeElement.id');
  A.ok(focused.startsWith('A#'), 'keyboard Tab reaches a navigation link');
  const data = JSON.parse(generated.files['synthetic-data.json']);
  const snapshot = await evalJS(cdp, `({count:Number(document.getElementById('kpi-count').textContent),value:document.getElementById('kpi-value').textContent,open:Number(document.getElementById('kpi-open').textContent),won:document.getElementById('kpi-won').textContent,rows:document.querySelectorAll('#leads li').length,stages:[...document.querySelectorAll('.stage strong')].map(x=>Number(x.textContent)),overflow:document.documentElement.scrollWidth>innerWidth,csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]').content})`);
  A.eq(snapshot.count,data.leads.length,'KPI count derived from dataset');
  A.eq(snapshot.rows,data.leads.length,'initial list matches dataset');
  A.eq(snapshot.value,data.leads.filter(x=>x.stage!=='Gewonnen').reduce((s,x)=>s+x.value,0).toLocaleString('de-DE'),'open pipeline value derived from dataset');
  A.eq(snapshot.won,data.leads.filter(x=>x.stage==='Gewonnen').reduce((s,x)=>s+x.value,0).toLocaleString('de-DE'),'won value derived from dataset');
  A.eq(snapshot.open,data.leads.filter(x=>x.followUp==='Offen').length,'open follow-ups derived from dataset');
  A.eq(snapshot.stages,['Neu','Qualifiziert','Angebot','Gewonnen'].map(stage=>data.leads.filter(x=>x.stage===stage).length),'pipeline stage totals derived');
  A.ok(!snapshot.overflow,'desktop has no horizontal overflow');
  A.ok(snapshot.csp.includes("connect-src 'none'")&&snapshot.csp.includes("form-action 'none'"),'CSP blocks connections and forms');
  A.eq(await evalJS(cdp,'({local:localStorage.length,session:sessionStorage.length})'),{local:0,session:0},'no browser storage');
  // Tab from the skip link must reach each native control and every lead detail button.
  const focusIds=[];
  for(let i=0;i<9;i++){
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    focusIds.push(await evalJS(cdp,"document.activeElement.id || document.activeElement.getAttribute('aria-label')"));
  }
  A.ok(focusIds.includes('search')&&focusIds.includes('filter')&&focusIds.includes('follow'),'search, filter and follow-up keyboard reachable');
  A.eq(focusIds.filter(x=>x&&x.includes('Details anzeigen')).length,data.leads.length,'all lead detail buttons keyboard reachable');
  const search=await evalJS(cdp,`(()=>{const s=document.getElementById('search');s.value='SYN-04';s.dispatchEvent(new Event('input'));return [...document.querySelectorAll('#leads li')].map(x=>x.textContent)})()`);
  A.eq(search.length,1,'search narrows to one lead');
  A.ok(search[0].includes('Musterhalle'),'search finds correct lead');
  const filtered=await evalJS(cdp,`(()=>{const s=document.getElementById('search');s.value='';s.dispatchEvent(new Event('input'));const f=document.getElementById('filter');f.value='Angebot';f.dispatchEvent(new Event('change'));return document.querySelectorAll('#leads li').length})()`);
  A.eq(filtered,data.leads.filter(x=>x.stage==='Angebot').length,'phase filter matches dataset');
  const empty=await evalJS(cdp,`(()=>{const s=document.getElementById('search');s.value='<img src=x onerror=alert(1)>';s.dispatchEvent(new Event('input'));return {count:document.querySelectorAll('#leads li').length,images:document.images.length}})()`);
  A.eq(empty,{count:0,images:0},'hostile search stays inert and shows empty result');
  const detail=await evalJS(cdp,`(()=>{const s=document.getElementById('search');s.value='SYN-04';s.dispatchEvent(new Event('input'));document.querySelector('#leads button').click();return {title:document.getElementById('detail-title').textContent,focus:document.activeElement.id,follow:document.getElementById('detail-follow').textContent}})()`);
  A.eq(detail,{title:data.leads[3].project,focus:'detail-title',follow:'Offen'},'detail selection updates content and focus');
  await evalJS(cdp,"document.getElementById('follow').focus()");
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await cdp.send('Input.dispatchKeyEvent',{type:'char',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  const changed=await evalJS(cdp,`({follow:document.getElementById('detail-follow').textContent,open:Number(document.getElementById('kpi-open').textContent),disabled:document.getElementById('follow').disabled,status:document.getElementById('status').textContent,local:localStorage.length,session:sessionStorage.length})`);
  A.eq(changed.follow,'Erledigt','keyboard activation changes simulated follow-up');
  A.eq(changed.open,snapshot.open-1,'follow-up count updates coherently');
  A.ok(changed.disabled&&changed.status.includes('Nichts gesendet oder gespeichert'),'honest simulation confirmation prevents repeated completion');
  A.eq([changed.local,changed.session],[0,0],'interaction writes no browser storage');
  await capture(cdp,out,'follow-up');
  await cdp.send('Page.reload');await sleep(500);
  A.eq(await evalJS(cdp,"Number(document.getElementById('kpi-open').textContent)"),snapshot.open,'reload resets in-memory follow-up count');
  A.eq(await evalJS(cdp,"JSON.parse(document.getElementById('synthetic-data').textContent).leads[3].followUp"),'Offen','embedded source remains unchanged');
  A.eq(readFileSync(path.join(out,'synthetic-data.json'),'utf8'),generated.files['synthetic-data.json'],'interaction never mutates exported data');
  A.eq(external, [], 'network request observer saw no external requests');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const mobile = await evalJS(cdp, '({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:document.querySelectorAll("#search,#filter,#follow").length === 3})');
  A.eq(mobile.width, 390, 'mobile viewport is applied');
  A.ok(mobile.scroll <= mobile.width, 'mobile page has no horizontal overflow');
  A.ok(mobile.controls, 'mobile retains all controls');
  A.eq(external, [], 'no HTTP requests after interaction and reload');
  await capture(cdp, out, 'mobile');
  await evalJS(cdp,"document.querySelector('#leads button').click()");
  A.eq(await evalJS(cdp,"document.activeElement.id"),'detail-title','mobile detail receives accessible focus');
  await evalJS(cdp,"document.getElementById('follow').click()");
  A.eq(await evalJS(cdp,"document.getElementById('detail-follow').textContent"),'Erledigt','mobile follow-up simulation works');
  await capture(cdp,out,'mobile-detail');
  A.eq(external, [], 'mobile interactions make no external requests');
  await fsp.writeFile(path.join(out,'export-receipts.json'),JSON.stringify(receipts,null,2)+'\n');
  console.log(`Browser proof artifacts: ${out}; receipts: ${receipts.map(r => r.sha256).join(', ')}`);
  A.report('crm-demo.browser');
} finally {
  if (cdp) { try { cdp.ws.close(); } catch {} }
  if (chromeProc && !chromeProc.killed) { chromeProc.kill(); }
  await new Promise(resolve => setTimeout(resolve, 250));
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
