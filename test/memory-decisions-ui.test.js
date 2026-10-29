'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Node {
  constructor(tag) { this.tagName=tag; this.className=''; this.children=[]; this.parentNode=null; this.textContent=''; this.style={}; this.attrs={}; this.disabled=false; this.onclick=null; }
  appendChild(node) { node.parentNode=this; this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(n=>this.appendChild(n)); }
  replaceChildren(...nodes) { this.children.forEach(n=>n.parentNode=null); this.children=[]; this.textContent=''; nodes.forEach(n=>this.appendChild(n)); }
  setAttribute(k,v) { this.attrs[k]=String(v); }
  remove() { if (!this.parentNode) return; const p=this.parentNode; p.children=p.children.filter(n=>n!==this); this.parentNode=null; }
  querySelector(selector) {
    const cls=selector[0]==='.' ? selector.slice(1) : '';
    for (const c of this.children) { if (cls && String(c.className).split(/\s+/).includes(cls)) return c; const nested=c.querySelector(selector); if (nested) return nested; }
    return null;
  }
  get text() { return this.textContent + this.children.map(c=>c.text).join(''); }
}
const host=new Node('div'), section=new Node('section'), status=new Node('span');
const byId={'mc-decision-history':host,'mc-decision-history-sec':section,'mc-decision-history-status':status};
const document={createElement:tag=>new Node(tag),getElementById:id=>byId[id]||null};
const pages=[];
const harness={api:{get:async url=>{pages.push(url); if (url.includes('agent=broken')) throw new Error('500');
  if (url.includes('agent=empty')) return {ok:true,agentId:'empty',records:[],total:0,offset:0,limit:20,hasMore:false};
  if (url.includes('offset=10')) return {ok:true,agentId:'agent',records:[{id:'older',decision:'older record',source:'unknown',trust:'unknown',confidence:null,createdAt:null,uncertainty:'unknown',outcomeEvents:[],outcomeEventsTotal:0,lessonProposals:[],lessonProposalsTotal:0}],total:11,offset:10,limit:10,hasMore:false};
  const newest={id:'newer',decision:'<img src=x onerror=alert(1)>',alternatives:['A'],evidenceRefs:['ref:1'],confidence:null,uncertainty:'model says unknown',createdAt:100,source:'model',trust:'unconfirmed',outcomeStatus:'recorded',outcomeEvents:[{eventId:'out-1',outcome:'unverified result',evidenceRefs:['run:1'],createdAt:101,source:'model',trust:'unconfirmed'}],outcomeEventsTotal:1,lessonProposals:[
    {outcomeEventId:'out-1',lesson:'candidate staged',status:'staging'},
    {outcomeEventId:'out-2',lesson:'candidate pending',status:'pending'},
    {outcomeEventId:'out-3',lesson:'candidate kept',status:'kept'},
    {outcomeEventId:'out-4',lesson:'candidate discarded',status:'discarded'},
    {outcomeEventId:'out-6',lesson:'candidate Keep recovery',status:'reviewing-kept'},
    {outcomeEventId:'out-5',lesson:'legacy status',status:'other'}
  ],lessonProposalsTotal:6};
  const filler=Array.from({length:9},(_,i)=>({id:'fill-'+i,decision:'older fixture '+i,source:'model',trust:'unconfirmed',confidence:null,createdAt:99-i,uncertainty:'unknown',outcomeEvents:[],outcomeEventsTotal:0,lessonProposals:[],lessonProposalsTotal:0}));
  return {ok:true,agentId:'agent',records:[newest,...filler],total:11,offset:0,limit:10,hasMore:true};
}}};
const source=fs.readFileSync(path.join(__dirname,'../frontend/app/memorydecisions.js'),'utf8');
const sandbox={module:{exports:{}},document,window:{},Harness:harness};
vm.runInNewContext(source,sandbox,{filename:'memorydecisions.js'});
const api=sandbox.module.exports;

(async()=>{
  await api.load('agent');
  A.eq(pages[0],'/api/memory/decisions?agent=agent&limit=10&offset=0','only the selected agent and bounded first page are requested');
  A.ok(host.text.includes('MODEL-REPORTED · UNCONFIRMED'),'record provenance is visible without promoting trust');
  A.ok(host.text.includes('MODEL-REPORTED · UNVERIFIED'),'outcome provenance remains explicitly unverified');
  A.ok(host.text.includes('unknown (not supplied)'),'missing confidence is rendered as unknown, not zero');
  A.ok(host.text.includes('STAGED · QUEUE COMPLETION MAY NEED RECOVERY'),'staging is not mislabeled as pending or kept');
  A.ok(host.text.includes('AWAITING COMMANDER REVIEW'),'pending proposals remain visibly awaiting review');
  A.ok(host.text.includes('KEEP IN PROGRESS · REVIEW RECEIPT RECOVERY MAY BE NEEDED'),'reviewing-kept remains visible as an in-progress recovery state');
  A.ok(host.text.includes('KEPT · REFERENCE ONLY'),'kept lessons are distinguished from verified facts');
  A.ok(host.text.includes('DISCARDED'),'discarded lesson candidates remain visible in the retrospective');
  A.ok(host.text.includes('REVIEW STATUS UNKNOWN'),'legacy/unsupported proposal status is not assumed kept');
  A.ok(!host.text.includes('Reading durable decision history…'),'successful first page removes the loading placeholder');
  A.ok(!status.textContent.includes('Reading newest'),'successful first page clears the loading status');
  A.ok(host.text.includes('<img src=x onerror=alert(1)>'),'model text is rendered as literal inspectable text');
  A.ok(host.querySelector('.mc-decision-more'),'partial history exposes a continuation button');
  A.ok(!Object.prototype.hasOwnProperty.call(host,'innerHTML'),'the renderer uses DOM text, not an HTML parsing surface');
  A.ok(!source.includes('innerHTML'),'the component never uses an HTML parsing surface');
  const older=host.querySelector('.mc-decision-more');
  await older.onclick();
  A.ok(pages[1].includes('offset=10'),'Load older requests the next bounded page');
  A.ok(host.text.includes('older record'),'older history is appended to the same read-only surface');
  A.eq((host.text.match(/<img src=x onerror=alert\(1\)>/g)||[]).length,1,'new page preserves existing entries without duplicating them');

  await api.load('empty');
  A.ok(host.text.includes('No structured decisions are recorded'),'successful empty read is labeled as empty');
  await api.load('broken');
  A.ok(host.text.includes('stored records are not confirmed empty'),'failed read is never presented as an empty history');
  A.eq(status.textContent,'History unavailable','failed initial read replaces the loading status with an error state');
  harness.api.get=async url=>url.includes('agent=empty-more')
    ? {ok:true,agentId:'empty-more',records:[],total:20,offset:0,limit:10,hasMore:true}
    : {ok:true,agentId:'agent',records:[],total:0,offset:0,limit:10,hasMore:false};
  await api.load('empty-more');
  A.ok(host.text.includes('not confirmed empty'),'an empty page claiming more data fails visibly');
  A.ok(!host.querySelector('.mc-decision-more'),'an inconsistent empty page cannot expose an endless same-offset continuation');
  await api.load('../other-agent');
  A.ok(host.text.includes('no other agent history was requested'),'invalid selected agent does not fall back to another agent');
  A.eq(pages.filter(url=>url.includes('other-agent')).length,0,'invalid agent IDs do not issue a request');
  const station=fs.readFileSync(path.join(__dirname,'../frontend/app/stationui.js'),'utf8');
  const stationMirror=fs.readFileSync(path.join(__dirname,'../website/app/app/stationui.js'),'utf8');
  const index=fs.readFileSync(path.join(__dirname,'../frontend/index.html'),'utf8');
  A.ok(station.includes('MemoryDecisionHistory.load(a.id)'),'selected agent Memory Core mounts the retrospective using its own agent ID');
  A.ok(station.includes('STRUCTURED LESSON · UNVERIFIED') && station.includes('Positive examples:') && station.includes('Negative examples:'),'pending lesson review renders structured metadata and both examples as text');
  A.ok(/if \(p\.lessonContract\) \{ keep\.disabled = true; keep\.title = 'structured lesson requires scoped validation\/promotion; not yet supported'/.test(station),'structured lesson Keep is visibly disabled pending validation/promotion');
  A.eq(stationMirror,station,'website station UI mirror includes the structured lesson review boundary');
  A.ok(index.includes('app/memorydecisions.js'),'the decision history component loads before the Memory Core owner');
  A.report('memory-decisions-ui.test');
})().catch(e=>{console.error(e);process.exitCode=1;});
