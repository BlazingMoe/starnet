'use strict';
const A=require('./_assert.js'),path=require('path');
const {makeMemoryStore}=require('../sidecar/memory-store.js');
const {makeDecisionTools,readDecisionRows}=require('../sidecar/tools/builtin/decisions.js');
const {makeNotebookTools}=require('../sidecar/tools/builtin/notebook.js');
const P=require('../sidecar/tools/builtin/lesson-promotion.js'),C=require('../sidecar/context.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function memFs() {const files=new Map(),fds=new Map();let n=0;return {files,readFileSync(p){if(!files.has(p)){const e=new Error('ENOENT');e.code='ENOENT';throw e;}return files.get(p);},writeFileSync(p,d){files.set(p,String(d));},renameSync(a,b){files.set(b,files.get(a));files.delete(a);},mkdirSync(){},openSync(p,flags){const fd=++n;fds.set(fd,{p,b:flags==='r'?files.get(p):''});return fd;},writeSync(fd,d){const x=fds.get(fd);x.b+=String(d);files.set(x.p,x.b);},fsyncSync(){},closeSync(fd){fds.delete(fd);}};}

(async()=>{
 const fs=memFs();let store=makeMemoryStore({fs,path,workspaces:'/promotion'}),now=Date.parse('2026-10-01T00:00:00Z');
 const project={schemaVersion:1,type:'project',id:'opaque_project_id_0009'},ctx={agentId:'hero',lessonScopeSnapshot:project};
 const tools=makeDecisionTools({store,clock:{now:()=>now},proposeLesson:async()=>({ok:true})});
 await tools.recordTool.run({clientId:'one',decision:'choose B',alternatives:['A'],evidenceRefs:['source:decision'],uncertainty:'small sample'},ctx);
 await tools.outcomeTool.run({id:'decision_one',eventId:'outcome',outcome:'result B',evidenceRefs:['source:outcome']},ctx);
 const contract={schemaVersion:1,scope:{type:'project',id:project.id},sourceRefs:['source:decision','source:outcome'],uncertainty:'limited sample',confidence:null,version:'v1',recheckAt:'2026-11-01',expiresAt:'2026-12-01',positiveExamples:['match'],negativeExamples:['unrelated']};
 await tools.lessonTool.run({decisionId:'decision_one',outcomeEventId:'outcome',lesson:'PRIVATE scoped finding',contract},ctx);
 const evidence={validationId:'passed',binding:{agentId:'hero',decisionId:'decision_one',outcomeEventId:'outcome',version:'v1',scope:contract.scope,sourceRefs:contract.sourceRefs},uncertainty:'unverified cases',cases:[{id:'p',category:'positive',sourceRefs:['held:p'],expected:'match',observed:'match',result:'pass'},{id:'n',category:'negative',sourceRefs:['held:n'],expected:'reject',observed:'reject',result:'pass'}]};
 await tools.validationTool.run(evidence,ctx);
 const prop={id:'proposal',proposalType:'decision-lesson',sourceDecisionId:'decision_one',sourceOutcomeEventId:'outcome',content:'PRIVATE scoped finding',lessonContract:readDecisionRows(store,'hero')[0].lessonProposals[0].contract};
 const original=clone(readDecisionRows(store,'hero'));const receipt=()=>readDecisionRows(store,'hero')[0].lessonProposals[0];const notes=()=>store.get('notebook:hero')||[];
 const args=()=>({store,agentId:'hero',prop,runId:'review',clock:{now:()=>now}});
 const opts=extra=>({...ctx,now,canReadStructuredLesson:(r,c)=>P.canRead(store,r,c),...extra});
 const notebook=()=>makeNotebookTools({store,clock:{now:()=>now},eligibleMemoryRecords:C.eligibleMemoryRecords,rank:C.rank,canReadStructuredLesson:(r,c)=>P.canRead(store,r,c)});
 async function fails(fn,label){let failed=false;try{await fn();}catch(_){failed=true;}A.ok(failed,label);}
 async function reset(){await store.update('decisions:hero',()=>clone(original));await store.update('notebook:hero',()=>[]);now=Date.parse('2026-10-01T00:00:00Z');}
 async function hidden(extra,label){const o=opts(extra),rows=notes();A.eq(C.rank(rows,'finding',o).length,0,label+' rank');A.eq(C.renderRecall(rows,o).count,0,label+' render');A.eq(C.compactionMemoryBlock(rows,'finding',o),'',label+' compaction');const read=await notebook().readTool.run({},o);A.ok(!read.content.includes('PRIVATE'),label+' notebook read');}
 A.eq(P.pendingPromotion(store,'hero',prop,now).promotion.eligible,true,'pending projection enables explicit project-reference Keep');
 // Failure after staging but before the decision receipt leaves an inert row; retry completes it once.
 let failCommit=true,notebookWrites=0,decisionWrites=0;
 const underlying=store;
 store={...underlying,update:(key,fn)=>underlying.update(key,async cur=>{const next=await fn(cur);if(next!==undefined){if(key==='notebook:hero')notebookWrites++;if(key==='decisions:hero'){if(failCommit)throw new Error('simulated receipt commit failure');decisionWrites++;}}return next;})};
 await fails(()=>P.promote(args()),'receipt failure surfaces');A.eq(notes().length,1,'one quarantined row staged');A.eq(receipt().status,'pending','failed receipt preserves pending status');await hidden({},'staged crash');
 failCommit=false;let result=await P.promote(args());A.eq(result.promotion,'project-reference-only','operator result names reference promotion');A.eq(result.trust,'unverified','operator promotion does not grant trust');A.eq(notebookWrites,1,'retry reuses staged row without a second notebook write');A.eq(decisionWrites,1,'one atomic review/receipt commit');
 A.eq(receipt().status,'kept','promotion and review commit together');A.eq(receipt().promotionReceipt.memoryId,notes()[0].id,'receipt binds exact record');A.eq(notes()[0].authority,'reference-only','record has reference-only authority');
 A.eq(C.rank(notes(),'finding',opts()).length,1,'matching live project ranks reference');A.ok(C.renderRecall(notes(),opts()).text.includes('PRIVATE'),'matching render includes reference');A.ok(C.compactionMemoryBlock(notes(),'finding',opts()).includes('PRIVATE'),'matching compaction includes reference');A.ok((await notebook().readTool.run({},ctx)).content.includes('PRIVATE'),'matching notebook read includes reference');
 const saved=JSON.stringify(receipt());result=await P.promote(args());A.eq(result.duplicate,true,'lost response retry reconciles');A.eq(notebookWrites,1,'response retry writes no second row');A.eq(decisionWrites,1,'response retry writes no second receipt');A.eq(JSON.stringify(receipt()),saved,'receipt bytes unchanged');
 A.ok(P.retryProposal(store,'hero','review','proposal'),'retry can resolve after pending cleanup');
 store=makeMemoryStore({fs,path,workspaces:'/promotion'});A.eq((await P.promote(args())).duplicate,true,'cold Keep retry reconciles');A.ok(P.canRead(store,notes()[0],opts()),'cold authoritative receipt activates exact row');
 await hidden({lessonScopeSnapshot:null},'no project');await hidden({lessonScopeSnapshot:{...project,id:'opaque_project_id_0010'}},'wrong project');await hidden({agentId:'other'},'wrong execution agent');await hidden({lessonScopeSnapshot:{schemaVersion:1,type:'global'}},'global context');
 A.eq(C.renderRecall(notes(),{}).count,0,'direct renderer without host checker fails closed');
 const committed=clone(readDecisionRows(store,'hero')),committedNotes=clone(notes());
 for(const mutate of [rows=>{rows[0].decision='edited source';},rows=>{rows[0].lessonProposals[0].status='discarded';},rows=>{rows[0].lessonProposals[0].contract.version='v2';},rows=>{rows[0].sourceProjectBinding.id='opaque_project_id_0010';},rows=>{rows[0].lessonProposals[0].validations[0].evidence.cases[0].result='fail';},rows=>{rows[0].lessonProposals[0].promotionReceipt.projectId='other';}]){const rows=clone(committed);mutate(rows);await store.update('decisions:hero',()=>rows);await hidden({},'edited authoritative history');await fails(()=>P.promote(args()),'edited history cannot reconcile');}
 await store.update('decisions:hero',()=>clone(committed));await store.update('notebook:hero',()=>committedNotes.map(r=>({...r,body:'changed'})));await hidden({},'edited notebook row');await fails(()=>P.promote(args()),'edited notebook row cannot reconcile');
 await store.update('notebook:hero',()=>clone(committedNotes));now=Date.parse('2026-11-01T00:00:00Z');await hidden({},'recheck');await fails(()=>P.promote(args()),'recheck blocks retry');now=Date.parse('2026-12-01T00:00:00Z');await hidden({},'expiry');
 await reset();await fails(()=>P.promote({...args(),prop:{...prop,lessonContract:{...prop.lessonContract,version:'wrong'}}}),'wrong proposal contract rejected');A.eq(notes().length,0,'wrong version does not stage');
 await fails(()=>P.promote({...args(),agentId:'other'}),'wrong agent promotion rejected');
 const bad=clone(original);bad[0].lessonProposals[0].status='discarded';await store.update('decisions:hero',()=>bad);await fails(()=>P.promote(args()),'discard terminal before promotion');A.eq(notes().length,0,'discard stages nothing');
 await reset();const failed={...evidence,validationId:'failed',cases:evidence.cases.map(c=>({...c,result:'fail'}))};await makeDecisionTools({store,clock:{now:()=>now}}).validationTool.run(failed,ctx);await fails(()=>P.promote(args()),'latest failed evidence blocks promotion');A.eq(notes().length,0,'failed evidence stages nothing');
 await reset();await store.update('notebook:hero',()=>({broken:true}));await fails(()=>P.promote(args()),'malformed notebook fails closed');
 await reset();let calls=0;await fails(()=>P.promote({...args(),clock:{now:()=>calls++?Date.parse('2026-11-01T00:00:00Z'):now}}),'crossing recheck during staging fails receipt');await hidden({},'cutoff staging orphan');
 const legacy={id:'legacy',kind:'lesson',title:'Legacy',body:'legacy ordinary memory'};A.eq(C.rank([legacy],'memory',opts()).length,1,'ordinary legacy lesson unchanged');
 A.report('lesson-promotion.test');
})().catch(e=>{console.error(e);process.exitCode=1;});
