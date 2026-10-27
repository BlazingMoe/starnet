/* Production pending-card renderer fixture for structured lesson review. Synthetic data only; no station/account. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { connectCDP, evalJS, findChrome, sleep } from '../scripts/lib/cdp.mjs';

process.env.SKYNET_CHROME ||= 'F:/chrome-win/chrome.exe';
const source = fs.readFileSync(new URL('../frontend/app/stationui.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('  function pendingCard(p, a) {');
const end = source.indexOf('\n  /* WHERE a belief came from.', start);
if (start < 0 || end < 0) throw new Error('production pending-card renderer boundaries were not found');
const renderer = source.slice(start, end).trim();
const candidate = {
  id:'lesson-browser-fixture', runId:'decisionlesson-fixture', kind:'lesson', proposalType:'decision-lesson',
  content:'Candidate text <img src=x onerror=alert(1)>', origin:'decision-outcome', createdAt:Date.now(),
  sourceDecisionId:'decision-fixture', sourceOutcomeEventId:'outcome-fixture', sourceDecision:'synthetic decision',
  sourceOutcome:'synthetic observed outcome', evidenceRefs:['artifact:fixture'], uncertainty:'one synthetic run',
  lessonContract:{schemaVersion:1,scope:{type:'customer',id:'customer-<img src=x>'},sourceRefs:['artifact:<img src=x>'],uncertainty:'one synthetic run',confidence:null,version:'candidate-v1',recheckAt:'2026-11-01',expiresAt:'2026-12-01',positiveExamples:['<b>matching brief</b>'],negativeExamples:['other customer'],trust:'unverified',authority:'reference-only'}
};
const encoded = JSON.stringify(candidate).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const page = `<!doctype html><meta charset="utf-8"><title>Structured lesson review fixture</title>
<style>body{background:#111820;color:#eaf0f4;font:15px Segoe UI,Arial;margin:0;padding:36px}.mc-rec{max-width:900px;background:#202b35;border:1px solid #536273;border-radius:8px;padding:20px}.mc-head,.mc-acts{display:flex;gap:10px;align-items:center}.mc-meta{white-space:pre-wrap;color:#c5d2dc;line-height:1.55;margin:14px 0}.mc-body{line-height:1.5;margin:10px 0}.turnin-kind{color:#f2ca71;font-weight:bold}button{background:#26394a;color:#e8eef5;border:1px solid #687c8e;border-radius:5px;padding:9px 18px}button:disabled{opacity:.45}</style>
<h1>Memory Core · Pending review</h1><main id="fixture"></main><script>
const mkEl=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e};
const MEM_KIND={lesson:'LESSON'}; const originChip=()=>null; const sfx=()=>{}; const loadMemoryCore=()=>{}; const Harness={memoryTurnin:async()=>({ok:true})};
${renderer}
const p=${encoded};document.querySelector('#fixture').appendChild(pendingCard(p,{id:'synthetic-agent'}));
</script>`;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-lesson-contract-browser-'));
const profile = path.join(scratch, 'profile'); fs.mkdirSync(profile);
const screenshot = path.join(os.tmpdir(), 'starnet-lesson-contract-review-' + process.pid + '.png');
const cdpPort = await new Promise((resolve, reject) => {
  const server = net.createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
});
const chrome = spawn(findChrome(), [
  '--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check',
  '--hide-scrollbars','--mute-audio','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${cdpPort}`,
  '--window-size=1200,900',`--user-data-dir=${profile}`,'about:blank'
], {stdio:['ignore','ignore','pipe']});
let cdp;
try {
  cdp = await connectCDP(cdpPort);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate',{url:'data:text/html;charset=utf-8,'+encodeURIComponent(page)});
  await sleep(700);
  const evidence = await evalJS(cdp, `(()=>{const card=document.querySelector('.mc-rec'),buttons=[...card.querySelectorAll('button')];return {text:card.innerText,html:card.innerHTML,images:card.querySelectorAll('img,svg,b').length,keepDisabled:buttons[0]?.disabled,keepTitle:buttons[0]?.title,discardEnabled:buttons[1]?.disabled===false,discardClickable:typeof buttons[1]?.onclick==='function'};})()`);
  if (!evidence.text.includes('CANDIDATE SCOPE (NOT ACTIVE MEMORY SCOPE): CUSTOMER')) throw new Error('candidate scope label missing: '+JSON.stringify(evidence));
  for (const text of ['candidate-v1','2026-11-01','2026-12-01','artifact:<img src=x>','one synthetic run','matching brief','other customer']) if (!evidence.text.includes(text)) throw new Error('review metadata missing '+text);
  if (evidence.images !== 0 || !evidence.html.includes('&lt;img src=x&gt;')) throw new Error('synthetic markup was not safely rendered as text: '+JSON.stringify(evidence));
  if (!evidence.keepDisabled || !/scoped validation\/promotion/.test(evidence.keepTitle) || !evidence.discardEnabled || !evidence.discardClickable) throw new Error('review action state is incorrect: '+JSON.stringify(evidence));
  const shot = await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(screenshot,Buffer.from(shot.data,'base64'));
  console.log(JSON.stringify({ok:true,chrome:findChrome(),screenshot,evidence:{text:evidence.text,escaped:evidence.html.includes('&lt;img src=x&gt;'),images:evidence.images,keepDisabled:evidence.keepDisabled,keepTitle:evidence.keepTitle,discardEnabled:evidence.discardEnabled,discardClickable:evidence.discardClickable}}));
} finally {
  try { cdp?.ws?.close(); } catch {}
  if (chrome.exitCode===null && chrome.signalCode===null) {
    const exited=new Promise(resolve=>chrome.once('exit',resolve)); chrome.kill();
    await Promise.race([exited,sleep(5000).then(()=>{throw new Error('Chromium did not exit before fixture cleanup');})]);
  }
  const tempRoot=path.resolve(os.tmpdir())+path.sep, resolved=path.resolve(scratch);
  if (!resolved.startsWith(tempRoot)) throw new Error('Refusing to clean fixture outside the OS temp directory');
  fs.rmSync(resolved,{recursive:true,force:true});
}
