'use strict';
// Fixed fictional local proof. No provider, customer inputs, arbitrary bytes or external assets.
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Studio = require('./service-studio.js');
const { makeFsTools } = require('./fs.js');
const LANES = ['youtube-thumbnail', 'logo', 'game-assets-2d', 'game-assets-3d'];
const VERSION = 'lumen-cairn-v1';
const MAX_FILE = 64000, MAX_PACK = 180000;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const pending = () => ({ technical: 'VALIDATED_FIXED_DEMO_ONLY', visualHumanReview: 'PENDING', originalityRightsLicenceReview: 'PENDING', platformEngineAcceptance: 'NOT_TESTED', customerAcceptance: 'NOT_ASSESSED' });
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw Error('Invalid fixed demo input');
}
function stamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw Error('Canonical UTC required');
  return Date.parse(value);
}
function authorize(args) {
  exactKeys(args, ['destination', 'preparation', 'operatorRequest']);
  if (typeof args.destination !== 'string' || !/^visual-demos\/[a-f0-9]{64}$/.test(args.destination)) throw Error('Canonical visual-demos/<preparationSha256> destination required');
  const p = args.preparation, request = args.operatorRequest;
  const ready = Studio.prepare(p); // Revalidate full evidence; never trust a caller-supplied READY label.
  exactKeys(request, ['action', 'lane', 'preparationSha256', 'requestedAt']);
  if (!LANES.includes(p.lane) || request.lane !== p.lane || request.action !== 'produce-fixed-fictional-demo-after-private-review' || ready.state !== 'READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW' || ready.gaps.length || request.preparationSha256 !== hash(json(ready))) throw Error('Matching reviewed READY preparation and separate explicit operator request required');
  if(args.destination!=='visual-demos/'+request.preparationSha256) throw Error('Destination must bind exact preparation; duplicates require reconciliation, not a renamed folder');
  const at = stamp(request.requestedAt), preparedAt = stamp(p.asOf);
  if (at <= preparedAt || at - preparedAt > p.freshnessDays * 86400000) throw Error('Operator request must follow fresh preparation');
  // Evidence freshness is measured at the request too, not only the old preparation date.
  if (Studio.prepare({ ...p, asOf: request.requestedAt }).state !== 'READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW') throw Error('Preparation evidence stale at production request');
  return { lane: p.lane, preparationSha256: request.preparationSha256, requestedAt: request.requestedAt };
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), out.length - 4); return out;
}
function png(width, height, pixels) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Original hand-built 5x7 lettering; no font files or font licence dependency.
const glyphs = { A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','10001','11110','10001','10001','11110'], C:['01111','10000','10000','10000','10000','10000','01111'], D:['11110','10001','10001','10001','10001','10001','11110'], E:['11111','10000','10000','11110','10000','10000','11111'], I:['11111','00100','00100','00100','00100','00100','11111'], L:['10000','10000','10000','10000','10000','10000','11111'], M:['10001','11011','10101','10101','10001','10001','10001'], N:['10001','11001','11001','10101','10011','10011','10001'], O:['01110','10001','10001','10001','10001','10001','01110'], R:['11110','10001','10001','11110','10100','10010','10001'], U:['10001','10001','10001','10001','10001','10001','01110'], W:['10001','10001','10001','10101','10101','11011','10001'] };
function raster(width, height, background) {
  const pixels = Buffer.alloc(width * height * 4);
  const rect = (x, y, w, h, color) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { if (i < 0 || j < 0 || i >= width || j >= height) throw Error('Drawing out of bounds'); pixels.set(color, (j * width + i) * 4); } };
  rect(0, 0, width, height, background);
  const triangle = (a, b, c, color) => {
    const edge = (p, q, x, y) => (x - p[0]) * (q[1] - p[1]) - (y - p[1]) * (q[0] - p[0]);
    for (let y = Math.min(a[1],b[1],c[1]); y <= Math.max(a[1],b[1],c[1]); y++) for (let x = Math.min(a[0],b[0],c[0]); x <= Math.max(a[0],b[0],c[0]); x++) { const e = [edge(a,b,x,y),edge(b,c,x,y),edge(c,a,x,y)]; if (e.every(v=>v>=0)||e.every(v=>v<=0)) rect(x,y,1,1,color); }
  };
  const text = (value, x, y, scale, color) => { for (const ch of value) { if (ch !== ' ') glyphs[ch].forEach((row, j) => [...row].forEach((v, i) => { if (v === '1') rect(x+i*scale,y+j*scale,scale,scale,color); })); x += scale*6; } };
  return { pixels, rect, triangle, text };
}
function thumbnail() {
  const r = raster(1280,720,[15,29,43,255]);
  r.rect(64,64,86,8,[100,237,211,255]);
  r.text('LUMEN',64,132,15,[245,242,220,255]); r.text('CAIRN',64,262,15,[245,242,220,255]);
  r.text('BUILD A',64,474,7,[100,237,211,255]); r.text('WORLD',64,546,7,[100,237,211,255]);
  r.triangle([914,100],[748,400],[914,526],[100,237,211,255]); r.triangle([914,100],[1080,400],[914,526],[41,157,166,255]);
  r.triangle([748,400],[914,526],[914,610],[44,91,114,255]); r.triangle([1080,400],[914,526],[914,610],[30,60,85,255]);
  r.rect(780,644,268,12,[245,183,95,255]);
  return png(1280,720,r.pixels);
}
function sprite() {
  const r = raster(128,128,[0,0,0,0]);
  r.triangle([64,12],[24,64],[64,116],[100,237,211,255]); r.triangle([64,12],[104,64],[64,116],[41,157,166,255]);
  r.triangle([64,12],[44,64],[64,88],[225,255,244,255]);
  return png(128,128,r.pixels);
}
const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Lumen Cairn fictional crystal mark"><path fill="#142b3d" d="M128 24 208 124 128 232 48 124Z"/><path fill="#64edd3" d="M128 48 184 124 128 200 72 124Z"/><path fill="#142b3d" d="M128 80 152 124 128 168 104 124Z"/></svg>\n';
const mesh = '# Lumen Cairn fictional crystal; metres; Y up; origin at centre; static untextured mesh\no lumen_cairn_crystal\nv 0 1 0\nv 0 -1 0\nv -0.5 0 0\nv 0 0 0.5\nv 0.5 0 0\nv 0 0 -0.5\nf 1 3 4\nf 1 4 5\nf 1 5 6\nf 1 6 3\nf 2 4 3\nf 2 5 4\nf 2 6 5\nf 2 3 6\n';
function inspectPNG(bytes, width, height, transparent) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_FILE || !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw Error('Invalid PNG');
  let offset = 8; const chunks = [];
  for (const expected of ['IHDR','IDAT','IEND']) {
    if (offset + 12 > bytes.length) throw Error('Truncated PNG');
    const len = bytes.readUInt32BE(offset), end = offset + 12 + len;
    if (end > bytes.length || bytes.toString('ascii',offset+4,offset+8) !== expected || crc32(bytes.subarray(offset+4,end-4)) !== bytes.readUInt32BE(end-4)) throw Error('PNG structure/CRC mismatch');
    chunks.push(bytes.subarray(offset+8,end-4)); offset = end;
  }
  const h = chunks[0];
  if (offset !== bytes.length || h.length !== 13 || h.readUInt32BE() !== width || h.readUInt32BE(4) !== height || !h.subarray(8).equals(Buffer.from([8,6,0,0,0])) || chunks[2].length) throw Error('PNG dimensions/format mismatch');
  const stride = width*4+1, raw = zlib.inflateSync(chunks[1], { maxOutputLength: stride*height });
  if (raw.length !== stride*height) throw Error('PNG decoded size mismatch');
  let visible = 0, clear = 0;
  for (let y = 0; y < height; y++) {
    if (raw[y*stride] !== 0) throw Error('Unexpected PNG filter');
    for (let x = 0; x < width; x++) {
      const start=y*stride+1+x*4, alpha=raw[start+3];
      if (alpha===255) visible++; else if (alpha===0) clear++; else throw Error('Unexpected alpha');
      if (transparent && (x<12 || x>=width-12 || y<12 || y>=height-11) && alpha) throw Error('Sprite padding mismatch');
      if (!transparent && (x<64 || x>=width-64 || y<64 || y>=height-64) && (raw[start]!==15 || raw[start+1]!==29 || raw[start+2]!==43)) throw Error('Thumbnail safe-area mismatch');
    }
  }
  if (!visible || (transparent ? !clear : clear !== 0)) throw Error('Alpha contract mismatch');
  return { format:'PNG', width, height, channels:'RGBA8', transparentPixels:clear, visiblePixels:visible, padding:transparent?'12px left/right/top; 11px bottom':'opaque', textSafeArea:transparent?null:[64,64,1216,656] };
}
function inspectOBJ(bytes) {
  const lines=bytes.toString('utf8').trim().split('\n'), vertices=[], faces=[];
  for(const line of lines) {
    if(line.startsWith('# ') || line==='o lumen_cairn_crystal') continue;
    const words=line.split(' '), op=words.shift();
    if(op==='v' && words.length===3 && words.every(v=>Number.isFinite(Number(v)))) vertices.push(words.map(Number));
    else if(op==='f' && words.length===3 && words.every(v=>/^[1-6]$/.test(v))) faces.push(words.map(v=>Number(v)-1));
    else throw Error('Invalid OBJ structure');
  }
  if(vertices.length!==6 || faces.length!==8) throw Error('OBJ inventory mismatch');
  const edges=new Map();
  for(const f of faces) { if(new Set(f).size!==3) throw Error('Degenerate face'); const [a,b,c]=f.map(i=>vertices[i]); const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]); const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]; if(n.reduce((s,x,i)=>s+x*(a[i]+b[i]+c[i]),0)<=0) throw Error('Degenerate/inward face'); for(let i=0;i<3;i++){const a=f[i],b=f[(i+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':'); const prev=edges.get(key)||[0,0]; edges.set(key,[prev[0]+1,prev[1]+(a<b?1:-1)]);} }
  if([...edges.values()].some(([count,direction])=>count!==2||direction!==0)) throw Error('Non-manifold OBJ');
  const min=[0,1,2].map(i=>Math.min(...vertices.map(v=>v[i]))),max=[0,1,2].map(i=>Math.max(...vertices.map(v=>v[i])));
  if(json([min,max])!==json([[-0.5,-1,-0.5],[0.5,1,0.5]])) throw Error('OBJ bounds mismatch');
  return { format:'OBJ', vertices:6, triangles:8, watertight:true, outwardWinding:true, min,max, units:'metres', up:'Y', pivot:'centre', uv:false, rig:false, animation:false, textures:false, collision:false, lod:false };
}
function build(args) {
  const binding = authorize(args), files = {};
  const lane = binding.lane;
  if(lane==='youtube-thumbnail') files['thumbnail.png']=thumbnail();
  if(lane==='logo') files['logo.svg']=Buffer.from(logo);
  if(lane==='game-assets-2d') files['crystal.png']=sprite();
  if(lane==='game-assets-3d') files['crystal.obj']=Buffer.from(mesh);
  const asset=Object.keys(files)[0], bytes=files[asset];
  const checks = lane==='youtube-thumbnail'?inspectPNG(bytes,1280,720,false):lane==='game-assets-2d'?inspectPNG(bytes,128,128,true):lane==='game-assets-3d'?inspectOBJ(bytes):{format:'SVG',width:256,height:256,viewBox:[0,0,256,256],externalReferences:false,fonts:false,clearSpace:24};
  const preview=lane==='game-assets-3d'?'<svg viewBox="0 0 256 256" role="img" aria-label="Illustrative crystal projection, inspect OBJ in your engine"><path fill="#64edd3" d="M128 24 48 112 128 224Z"/><path fill="#299da6" d="M128 24 208 144 128 224Z"/></svg>':`<img alt="Fixed fictional ${lane} demo" src="data:${lane==='logo'?'image/svg+xml':'image/png'};base64,${bytes.toString('base64')}">`;
  files['review.html']=Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Lumen Cairn — private fictional demo</title><style>body{margin:40px auto;max-width:1280px;padding:0 24px;background:#0f1d2b;color:#f5f2dc;font:18px/1.6 system-ui}h1{font-size:36px}figure{margin:24px 0;padding:24px;background:#263e50;border-radius:16px}img{max-width:100%;height:auto}svg{width:256px;height:256px}code{color:#64edd3}</style><h1>Lumen Cairn</h1><p>Fictional expedition / original procedural demonstration / ${lane}</p><figure>${preview}</figure><p><code>${asset}</code> — ${lane==='game-assets-3d'?'Illustrative projection only; actual OBJ must be imported and reviewed.':'Actual generated file bytes embedded for offline review.'}</p><p>Technical validation covers fixed bytes and format only. Visual human review: PENDING. Originality, rights and licence review: PENDING. Platform / engine acceptance: NOT TESTED. Customer acceptance: NOT ASSESSED.</p><p>No real brand, person, customer data, external source, provider or network. Stop for private human review. See manifest.json and README.md.</p></html>\n`);
  files['README.md']=Buffer.from('# Lumen Cairn — fixed fictional private demo\n\nSynthetic identity; original procedural geometric composition and hand-built bitmap glyphs. No external assets, fonts, training/reference images or customer/person data are inputs. No competitor copying requested. This describes construction, not a legal originality or trademark opinion.\n\n'+asset+' is the primary deliverable. '+json(checks)+'\nTechnical validation is byte/structure-only. Visual human review, originality/rights/licence review, platform/engine import and customer acceptance remain separate. No commercial licence or exclusivity is granted by this demo; private evaluation only until the operator separately reviews rights and selects a distribution licence.\n\nThumbnail: fixed 1280x720 opaque PNG under 2 MB, text inside 64px inset; actual platform upload not tested. Logo: vector mark, no font dependency; small-size/monochrome/trademark checks remain human work. 2D: single 128x128 RGBA sprite with transparent padding, no atlas or animation. 3D: static closed 8-triangle OBJ, metres, Y up, centre pivot; no UV/material/texture/rig/animation/LOD/collision. Engine import and production suitability must be tested separately.\n\nNo upload, listing, messages, accounts, payment, provider calls, research, deployment, Unreal invocation or background loop. Export refuses an existing destination. Interrupted export may leave a .pending sibling for manual inspection; never silently overwrite or retry it. Manifest hashes cover every other file; its exact hash is bound by the export receipt and validation result.\n');
  files['manifest.json']=Buffer.from(json({schemaVersion:1,generator:VERSION,identity:'Lumen Cairn',synthetic:true,binding,provenance:{method:'deterministic local geometry and original bitmap glyphs',externalInputs:[],provider:null,network:false,licence:'PRIVATE_EVALUATION_ONLY_PENDING_RIGHTS_REVIEW',commercialUseApproved:false,rightsReview:'PENDING'},reviews:pending(),checks,inventory:Object.entries(files).map(([name,data])=>({name,bytes:data.length,sha256:hash(data)}))}));
  if(Object.values(files).some(v=>v.length>MAX_FILE)||Object.values(files).reduce((n,v)=>n+v.length,0)>MAX_PACK) throw Error('Demo byte ceiling exceeded');
  return { files, binding, checks, reviews:pending() };
}
const requestSchema={type:'object',required:['action','lane','preparationSha256','requestedAt'],additionalProperties:false,properties:{action:{type:'string',enum:['produce-fixed-fictional-demo-after-private-review']},lane:{type:'string',enum:LANES},preparationSha256:{type:'string',pattern:'^[a-f0-9]{64}$',maxLength:64},requestedAt:{type:'string',maxLength:24}}};
const schema={type:'object',required:['destination','preparation','operatorRequest'],additionalProperties:false,properties:{destination:{type:'string',maxLength:77,pattern:'^visual-demos/[a-f0-9]{64}$'},preparation:Studio.schema,operatorRequest:requestSchema}};
function makeVisualAssetTools(deps) {
  const {fsp,pathMod:P,root}=deps;
  const clock=deps.clock;
  if(typeof clock!=='function') throw Error('Visual asset tools require an injected clock');
  const active=ctx=>{if(ctx?.signal?.aborted)throw Error('Visual export cancelled; inspect destination and .pending before any retry');};
  function current(args) { const now=clock(), requested=stamp(args.operatorRequest.requestedAt); if(!Number.isFinite(now)||requested>now||now-requested>86400000||Studio.prepare({...args.preparation,asOf:new Date(now).toISOString()}).state!=='READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW') throw Error('Stale or future production request/evidence'); }
  // Deliberately no project/environment/absolute-path trust: use the existing private workspace jail.
  const jail=makeFsTools({fsp,pathMod:P,root})._internals;
  const planTool={name:'visual.demo.plan',capability:'studio',scope:'read',requiresConsent:false,network:false,requiresCompleteOutput:true,timeoutMs:5000,schema:{type:'object',required:['preparation'],additionalProperties:false,properties:{preparation:Studio.schema}},description:'After service.studio.prepare, bind the exact matching READY preparation for a separate explicit operator request. Returns a digest and fixed demo scope only; does not produce or write assets. Stop for private human review before any export request.',run:async args=>{exactKeys(args,['preparation']);const ready=Studio.prepare(args.preparation);if(!LANES.includes(args.preparation.lane)||ready.state!=='READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW'||ready.gaps.length)throw Error('Matching READY visual lane required');return{content:json({lane:args.preparation.lane,preparationSha256:hash(json(ready)),destination:'visual-demos/'+hash(json(ready)),action:'produce-fixed-fictional-demo-after-private-review',nextStep:'Stop for human private review and a separate explicit operator request, with requestedAt after preparation.asOf. No production authorized.',identity:'Lumen Cairn',reviews:{...pending(),technical:'NOT_PRODUCED'}}),summary:'Preparation bound; no production authorized'};}};
  async function locate(args,ctx,scope) { if(!ctx?.agentId) throw Error('Agent workspace required'); return jail.resolveInside(ctx.agentId,args.destination,{scope}); }
  async function readPack(args,ctx,pack) {
    const {abs}=await locate(args,ctx,'read');
    const st=await fsp.lstat(abs); if(!st.isDirectory()||st.isSymbolicLink()) throw Error('Real demo directory required');
    const names=(await fsp.readdir(abs)).sort(); if(json(names)!==json(Object.keys(pack.files).sort())) throw Error('Demo inventory mismatch');
    const receipts=[];
    for(const name of names) {
      const file=P.join(abs,name), expected=pack.files[name], stat=await fsp.lstat(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==expected.length||stat.size>MAX_FILE) throw Error('Demo file type/size mismatch');
      const handle=await fsp.open(file,'r'); let actual;
      try { const pinned=await handle.stat(); if(!pinned.isFile()||pinned.size!==expected.length) throw Error('Demo file changed'); actual=Buffer.alloc(expected.length+1);let used=0;while(used<actual.length){const r=await handle.read(actual,used,actual.length-used,used);if(!r.bytesRead)break;used+=r.bytesRead;}actual=actual.subarray(0,used); } finally {await handle.close();}
      if(!actual.equals(expected)) throw Error('Demo byte/hash mismatch: '+name);
      receipts.push({operation:'visual-demo-write',path:args.destination+'/'+name,state:'read-back-verified',verifiedBytes:actual.length,sha256:hash(actual),actualSha256:hash(actual)});
    }
    return receipts;
  }
  const validateTool={name:'visual.demo.validate',capability:'studio',scope:'read',requiresConsent:false,network:false,requiresCompleteOutput:true,timeoutMs:10000,schema,description:'Read only the canonical fixed fictional visual demo inventory in the private workspace. Recompute matching READY preparation and original request; compare exact bounded bytes/hashes and technical format. Historical readback never renews production authority. Human visual, rights/licence and platform/engine reviews remain pending.',run:async(args,ctx)=>{const pack=build(args);const receipts=await readPack(args,ctx,pack);return{content:json({state:'TECHNICALLY_VALIDATED_PRIVATE_DEMO',receipts,checks:pack.checks,reviews:pack.reviews}),summary:'Exact demo bytes validated; stop for private human review'};}};
  const exportTool={name:'visual.demo.export',capability:'studio',scope:'write',requiresConsent:true,network:false,requiresCompleteOutput:true,timeoutMs:15000,schema,description:'Only after separate explicit operator request and matching reviewed READY preparation: generate and export a fixed fictional Lumen Cairn thumbnail, logo, 2D sprite or 3D OBJ demo. No custom names/content/data. Consent-gated fresh jailed destination only, atomic directory installation, independent byte readback receipts. No external actions; stop for human private review.',run:async(args,ctx)=>{
    const pack=build(args);current(args);active(ctx);const {abs}=await locate(args,ctx,'write'),stage=abs+'.pending';
    for(const target of [abs,stage]) {try{await fsp.lstat(target);throw Error('Destination or pending export already exists; stop and reconcile');}catch(e){if(e.code!=='ENOENT')throw e;}}
    await fsp.mkdir(P.dirname(abs),{recursive:true});
    // Exclusive staging directory serializes duplicate requests. Interrupted/failed stages are retained as evidence.
    active(ctx);await fsp.mkdir(stage);
    for(const [name,bytes] of Object.entries(pack.files)){active(ctx);const handle=await fsp.open(P.join(stage,name),'wx');try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}
    // Verify the staged bytes before the directory is made visible as a completed pack.
    await readPack({...args,destination:args.destination+'.pending'},ctx,pack);
    try{await fsp.lstat(abs);throw Error('Destination appeared; stop and reconcile');}catch(e){if(e.code!=='ENOENT')throw e;}
    active(ctx);await fsp.rename(stage,abs);
    const receipts=await readPack(args,ctx,pack);
    active(ctx);
    const mutationReceipt={operation:'visual-demo-export',path:args.destination,state:'read-back-verified',verifiedBytes:receipts.reduce((n,r)=>n+r.verifiedBytes,0),files:receipts};
    return{content:json({state:'EXPORTED_PRIVATE_DEMO',receipts,checks:pack.checks,reviews:pack.reviews,boundary:'Operator readiness and request are assertions, not independently verified authorization or rights. Stop for human private review.'}),summary:'Fixed fictional demo exported and byte-verified; human reviews pending',mutationReceipt};
  }};
  return {planTool,exportTool,validateTool,register(reg){reg.register(planTool);reg.register(exportTool);reg.register(validateTool);return reg;}};
}
module.exports={build,authorize,hash,json,inspectPNG,inspectOBJ,LANES,makeVisualAssetTools};
