/* Decision history stays separate from approved notebook memory and survives a cold store reconstruction. */
'use strict';
const A = require('./_assert.js');
const path = require('path');
const { makeMemoryStore, memoryFileFor, resetAgentMemory, appendPending, listPending } = require('../sidecar/memory-store.js');
const { makeDecisionTools, lessonSourceKey } = require('../sidecar/tools/builtin/decisions.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { _internals: { toolKind } } = require('../sidecar/acp/core.js');
const { categoriesFor } = require('../sidecar/station-recovery.js');
function memFs() {
  const files = new Map(), fds = new Map(), failures = new Map(); let nextFd = 1;
  return { files, failures, readFileSync(p) { if (failures.has(p)) { const e = new Error('locked'); e.code = failures.get(p); throw e; } if (!files.has(p)) { const e = new Error('ENOENT'); e.code='ENOENT'; throw e; } return files.get(p); },
    writeFileSync(p, d) { files.set(p, String(d)); }, renameSync(a,b) { files.set(b,files.get(a)); files.delete(a); }, mkdirSync() {},
    openSync(p, flags) { const fd=nextFd++; fds.set(fd,{p,b:flags==='r' ? files.get(p) : ''}); return fd; },
    writeSync(fd,d) { const x=fds.get(fd); x.b+=String(d); files.set(x.p,x.b); }, fsyncSync() {}, closeSync(fd) { fds.delete(fd); } };
}
(async () => {
  const root='/ws', fs=memFs();
  A.eq(memoryFileFor(root,path,'decisions:hero'),path.join(root,'hero.decisions.json'),'decision key is routed through per-agent durable files');
  A.throws(()=>memoryFileFor(root,path,'decisions:../escape'),'decision key rejects path traversal');
  A.ok(lessonSourceKey('hero','same-decision','same-outcome') !== lessonSourceKey('other','same-decision','same-outcome'),'candidate source identity includes agent isolation');
  A.ok(categoriesFor('hero.decisions.json').includes('memories'),'station recovery classifies durable decision files with memory data');
  const store=makeMemoryStore({fs,path,workspaces:root});
  const reg=makeRegistry(); makeDecisionTools({store,clock:{now:()=>123},redact:s=>String(s).replace('sk-secret','[redacted]')}).register(reg);
  A.ok(reg.get('decision.record') && reg.get('decision.outcome') && reg.get('decision.list'),'all three tools are actually registered');
  A.eq(reg.get('decision.list').readOnly,true,'list is classified read-only by scope');
  A.eq(reg.get('decision.record').readOnly,false,'record is a write');
  A.eq(reg.get('decision.outcome').readOnly,false,'outcome is a write');
  A.eq(reg.get('decision.record').requiresConsent,false,'inherits existing private notebook grant consent behavior');
  A.eq(toolKind('decision.list'),'read','ACP shows list as a read');
  A.eq(toolKind('decision.record'),'edit','ACP shows record as an edit');
  A.eq(toolKind('decision.outcome'),'edit','ACP shows outcome as an edit');
  const call=async(name,args,agentId='hero')=>reg.dispatch({id:'c',name,args,argsRaw:JSON.stringify(args),parseError:null},{agentId});
  const denied=await reg.dispatch({id:'d',name:'decision.record',args:{},argsRaw:'{}',parseError:null},{agentId:'hero',canUse:()=>false}); A.ok(!denied.ok,'existing capability gate can deny decision tools');
  const input={clientId:'cli-1',decision:'choose route B',alternatives:['route A'],evidenceRefs:['artifact:report-2'],uncertainty:'sample size is small'};
  let r=await call('decision.record',input); A.ok(r.ok,'well-formed decision records');
  r=await call('decision.record',input); A.ok(r.ok && /Already recorded/.test(r.content),'same client ID and data are retry-idempotent');
  r=await call('decision.record',{...input,decision:'different'}); A.ok(!r.ok,'reusing client ID with conflicting content fails');
  r=await call('decision.record',{...input,clientId:'bad',confidence:2}); A.ok(!r.ok,'out-of-range confidence is rejected');
  r=await call('decision.record',{...input,clientId:'bad',alternatives:'not-array'}); A.ok(!r.ok,'malformed alternatives are rejected');
  r=await call('decision.record',{...input,clientId:'secret',decision:'sk-secret'}); A.ok(r.ok,'record write with redacted field succeeds');
  r=await call('decision.outcome',{id:'decision_cli-1',eventId:'out-1',outcome:'experiment supported choice',evidenceRefs:['run:99']}); A.ok(r.ok,'outcome appends');
  r=await call('decision.outcome',{id:'decision_cli-1',eventId:'out-1',outcome:'experiment supported choice',evidenceRefs:['run:99']}); A.ok(r.ok && /Already appended/.test(r.content),'outcome retries are idempotent');
  r=await call('decision.outcome',{id:'decision_cli-1',eventId:'out-1',outcome:'different',evidenceRefs:[]}); A.ok(!r.ok,'conflicting event ID reuse fails');
  r=await call('decision.list',{},'other'); A.eq(JSON.parse(r.content).total,0,'decision history is isolated per agent');
  // Reconstruct the store and tools with the same filesystem to prove actual cold persistence.
  const cold=makeMemoryStore({fs,path,workspaces:root}), coldReg=makeRegistry(); makeDecisionTools({store:cold,clock:{now:()=>456},proposeLesson:async input=>{const id='lesson_'+input.outcomeEventId;const proposal={id,kind:'lesson',proposalType:'decision-lesson',content:input.lesson,sourceDecisionId:input.decisionId,sourceOutcomeEventId:input.outcomeEventId,sourceDecision:input.sourceDecision,sourceOutcome:input.sourceOutcome,evidenceRefs:input.evidenceRefs,uncertainty:input.uncertainty};const added=await appendPending(cold,input.agentId,'lesson_'+input.outcomeEventId,[proposal],456);return added||listPending(cold,input.agentId).some(x=>x.id===id)?{ok:true}:{ok:false,error:'queue full'};}}).register(coldReg);
  r=await coldReg.dispatch({id:'c',name:'decision.list',args:{},argsRaw:'{}',parseError:null},{agentId:'hero'});
  const page=JSON.parse(r.content); A.eq(page.records.length,2,'both decisions survive a fresh store/tool construction');
  const first=page.records.find(x=>x.clientId==='cli-1');
  A.eq(first.confidence,null,'unknown confidence persists as null'); A.eq(first.trust,'unconfirmed','model record is not promoted to trusted memory');
  A.eq(first.source,'model','record provenance remains explicit'); A.eq(first.outcomeStatus,'recorded','later outcome status is explicit'); A.eq(first.outcomeEvents.length,1,'outcome is appended while preserving original decision');
  A.eq(first.decision,'choose route B','original decision is unchanged by outcome'); A.eq(first.evidenceRefs,['artifact:report-2'],'original evidence is unchanged');
  A.ok(!JSON.stringify(page.records).includes('sk-secret'),'redaction is applied before persistence');
  r=await coldReg.dispatch({id:'c',name:'decision.list',args:{limit:1,offset:0},argsRaw:'{}',parseError:null},{agentId:'hero'});
  const firstPage=JSON.parse(r.content); A.eq(firstPage.records.length,1,'list returns a bounded page'); A.eq(firstPage.total,2,'page metadata reports total records'); A.eq(firstPage.hasMore,true,'page metadata advertises continuation');
  r=await coldReg.dispatch({id:'c',name:'decision.list',args:{limit:51},argsRaw:'{}',parseError:null},{agentId:'hero'}); A.ok(!r.ok,'oversized page limit is rejected');
  A.eq(cold.get('notebook:hero'),undefined,'decision history is never silently promoted to notebook facts');  r=await coldReg.dispatch({id:'l',name:'decision.lesson_propose',args:{decisionId:'decision_cli-1',outcomeEventId:'out-1',lesson:'Verify with a second independent run.'},argsRaw:'{}',parseError:null},{agentId:'hero'});
  A.ok(r.ok && /unverified lesson candidate/.test(r.content),'registered lesson tool queues a candidate for review');
  A.eq(cold.get('notebook:hero'),undefined,'lesson proposal does not write notebook memory');  // Simulate a crash after the durable receipt is staged but before the pending candidate can be queued.
  const stagedReg=makeRegistry(); makeDecisionTools({store:cold,clock:{now:()=>500},proposeLesson:async()=>{throw new Error('simulated queue interruption');}}).register(stagedReg);
  for (const [name,args] of [['decision.record',{clientId:'stage',decision:'choose B',alternatives:[],evidenceRefs:[],uncertainty:'unknown'}],['decision.outcome',{id:'decision_stage',eventId:'stage-out',outcome:'model reports success',evidenceRefs:[]}]]) { const x=await stagedReg.dispatch({id:'s',name,args,argsRaw:'{}',parseError:null},{agentId:'staged'}); A.ok(x.ok,'prepare staged-recovery source history'); }
  let staged=await stagedReg.dispatch({id:'s',name:'decision.lesson_propose',args:{decisionId:'decision_stage',outcomeEventId:'stage-out',lesson:'Verify again.'},argsRaw:'{}',parseError:null},{agentId:'staged'}); A.ok(!staged.ok,'queue interruption surfaces to caller');
  const recoveryReg=makeRegistry(); makeDecisionTools({store:cold,clock:{now:()=>501},proposeLesson:async input=>{const id='lesson_'+input.outcomeEventId;const q={id,kind:'lesson',proposalType:'decision-lesson',content:input.lesson,sourceDecisionId:input.decisionId,sourceOutcomeEventId:input.outcomeEventId};await appendPending(cold,input.agentId,'lesson_'+input.outcomeEventId,[q],501);return {ok:true};}}).register(recoveryReg);
  staged=await recoveryReg.dispatch({id:'s',name:'decision.lesson_propose',args:{decisionId:'decision_stage',outcomeEventId:'stage-out',lesson:'Verify again.'},argsRaw:'{}',parseError:null},{agentId:'staged'}); A.ok(staged.ok,'exact retry recovers staged receipt'); A.eq(listPending(cold,'staged').length,1,'recovered stage is queued once');
  staged=await recoveryReg.dispatch({id:'s',name:'decision.lesson_propose',args:{decisionId:'decision_stage',outcomeEventId:'stage-out',lesson:'Different candidate'},argsRaw:'{}',parseError:null},{agentId:'staged'}); A.ok(!staged.ok,'staged receipt prevents conflicting candidate text');
  A.eq(listPending(cold,'hero').length,1,'lesson candidate enters existing durable pending queue');
  const queued=listPending(cold,'hero')[0]; A.eq(queued.sourceDecisionId,'decision_cli-1','candidate source decision comes from persisted agent history'); A.eq(queued.sourceOutcomeEventId,'out-1','candidate source outcome is attached'); A.eq(queued.evidenceRefs,['artifact:report-2','run:99'],'source evidence references are retained'); A.eq(queued.uncertainty,'sample size is small','source uncertainty is retained');
  r=await coldReg.dispatch({id:'l',name:'decision.lesson_propose',args:{decisionId:'decision_cli-1',outcomeEventId:'out-1',lesson:'Verify with a second independent run.'},argsRaw:'{}',parseError:null},{agentId:'hero'});
  A.ok(r.ok && /lesson candidate/.test(r.content),'exact proposal retry reconciles the existing pending candidate'); A.eq(listPending(cold,'hero').length,1,'exact retry does not duplicate pending row');
  await appendPending(cold,'hero','ordinary',Array.from({length:50},(_,i)=>({id:'ordinary_'+i,kind:'fact',content:'ordinary '+i})),460);
  A.eq(listPending(cold,'hero').length,50,'ordinary additions remain bounded at the existing queue cap');
  A.ok(listPending(cold,'hero').some(x=>x.id==='lesson_out-1'),'ordinary FIFO overflow protects the lesson candidate from eviction');
  await cold.update('pending:hero',cur=>(Array.isArray(cur)?cur:[]).filter(x=>x.id!=='lesson_out-1'));
  r=await coldReg.dispatch({id:'l',name:'decision.lesson_propose',args:{decisionId:'decision_cli-1',outcomeEventId:'out-1',lesson:'Verify with a second independent run.'},argsRaw:'{}',parseError:null},{agentId:'hero'});
  A.ok(r.ok && listPending(cold,'hero').some(x=>x.id==='lesson_out-1'),'a pending receipt with a missing queue row is reconciled on exact retry');
  const longRefsD=Array.from({length:12},(_,i)=>'D'.repeat(990)+String(i).padStart(10,'0'));
  const longRefsO=Array.from({length:12},(_,i)=>'E'.repeat(990)+String(i).padStart(10,'0'));
  r=await coldReg.dispatch({id:'x',name:'decision.record',args:{clientId:'refs',decision:'choose based on long refs',alternatives:[],evidenceRefs:longRefsD,uncertainty:'unknown'},argsRaw:'{}',parseError:null},{agentId:'refs'}); A.ok(r.ok,'long bounded decision refs are accepted');
  r=await coldReg.dispatch({id:'x',name:'decision.outcome',args:{id:'decision_refs',eventId:'refs-out',outcome:'model observed result',evidenceRefs:longRefsO},argsRaw:'{}',parseError:null},{agentId:'refs'}); A.ok(r.ok,'long bounded outcome refs are accepted');
  r=await coldReg.dispatch({id:'x',name:'decision.lesson_propose',args:{decisionId:'decision_refs',outcomeEventId:'refs-out',lesson:'Retest the result.'},argsRaw:'{}',parseError:null},{agentId:'refs'}); A.ok(r.ok,'combined 24-reference lesson candidate is queued');
  const refRow=listPending(cold,'refs')[0]; A.eq(refRow.evidenceRefs.length,24,'all 24 unique source references survive durable queueing'); A.ok(refRow.evidenceRefs.every(x=>x.length===1000),'1000-character evidence references are not silently truncated');
  const colder=makeMemoryStore({fs,path,workspaces:root}); A.eq(listPending(colder,'hero').find(x=>x.proposalType==='decision-lesson').sourceOutcomeEventId,'out-1','pending lesson survives cold store reconstruction');
  r=await coldReg.dispatch({id:'l',name:'decision.lesson_propose',args:{decisionId:'decision_cli-1',outcomeEventId:'missing',lesson:'x'},argsRaw:'{}',parseError:null},{agentId:'hero'}); A.ok(!r.ok,'lesson source outcome must resolve in persisted history');
  // Exact retries remain safe at capacity; new records and outcome events fail instead of evicting history.
  const capacityReg=makeRegistry(); makeDecisionTools({store:cold,clock:{now:()=>789}}).register(capacityReg);
  const capacityCall=(name,args)=>capacityReg.dispatch({id:'cap',name,args,argsRaw:JSON.stringify(args),parseError:null},{agentId:'full'});
  for(let i=0;i<200;i++) { r=await capacityCall('decision.record',{clientId:'full-'+i,decision:'d'+i,alternatives:[],evidenceRefs:[],uncertainty:'unknown'}); if(!r.ok) throw new Error('unexpected capacity write failure at '+i+': '+r.content); }
  r=await capacityCall('decision.record',{clientId:'full-0',decision:'d0',alternatives:[],evidenceRefs:[],uncertainty:'unknown'}); A.ok(r.ok,'exact retry still succeeds when record history is full');
  r=await capacityCall('decision.record',{clientId:'full-new',decision:'new',alternatives:[],evidenceRefs:[],uncertainty:'unknown'}); A.ok(!r.ok && /full/.test(r.content),'full history rejects new records without evicting oldest');
  for(let i=0;i<40;i++) { r=await capacityCall('decision.outcome',{id:'decision_full-0',eventId:'event-'+i,outcome:'outcome '+i,evidenceRefs:[]}); if(!r.ok) throw new Error('unexpected outcome write failure at '+i+': '+r.content); }
  r=await capacityCall('decision.outcome',{id:'decision_full-0',eventId:'event-0',outcome:'outcome 0',evidenceRefs:[]}); A.ok(r.ok,'exact outcome retry still succeeds at event capacity');
  r=await capacityCall('decision.outcome',{id:'decision_full-0',eventId:'event-new',outcome:'new',evidenceRefs:[]}); A.ok(!r.ok && /full/.test(r.content),'outcome event history rejects overflow');
  await resetAgentMemory(cold,'hero'); A.eq(cold.get('decisions:hero'),[],'agent memory reset clears decision history');
  fs.files.delete(path.join(root,'hero.decisions.json.bak')); fs.files.set(path.join(root,'hero.decisions.json'),'{malformed');
  r=await coldReg.dispatch({id:'c',name:'decision.list',args:{},argsRaw:'{}',parseError:null},{agentId:'hero'}); A.ok(!r.ok && /unavailable/.test(r.content),'corrupt history is reported instead of shown as empty');
  const unreadableFs=memFs(), lockedFile=path.join(root,'locked.decisions.json'); unreadableFs.files.set(lockedFile,'[]'); unreadableFs.failures.set(lockedFile,'EACCES');
  const unreadable=makeMemoryStore({fs:unreadableFs,path,workspaces:root}), unreadableReg=makeRegistry(); makeDecisionTools({store:unreadable}).register(unreadableReg);
  r=await unreadableReg.dispatch({id:'u',name:'decision.list',args:{},argsRaw:'{}',parseError:null},{agentId:'locked'}); A.ok(!r.ok && /unavailable/.test(r.content),'unreadable history is reported instead of shown as empty');
  A.report('decision-history.test');
})().catch(e=>{console.error(e);process.exitCode=1;});
