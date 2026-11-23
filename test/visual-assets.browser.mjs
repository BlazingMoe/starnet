// Development proof: consent-gated export -> independent readback -> Chromium pixels. No external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {connectCDP,evalJS,capture,sleep} from '../scripts/lib/cdp.mjs';
import {decodePNG} from '../scripts/lib/png.mjs';
const require=createRequire(import.meta.url);
const Demo=require('../sidecar/tools/builtin/visual-assets.js');
const {input}=require('./helpers/visual-demo-fixture.js');
const {makeRegistry}=require('../sidecar/tools/registry.js');
const {resolveTools}=require('../sidecar/capability/resolve.js');
const {makeCapCtx}=require('../sidecar/capability/capGate.js');
const output=path.resolve(process.argv.find(x=>x.startsWith('--output='))?.slice(9)||path.join(os.tmpdir(),'starnet-visual-proof-'+Date.now()));
const chrome=process.env.SKYNET_CHROME;
if(!chrome||!fs.existsSync(chrome))throw Error('Set SKYNET_CHROME to the isolated development Chromium');
const profile=await fsp.mkdtemp(path.join(os.tmpdir(),'starnet-visual-chrome-'));
let proc,cdp;
try {
  const registry=makeRegistry(), now='2026-11-12T12:00:00.000Z';
  Demo.makeVisualAssetTools({fsp,pathMod:path,root:output,clock:()=>Date.parse(now)}).register(registry);
  const resolved=resolveTools('proof',{agents:{proof:{id:'proof',room:'office'}},rooms:{office:{id:'office',objects:[{instanceId:'studio',objectType:'studio'}]}}});
  const ctx={...makeCapCtx(resolved,{consent:async()=>({allow:true})}),agentId:'proof'};
  const evidence={syntheticFixture:true,generatorSourceSha256:Demo.hash(fs.readFileSync(require.resolve('../sidecar/tools/builtin/visual-assets.js'))),externalRequests:[],lanes:[]};
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  proc=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--hide-scrollbars','--mute-audio',`--remote-debugging-port=${port}`,'--window-size=1440,1100',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
  cdp=await connectCDP(port);await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['http://*','https://*']});
  cdp.on('Network.requestWillBeSent',e=>{if(/^https?:/.test(e.request.url))evidence.externalRequests.push(e.request.url);});await cdp.send('Page.enable');
  for(const lane of Demo.LANES) {
    const args=input(lane,now),result=await registry.dispatch({id:'export-'+lane,name:'visual.demo.export',args},ctx);assert(result.ok,result.content);
    const validated=await registry.dispatch({id:'validate-'+lane,name:'visual.demo.validate',args},ctx);assert(validated.ok,validated.content);
    const directory=path.join(output,'proof',args.destination),pack=Demo.build(args);
    await cdp.send('Page.navigate',{url:pathToFileURL(path.join(directory,'review.html')).href});await sleep(200);
    const screen=await evalJS(cdp,`(async()=>{const img=document.querySelector('img');let raster=null;if(img){await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const c=canvas.getContext('2d');c.drawImage(img,0,0);const p=c.getImageData(0,0,canvas.width,canvas.height).data;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',p)),x=>x.toString(16).padStart(2,'0')).join('');let clear=0,visible=0;for(let i=3;i<p.length;i+=4){if(p[i]===0)clear++;if(p[i]===255)visible++;}raster={width:canvas.width,height:canvas.height,sha256:hash,clear,visible,corner:[...p.slice(0,4)],centre:[...p.slice(((canvas.height>>1)*canvas.width+(canvas.width>>1))*4,((canvas.height>>1)*canvas.width+(canvas.width>>1))*4+4)]};}return{raster,overflow:document.documentElement.scrollWidth>innerWidth,text:document.body.textContent,csp:document.querySelector('meta[http-equiv]').content,svg:!!document.querySelector('svg'),storage:[localStorage.length,sessionStorage.length]};})()`);
    assert.equal(screen.overflow,false);assert.deepEqual(screen.storage,[0,0]);assert(screen.text.includes('PENDING'));assert(screen.text.includes('NOT TESTED'));assert(screen.csp.includes("connect-src 'none'"));
    if(lane==='youtube-thumbnail'||lane==='game-assets-2d') {
      const name=lane==='youtube-thumbnail'?'thumbnail.png':'crystal.png',decoded=decodePNG(fs.readFileSync(path.join(directory,name)));
      assert.equal(screen.raster.width,decoded.width);assert.equal(screen.raster.height,decoded.height);assert.equal(screen.raster.sha256,Demo.hash(decoded.pixels));
      assert.equal(screen.raster.clear,pack.checks.transparentPixels);assert.equal(screen.raster.visible,pack.checks.visiblePixels);
    }
    if(lane==='logo'){assert.deepEqual([screen.raster.width,screen.raster.height],[256,256]);assert.deepEqual(screen.raster.corner,[0,0,0,0]);assert.deepEqual(screen.raster.centre,[20,43,61,255]);assert(screen.raster.visible>10000);}
    if(lane==='game-assets-3d'){assert(screen.svg);assert.equal(screen.raster,null);assert(screen.text.includes('actual OBJ must be imported'));}
    const screenshot=await capture(cdp,output,lane);
    evidence.lanes.push({lane,receipts:result.receipt.files,checks:JSON.parse(validated.content).checks,pixels:screen.raster,screenshot});
  }
  assert.deepEqual(evidence.externalRequests,[]);
  await fsp.writeFile(path.join(output,'proof.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log('visual-assets.browser: PASS; four lanes, exact Chromium raster pixels, vector render, OBJ structure, 16 byte receipts, zero external page requests. '+output);
} finally {
  if(cdp)cdp.ws.close();if(proc&&!proc.killed)proc.kill();await sleep(250);
  // Only the exact generated temporary profile is removed; exported evidence is retained.
  if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('starnet-visual-chrome-'))await fsp.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
