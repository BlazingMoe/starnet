/* BIZ-5 held-out evidence is durable reference-only audit, never promotion. */
'use strict';
const A=require('./_assert.js'),path=require('path');
const {makeMemoryStore}=require('../sidecar/memory-store.js');
const {makeDecisionTools,readDecisionRows}=require('../sidecar/tools/builtin/decisions.js');
const {makeRegistry}=require('../sidecar/tools/registry.js');
const {makeDecisionHistoryHttp}=require('../sidecar/control/decision-history-http.js');
const {toolKind}=require('../sidecar/acp/core.js')._internals;
const {projectValidation,MAX_EVIDENCE_BYTES,MAX_AUDIT_BYTES,MAX_PROJECTION_BYTES}=require('../sidecar/tools/builtin/lesson-validation.js');
const {cleanLessonContract}=require('../sidecar/tools/builtin/decisions.js');
const byteSize=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
function memFs() {const files=new Map(),fds=new Map();let n=0;return {files,readFileSync(p){if(!files.has(p)){const e=new Error('ENOENT');e.code='ENOENT';throw e;}return files.get(p);},writeFileSync(p,d){files.set(p,String(d));},renameSync(a,b){files.set(b,files.get(a));files.delete(a);},mkdirSync(){},openSync(p,flags){const fd=++n;fds.set(fd,{p,b:flags==='r'?files.get(p):''});return fd;},writeSync(fd,d){const x=fds.get(fd);x.b+=String(d);files.set(x.p,x.b);},fsyncSync(){},closeSync(fd){fds.delete(fd);}};}
(async()=>{
 const fs=memFs();let now=Date.parse('2026-10-01T00:00:00Z');let store=makeMemoryStore({fs,path,workspaces:'/validation'}),reg;
 const redact=s=>s.replace(/sk-secret/g,'[redacted]');
 function wire(){reg=makeRegistry();makeDecisionTools({store,clock:{now:()=>now},redact,proposeLesson:async()=>({ok:true})}).register(reg);}
 wire();const call=(name,args,agentId='hero')=>reg.dispatch({id:'call',name,args,argsRaw:JSON.stringify(args),parseError:null},{agentId,lessonScopeSnapshot:{schemaVersion:1,type:'project',id:'opaque_project_id_0009'}});
 const contract={schemaVersion:1,scope:{type:'project',id:'opaque_project_id_0009'},sourceRefs:['artifact:training','run:training'],uncertainty:'small sample',confidence:null,version:'v1',recheckAt:'2026-11-01',expiresAt:'2026-12-01',positiveExamples:['matching context'],negativeExamples:['unrelated context']};
 A.ok((await call('decision.record',{clientId:'one',decision:'choose B',alternatives:['A'],evidenceRefs:['artifact:training'],uncertainty:'small sample'})).ok,'record source');
 A.ok((await call('decision.outcome',{id:'decision_one',eventId:'outcome',outcome:'observed B',evidenceRefs:['run:training']})).ok,'record outcome');
 A.ok((await call('decision.lesson_propose',{decisionId:'decision_one',outcomeEventId:'outcome',lesson:'PRIVATE reference only',contract})).ok,'typed candidate');
 const baseline=clone(readDecisionRows(store,'hero'));
 const input={validationId:'validation-1',binding:{agentId:'hero',decisionId:'decision_one',outcomeEventId:'outcome',version:'v1',scope:contract.scope,sourceRefs:contract.sourceRefs},uncertainty:'sk-secret limited held-out sample',cases:[{id:'positive-1',category:'positive',sourceRefs:['heldout:positive'],expected:'matches',observed:'matches sk-secret',result:'pass'},{id:'negative-1',category:'negative',sourceRefs:['heldout:negative'],expected:'reject unrelated',observed:'rejected',result:'pass'}]};
 const validate=(x=input,agent='hero')=>call('decision.lesson_validate',x,agent);
 const receipt=()=>readDecisionRows(store,'hero')[0].lessonProposals[0];
 const reset=async rows=>store.update('decisions:hero',()=>clone(rows));
 const bad=async(x,label)=>A.ok(!(await validate(x)).ok,label);
 A.eq(reg.get('decision.lesson_validate').readOnly,false,'validation classified write');A.eq(toolKind('decision.lesson_validate'),'edit','ACP classification is edit');
 A.ok(!(await reg.dispatch({id:'denied',name:'decision.lesson_validate',args:input,argsRaw:'{}',parseError:null},{agentId:'hero',canUse:()=>false})).ok,'existing capability gate denies validation');
 let r=await validate();A.ok(r.ok,'positive and negative evidence attaches');A.eq(receipt().status,'pending','validation leaves review lifecycle pending');A.eq(receipt().reviewState.state,'evidence-passed','passed evidence state is durable');A.eq(receipt().validations[0].recordedAt,now,'injected timestamp persisted');A.ok(!JSON.stringify(receipt()).includes('sk-secret'),'evidence redacted before persistence');
 A.eq(store.get('notebook:hero'),undefined,'no notebook activation');
 const first=JSON.stringify(receipt());r=await validate();A.ok(r.ok && JSON.parse(r.content).duplicate,'exact retry reconciles');A.eq(JSON.stringify(receipt()),first,'exact retry never rewrites audit');
 await bad({...input,uncertainty:'changed'},'conflicting duplicate id rejects');
 await bad({...input,uncertainty:'[redacted] limited held-out sample'},'different raw bytes with same redacted text conflict');
 store=makeMemoryStore({fs,path,workspaces:'/validation'});wire();A.eq(JSON.stringify(receipt()),first,'cold reconstruction preserves audit');A.ok((await validate()).ok,'cold exact retry reconciles');
 const failing=clone(input);failing.validationId='validation-2';failing.cases[1].result='fail';failing.cases[1].observed='unexpected match';r=await validate(failing);A.ok(r.ok,'failed evidence is accepted as evidence');A.eq(receipt().reviewState.state,'evidence-failed','failed review state durable');A.eq(receipt().validations.length,2,'failed case preserves earlier positive audit');
 const validRows=clone(readDecisionRows(store,'hero'));
 for(const [key,value] of [['agentId','other'],['decisionId','missing'],['outcomeEventId','missing'],['version','v2'],['scope',{type:'global'}],['sourceRefs',['invented']]]) await bad({...input,binding:{...input.binding,[key]:value}},'wrong binding '+key+' rejected');
 A.ok(!(await validate(input,'other')).ok,'execution agent cannot claim another agent binding');
 for(const x of [{...input,validationId:'new',cases:input.cases.slice(0,1)},{...input,validationId:'new',uncertainty:''},{...input,validationId:'new',authority:'execute'},{...input,validationId:'new',cases:input.cases.map(c=>({...c,category:'positive'}))},{...input,validationId:'new',cases:input.cases.map(c=>({...c,sourceRefs:[]}))}]) await bad(x,'malformed evidence/category rejected');
 const reused=clone(input);reused.validationId='new';reused.cases[0].sourceRefs=['artifact:training'];await bad(reused,'training source cannot be claimed held-out');
 const http=makeDecisionHistoryHttp({readForAgent:a=>readDecisionRows(store,a),clock:{now:()=>now},redact,respondJson:(_,status,body)=>({status,body})});
 const get=()=>http.serve({method:'GET',url:'/api/memory/decisions?agent=hero'},{});
 let projected=get().body.records[0].lessonProposals[0];A.eq(projected.reviewState.authority,'reference-only','HTTP review fixed authority');A.eq(projected.validations[0].trust,'unverified','HTTP claim fixed trust');A.ok(!JSON.stringify(projected).includes('Digest'),'HTTP omits internal digests');A.ok(!JSON.stringify(projected).includes('sk-secret'),'HTTP redaction preserved');A.eq(projected.validationFreshness,'current','injected HTTP freshness');
 now=Date.parse('2026-11-01T00:00:00Z');await bad({...input,validationId:'new'},'recheck cutoff blocks new evidence');A.eq(get().body.records[0].lessonProposals[0].validationFreshness,'recheck-required','recheck state computed deterministically');r=await validate(input);A.ok(r.ok && JSON.parse(r.content).validationFreshness==='recheck-required','historical retry reconciles without renewing recheck');
 now=Date.parse('2026-12-01T00:00:00Z');await bad({...input,validationId:'new'},'expiry cutoff blocks new evidence');A.eq(get().body.records[0].lessonProposals[0].validationFreshness,'expired','expiry is projected');A.ok((await validate(input)).ok,'expired exact retry does not revive or refresh');
 now=Date.parse('2026-09-01T00:00:00Z');await bad(input,'stale injected clock rejects even retry');now=Date.parse('2026-10-02T00:00:00Z');
 for(const status of ['discarded','kept','reviewing-kept','conflicted','staging']) {const rows=clone(validRows);rows[0].lessonProposals[0].status=status;await reset(rows);await bad(input,status+' cannot be revived by exact validation retry');A.eq(receipt().validations.length,2,status+' preserves historical audit');}
 for(const mutate of [rows=>{delete rows[0].lessonProposals[0].contract;},rows=>{rows[0].lessonProposals[0].validations={};},rows=>{rows[0].lessonProposals[0].reviewState.state='approved';},rows=>{rows[0].sourceProjectBinding.id='opaque_project_id_0010';},rows=>{rows[0].outcomeEvents[0].outcome='modified source';},rows=>{rows[0].lessonProposals[0].contract.version='v2';},rows=>{rows[0].lessonProposals[0].contract.sourceRefs=['invented'];},rows=>{rows[0].lessonProposals[0].validations[0].authority='execute';},rows=>{rows[0].lessonProposals[0].validations[0].recordedAt=NaN;}]) {const rows=clone(validRows);mutate(rows);await reset(rows);store=makeMemoryStore({fs,path,workspaces:'/validation'});wire();await bad(input,'malformed or changed cold storage rejects');A.eq(get().body.records[0].lessonProposals[0].reviewState.state,'unavailable','malformed audit never projects a passed state');}

 // Aggregate UTF-8 budgets reject values that independently satisfy every string/item bound.
 await reset(baseline);
 const oversized=clone(input);oversized.validationId='multi-byte';oversized.uncertainty='界'.repeat(1000);
 oversized.cases=oversized.cases.map(c=>({...c,expected:'界'.repeat(1000),observed:'界'.repeat(1000)}));
 A.ok(byteSize(oversized)>MAX_EVIDENCE_BYTES && JSON.stringify(oversized).length<MAX_EVIDENCE_BYTES,'multi-byte fixture distinguishes UTF-8 bytes from JS string length');
 r=await validate(oversized);A.ok(!r.ok && /byte budget/.test(r.content),'oversized multi-byte submission rejects');A.eq(receipt().validations,undefined,'oversized submission writes no audit');
 const large=clone(input);large.uncertainty='界'.repeat(500);large.cases=large.cases.map(c=>({...c,sourceRefs:[...c.sourceRefs,c.sourceRefs[0]+':detail'],expected:'界'.repeat(500),observed:'界'.repeat(300)}));
 large.cases.push({id:'extra',category:'positive',sourceRefs:['heldout:extra'],expected:'match',observed:'match',result:'pass'});
 A.ok(byteSize(large)<MAX_EVIDENCE_BYTES,'large valid submission fits individual budget');
 let accepted=0,lastInput;
 for(let i=0;i<12;i++){const attempt={...large,validationId:'budget-'+i};r=await validate(attempt);if(!r.ok)break;accepted++;lastInput=attempt;}
 A.ok(accepted>1 && accepted<12 && !r.ok && /byte budget/.test(r.content),'retained audit byte cap refuses before entry-count cap');
 A.ok(byteSize({validations:receipt().validations,reviewState:receipt().reviewState})<=MAX_AUDIT_BYTES,'retained audit stays inside aggregate cap');
 const capped=JSON.stringify(receipt());A.ok((await validate(lastInput)).ok,'exact retry succeeds at aggregate audit cap');A.eq(JSON.stringify(receipt()),capped,'cap retry preserves bytes');
 const row=readDecisionRows(store,'hero')[0];
 const bounded=projectValidation(row.lessonProposals[0],redact,now,row,'hero',cleanLessonContract);
 A.ok(byteSize(bounded)<=MAX_PROJECTION_BYTES,'projection has independent UTF-8 serialized bound');
 A.eq(bounded.validations.length,1,'projection exposes only latest audit entry');A.eq(bounded.validationsTotal,accepted,'projection reports complete durable audit count');A.eq(bounded.validationsTruncated,true,'older audits explicitly truncated');
 A.eq(bounded.validationDetailsTruncated,true,'long multi-byte evidence details explicitly truncated');A.eq(bounded.validations[0].evidence.casesTotal,3,'full case count reported');A.eq(bounded.validations[0].evidence.casesTruncated,true,'case subset explicit');A.eq(bounded.validations[0].evidence.cases.map(c=>c.category),['positive','negative'],'latest positive and negative evidence retained');A.eq(bounded.validations[0].evidence.cases[0].sourceRefsTotal,2,'reference count reported');A.eq(bounded.validations[0].evidence.cases[0].sourceRefsTruncated,true,'reference detail subset explicit');A.ok(!JSON.stringify(bounded).includes('Digest'),'bounded projection excludes digests');
 A.ok(byteSize(get().body)<12000,'actual HTTP output stays small despite full durable audit');
 // One request captures one clock value, including a page spanning a recheck boundary.
 const second=clone(baseline[0]);second.id='decision_second';await reset([...clone(validRows),second]);
 A.ok((await validate({...input,validationId:'second',binding:{...input.binding,decisionId:'decision_second'}})).ok,'second valid projected row');
 let clockCalls=0;const cutoff=Date.parse('2026-11-01T00:00:00Z');
 const singleClock=makeDecisionHistoryHttp({readForAgent:a=>readDecisionRows(store,a),clock:{now:()=>cutoff-1+clockCalls++},redact,respondJson:(_,status,body)=>({status,body})});
 const clockPage=singleClock.serve({method:'GET',url:'/api/memory/decisions?agent=hero'},{});
 A.eq(clockCalls,1,'one injected clock call per multi-row request');A.eq(clockPage.body.records.map(x=>x.lessonProposals[0].validationFreshness),['current','current'],'all rows use the same pre-cutoff timestamp');
 await reset(baseline);const legacy=clone(baseline);delete legacy[0].lessonProposals[0].contract;await reset(legacy);await bad(input,'untyped candidate cannot attach structured evidence');
 await store.update('decisions:hero',()=>({legacy:true}));await bad(input,'malformed storage rejected before mutation');
 A.report('lesson-validation.test');
})().catch(e=>{console.error(e);process.exitCode=1;});
