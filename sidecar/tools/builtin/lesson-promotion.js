'use strict';
// Operator-only promotion. A notebook row is inert until its authoritative decision receipt commits.
const crypto=require('crypto');
const {readDecisionRows,cleanLessonContract}=require('./decisions.js');
const {inspect,audit,freshness,stable}=require('./lesson-validation.js');
const LABELS={trust:'unverified',authority:'reference-only'};
const PROMOTION='project-reference-only';
const MAX_EFFECTS=12;
const MAX_EFFECT_BYTES=32768;
function rowsFor(store,key) {
  const r=store.readKey(key);
  if(r.status==='absent' && !r.quarantined)return [];
  if(!['ok','recovered'].includes(r.status) || !Array.isArray(r.value))throw new Error('promotion storage unavailable');
  return r.value;
}
function candidate(rows,agentId,decisionId,outcomeEventId,now) {
  const matches=rows.filter(d=>d && d.id===decisionId);
  if(matches.length!==1)throw new Error('promotion source decision unavailable');
  const ps=(matches[0].lessonProposals||[]).filter(p=>p && p.outcomeEventId===outcomeEventId);
  if(ps.length!==1 || !ps[0].contract)throw new Error('typed promotion candidate unavailable');
  const c=ps[0].contract,b={agentId,decisionId,outcomeEventId,version:c.version,scope:c.scope,sourceRefs:c.sourceRefs};
  const source=inspect(rows,b,cleanLessonContract),p=source.p;
  if(c.scope.type!=='project' || !['pending','kept'].includes(p.status))throw new Error('only a pending project candidate may be promoted');
  const history=audit(p,b,source.sourceDigest,source.sourceRefs),latest=history[history.length-1];
  if(!latest || latest.result!=='evidence-passed' || freshness(c,now)!=='current' || now<latest.recordedAt)throw new Error('promotion requires current passed held-out evidence');
  const identity={schemaVersion:1,agentId,decisionId,outcomeEventId,version:c.version,projectId:c.scope.id,sourceDigest:source.sourceDigest,validationId:latest.evidence.validationId,inputDigest:latest.inputDigest};
  const id='project_lesson_'+crypto.createHash('sha256').update(stable(identity)).digest('hex').slice(0,32);
  const record={id,kind:'lesson',title:'Project reference (unverified)',body:p.lesson,content:p.lesson,scope:'project',createdAt:p.createdAt,lessonContract:c,lessonPromotion:identity,...LABELS};
  return {...source,identity,record,validatedAt:latest.recordedAt};
}
function sameRecord(record,expected) {
  if(!record)return false;
  const {lastUsedAt,useCount,...fixed}=record;
  return stable(fixed)===stable(expected);
}
function receiptFor(source,runId,proposalId,now) {return {...source.identity,memoryId:source.record.id,runId,proposalId,promotedAt:now,...LABELS};}
function checkReceipt(source,receipt) {
  if(!receipt || !Number.isFinite(receipt.promotedAt) || receipt.promotedAt<source.validatedAt || typeof receipt.runId!=='string' || !receipt.runId || typeof receipt.proposalId!=='string' || !receipt.proposalId || stable(receipt)!==stable(receiptFor(source,receipt.runId,receipt.proposalId,receipt.promotedAt)) || source.p.status!=='kept' || source.p.memoryId!==source.record.id || source.p.reviewedAt!==receipt.promotedAt)throw new Error('promotion receipt does not match source history');
  if(freshness(source.contract,receipt.promotedAt)!=='current')throw new Error('promotion receipt was stale');
}
function promotedSource(rows,agentId,memoryId) {
  const hits=[];
  for(const d of rows||[])for(const p of (d && d.lessonProposals)||[])if(p && p.promotionReceipt && p.promotionReceipt.memoryId===memoryId)hits.push({d,p});
  if(hits.length!==1)throw new Error('project reference source missing or ambiguous');
  const {d,p}=hits[0],c=p.contract;
  if(!c || c.scope.type!=='project' || !['kept','revoked'].includes(p.status))throw new Error('project reference is not revocable');
  const b={agentId,decisionId:d.id,outcomeEventId:p.outcomeEventId,version:c.version,scope:c.scope,sourceRefs:c.sourceRefs};
  const source=inspect(rows,b,cleanLessonContract),history=audit(p,b,source.sourceDigest,source.sourceRefs),receipt=p.promotionReceipt;
  const validation=history.filter(a=>a.evidence.validationId===receipt.validationId && a.inputDigest===receipt.inputDigest);
  if(validation.length!==1)throw new Error('promotion validation receipt unavailable');
  const identity={schemaVersion:1,agentId,decisionId:d.id,outcomeEventId:p.outcomeEventId,version:c.version,projectId:c.scope.id,sourceDigest:source.sourceDigest,validationId:validation[0].evidence.validationId,inputDigest:validation[0].inputDigest};
  const id='project_lesson_'+crypto.createHash('sha256').update(stable(identity)).digest('hex').slice(0,32);
  const record={id,kind:'lesson',title:'Project reference (unverified)',body:p.lesson,content:p.lesson,scope:'project',createdAt:p.createdAt,lessonContract:c,lessonPromotion:identity,...LABELS};
  if(!Number.isFinite(receipt.promotedAt) || typeof receipt.runId!=='string' || !receipt.runId || receipt.runId.length>200 || typeof receipt.proposalId!=='string' || !receipt.proposalId || receipt.proposalId.length>200)throw new Error('malformed promotion receipt identity');
  const expected={...identity,memoryId:id,runId:receipt.runId,proposalId:receipt.proposalId,promotedAt:receipt.promotedAt,...LABELS};
  if(stable(receipt)!==stable(expected) || receipt.promotedAt<validation[0].recordedAt || freshness(c,receipt.promotedAt)!=='current' || p.memoryId!==id || p.reviewedAt!==receipt.promotedAt)throw new Error('promotion receipt does not match source history');
  return {...source,identity,record,receipt};
}
function revocationFor(source,now) {
  return {schemaVersion:1,memoryId:source.record.id,promotionDigest:crypto.createHash('sha256').update(stable(source.receipt)).digest('hex'),revokedAt:now,reason:'operator-project-reference-revoke'};
}
function checkRevocation(source,receipt) {
  if(!receipt || !Number.isFinite(receipt.revokedAt) || receipt.revokedAt<source.receipt.promotedAt || stable(receipt)!==stable(revocationFor(source,receipt.revokedAt)))throw new Error('revocation receipt does not match promotion');
}
function shortText(value,name,max) {
  if(typeof value!=='string')throw new Error(name+' must be a string');
  const out=value.trim();if(!out || out.length>max)throw new Error(name+' must be 1-'+max+' characters');return out;
}
function number(value,name) {
  if(typeof value!=='number' || !Number.isFinite(value) || Math.abs(value)>1e12)throw new Error(name+' must be a finite bounded number');return value;
}
function projectSnapshot(ctx) {
  const s=ctx && ctx.lessonScopeSnapshot;
  if(!s || s.schemaVersion!==1 || s.type!=='project' || typeof s.id!=='string' || !/^[A-Za-z0-9_-]{16,120}$/.test(s.id))throw new Error('current project context required');
  return s;
}
function decisionAndEvents(rows,id,beforeId,afterId,projectId) {
  const ds=rows.filter(d=>d && d.id===id);if(ds.length!==1)throw new Error('application decision missing or ambiguous');
  const d=ds[0],binding=d.sourceProjectBinding;
  if(!binding || binding.schemaVersion!==1 || binding.type!=='project' || binding.id!==projectId || d.source!=='model' || d.trust!=='unconfirmed' || !Array.isArray(d.outcomeEvents))throw new Error('application decision project provenance does not match lesson');
  const before=d.outcomeEvents.filter(e=>e && e.eventId===beforeId),after=d.outcomeEvents.filter(e=>e && e.eventId===afterId);
  if(beforeId===afterId || before.length!==1 || after.length!==1)throw new Error('distinct before and after outcome events required');
  const b=before[0],a=after[0];
  if(b.source!=='model' || b.trust!=='unconfirmed' || a.source!=='model' || a.trust!=='unconfirmed' || !Number.isFinite(b.createdAt) || !Number.isFinite(a.createdAt) || a.createdAt<b.createdAt)throw new Error('application outcome chronology or provenance is invalid');
  const evidence=[...new Set([...(Array.isArray(b.evidenceRefs)?b.evidenceRefs:[]),...(Array.isArray(a.evidenceRefs)?a.evidenceRefs:[])])];
  if(!evidence.length || evidence.length>24 || evidence.some(x=>typeof x!=='string' || !x || x.length>1000))throw new Error('measured effect requires bounded before/after evidence references');
  return {d,b,a,evidence};
}
function effectFor(source,app,input,recordedAt) {
  const delta=input.after-input.before,improved=input.desiredDirection==='increase'?delta>0:delta<0;
  return {schemaVersion:1,effectId:input.effectId,memoryId:source.record.id,projectId:source.identity.projectId,applicationDecisionId:app.d.id,beforeEventId:app.b.eventId,afterEventId:app.a.eventId,metric:input.metric,unit:input.unit,before:input.before,after:input.after,desiredDirection:input.desiredDirection,delta,improved,evidenceRefs:app.evidence,recordedAt,promotionDigest:crypto.createHash('sha256').update(stable(source.receipt)).digest('hex'),...LABELS};
}
function verifyEffects(rows,source) {
  const effects=source.p.effects;
  if(effects===undefined)return [];
  if(!Array.isArray(effects) || effects.length>MAX_EFFECTS || Buffer.byteLength(stable(effects),'utf8')>MAX_EFFECT_BYTES)throw new Error('malformed lesson effect history');
  const ids=new Set();
  for(const e of effects) {
    if(!e || ids.has(e.effectId) || !Number.isFinite(e.recordedAt) || e.recordedAt<source.receipt.promotedAt)throw new Error('malformed lesson effect identity or chronology');
    const input={effectId:shortText(e.effectId,'stored effectId',120),metric:shortText(e.metric,'stored metric',80),unit:shortText(e.unit,'stored unit',40),before:number(e.before,'stored before'),after:number(e.after,'stored after'),desiredDirection:e.desiredDirection};
    if(!['increase','decrease'].includes(input.desiredDirection))throw new Error('malformed stored effect direction');
    const app=decisionAndEvents(rows,e.applicationDecisionId,e.beforeEventId,e.afterEventId,source.identity.projectId),expected=effectFor(source,app,input,e.recordedAt);
    if(!Number.isFinite(app.d.createdAt) || app.d.createdAt<source.receipt.promotedAt || app.b.createdAt<source.receipt.promotedAt || freshness(source.contract,app.a.createdAt)!=='current')throw new Error('stored lesson effect application is outside the active contract');
    if(stable(e)!==stable(expected))throw new Error('lesson effect no longer matches authoritative history');
    ids.add(e.effectId);
  }
  return effects;
}
function makeEffectTool({store,clock,redact}) {
  const clean=(v,n,max)=>{if(typeof v!=='string')throw new Error(n+' must be a string');return shortText(String(redact(v)),n,max);};
  return {name:'decision.lesson_effect',capability:'memory',scope:'write',requiresConsent:false,
    description:'Record an unverified before/after measurement for use of one active project lesson. It links existing decision outcome IDs and evidence references; it never grants trust, permissions, renewal, or automatic promotion.',
    schema:{type:'object',additionalProperties:false,required:['effectId','memoryId','applicationDecisionId','beforeEventId','afterEventId','metric','unit','before','after','desiredDirection'],properties:{effectId:{type:'string',maxLength:120},memoryId:{type:'string'},applicationDecisionId:{type:'string'},beforeEventId:{type:'string'},afterEventId:{type:'string'},metric:{type:'string',maxLength:80},unit:{type:'string',maxLength:40},before:{type:'number'},after:{type:'number'},desiredDirection:{enum:['increase','decrease']}}},
    run:async(args,ctx)=>{
      const agentId=ctx && ctx.agentId || 'agent',snapshot=projectSnapshot(ctx),input={effectId:clean(args.effectId,'effectId',120),metric:clean(args.metric,'metric',80),unit:clean(args.unit,'unit',40),before:number(args.before,'before'),after:number(args.after,'after'),desiredDirection:String(args.desiredDirection||'')};
      if(!/^[A-Za-z0-9_-]{1,40}$/.test(agentId))throw new Error('bounded agent identity required');
      if(!/^[A-Za-z0-9._:-]{1,120}$/.test(input.effectId) || !['increase','decrease'].includes(input.desiredDirection))throw new Error('bounded effect identity and desiredDirection required');
      const memoryId=clean(args.memoryId,'memoryId',80),applicationDecisionId=clean(args.applicationDecisionId,'applicationDecisionId',120),beforeEventId=clean(args.beforeEventId,'beforeEventId',120),afterEventId=clean(args.afterEventId,'afterEventId',120);
      let saved,duplicate=false;
      await store.update('decisions:'+agentId,rows=>{
        const source=promotedSource(rows,agentId,memoryId);
        if(source.p.status!=='kept' || source.identity.projectId!==snapshot.id)throw new Error('active project reference in current project required');
        const active=rowsFor(store,'notebook:'+agentId).filter(r=>r && r.id===memoryId);
        if(active.length!==1 || !sameRecord(active[0],source.record))throw new Error('active project reference notebook row unavailable or edited');
        if(source.d.id===applicationDecisionId)throw new Error('effect must use a later application decision');
        const history=verifyEffects(rows,source),app=decisionAndEvents(rows,applicationDecisionId,beforeEventId,afterEventId,source.identity.projectId),prior=history.find(e=>e.effectId===input.effectId);
        if(!Number.isFinite(app.d.createdAt) || app.d.createdAt<source.receipt.promotedAt || app.b.createdAt<source.receipt.promotedAt || freshness(source.contract,app.a.createdAt)!=='current')throw new Error('application did not occur while the project reference contract was current');
        if(prior) {if(stable(prior)!==stable(effectFor(source,app,input,prior.recordedAt)))throw new Error('effectId already belongs to a different measurement');saved=prior;duplicate=true;return undefined;}
        if(history.length>=MAX_EFFECTS)throw new Error('lesson effect history full');
        const now=clock.now();if(!Number.isFinite(now) || now<app.a.createdAt || now<source.receipt.promotedAt)throw new Error('effect clock is stale');
        saved=effectFor(source,app,input,now);const effects=[...history,saved];if(Buffer.byteLength(stable(effects),'utf8')>MAX_EFFECT_BYTES)throw new Error('lesson effect history byte limit reached');const next={...source.p,effects};
        return rows.map(d=>d===source.d?{...d,lessonProposals:d.lessonProposals.map(p=>p===source.p?next:p)}:d);
      });
      return {content:JSON.stringify({effectId:saved.effectId,memoryId:saved.memoryId,delta:saved.delta,improved:saved.improved,duplicate,...LABELS}),summary:'unverified project lesson effect recorded'};
    }};
}
function projectEffects(p,redact) {
  if(!p || p.effects===undefined)return {};
  if(!Array.isArray(p.effects))return {lessonEffectsUnavailable:true};
  const clip=(v,n)=>typeof v==='string'?String(redact(v)).slice(0,n):'';
  const effects=p.effects.slice(-MAX_EFFECTS).reverse().map(e=>({effectId:clip(e&&e.effectId,120),applicationDecisionId:clip(e&&e.applicationDecisionId,120),beforeEventId:clip(e&&e.beforeEventId,120),afterEventId:clip(e&&e.afterEventId,120),metric:clip(e&&e.metric,80),unit:clip(e&&e.unit,40),before:e&&Number.isFinite(e.before)?e.before:null,after:e&&Number.isFinite(e.after)?e.after:null,delta:e&&Number.isFinite(e.delta)?e.delta:null,desiredDirection:e&&['increase','decrease'].includes(e.desiredDirection)?e.desiredDirection:'unknown',improved:e&&typeof e.improved==='boolean'?e.improved:null,evidenceRefs:Array.isArray(e&&e.evidenceRefs)?e.evidenceRefs.slice(0,24).map(x=>clip(x,1000)):[],recordedAt:e&&Number.isFinite(e.recordedAt)?e.recordedAt:null,trust:'unverified',authority:'reference-only'}));
  return {lessonEffectsTotal:p.effects.length,lessonEffectsTruncated:p.effects.length>MAX_EFFECTS,lessonEffects:effects};
}
function isStructuredProposal(store,agentId,prop) {
  if(Object.prototype.hasOwnProperty.call(prop,'lessonContract'))return true;
  if(prop.proposalType!=='decision-lesson')return false;
  const d=readDecisionRows(store,agentId).find(d=>d.id===prop.sourceDecisionId);
  return !!(d && (d.lessonProposals||[]).some(p=>p.outcomeEventId===prop.sourceOutcomeEventId && Object.prototype.hasOwnProperty.call(p,'contract')));
}
function pendingPromotion(store,agentId,prop,now) {
  try {
    if(!isStructuredProposal(store,agentId,prop))return {};
    const s=candidate(readDecisionRows(store,agentId),agentId,prop.sourceDecisionId,prop.sourceOutcomeEventId,now);
    if(s.p.lesson!==prop.content || (prop.lessonContract && stable(prop.lessonContract)!==stable(s.contract)))throw new Error('proposal mismatch');
    return {structuredLesson:true,promotion:{type:PROMOTION,eligible:s.p.status==='pending',projectId:s.identity.projectId,label:'Keep project reference only',...LABELS}};
  }catch(_){return {structuredLesson:true,promotion:{type:PROMOTION,eligible:false,label:'Project reference promotion unavailable',...LABELS}};}
}
function retryProposal(store,agentId,runId,id) {
  const matches=[];
  for(const d of readDecisionRows(store,agentId))for(const p of d.lessonProposals||[])if(p.promotionReceipt && p.promotionReceipt.runId===runId && p.promotionReceipt.proposalId===id)matches.push({id,runId,proposalType:'decision-lesson',kind:'lesson',sourceDecisionId:d.id,sourceOutcomeEventId:p.outcomeEventId,content:p.lesson,lessonContract:p.contract});
  if(matches.length>1)throw new Error('ambiguous promotion retry');
  return matches[0]||null;
}
async function promote({store,agentId,prop,runId,clock}) {
  readDecisionRows(store,agentId);rowsFor(store,'notebook:'+agentId);
  let saved,duplicate=false;
  await store.update('decisions:'+agentId,async rows=>{
    const source=candidate(rows,agentId,prop.sourceDecisionId,prop.sourceOutcomeEventId,clock.now());
    if(prop.content!==source.p.lesson || (Object.prototype.hasOwnProperty.call(prop,'lessonContract') && stable(prop.lessonContract)!==stable(source.contract)))throw new Error('proposal no longer matches stored contract');
    if(typeof runId!=='string' || !runId || runId.length>200 || typeof prop.id!=='string' || !prop.id || prop.id.length>200)throw new Error('promotion review identity required');
    if(source.p.status==='kept') {
      checkReceipt(source,source.p.promotionReceipt);
      if(source.p.promotionReceipt.runId!==runId || source.p.promotionReceipt.proposalId!==prop.id)throw new Error('conflicting promotion retry');
      const existing=rowsFor(store,'notebook:'+agentId).filter(r=>r && r.id===source.record.id);
      if(existing.length!==1 || !sameRecord(existing[0],source.record))throw new Error('promoted notebook row unavailable or edited');
      saved=source.p.promotionReceipt;duplicate=true;return undefined;
    }
    if(source.p.promotionReceipt)throw new Error('unsupported promotion transition');
    await store.update('notebook:'+agentId,stored=>{
      if(stored!==undefined && !Array.isArray(stored))throw new Error('malformed notebook storage');
      const list=stored||[],existing=list.filter(r=>r && (r.id===source.record.id || (r.lessonPromotion && r.lessonPromotion.decisionId===source.identity.decisionId && r.lessonPromotion.outcomeEventId===source.identity.outcomeEventId)));
      if(existing.length) {if(existing.length!==1 || !sameRecord(existing[0],source.record))throw new Error('conflicting staged notebook row');return undefined;}
      return [...list,source.record];
    });
    // The decision lock remains held while staging; this single commit activates the row and review state.
    const now=clock.now();candidate(rows,agentId,prop.sourceDecisionId,prop.sourceOutcomeEventId,now);
    saved=receiptFor(source,runId,prop.id,now);
    const next={...source.p,status:'kept',memoryId:source.record.id,reviewedAt:now,promotionReceipt:saved};
    return rows.map(d=>d===source.d?{...d,lessonProposals:d.lessonProposals.map(p=>p===source.p?next:p)}:d);
  });
  return {ok:true,id:saved.memoryId,kind:'lesson',promotion:PROMOTION,projectId:saved.projectId,duplicate,...LABELS};
}
async function revoke({store,agentId,memoryId,clock}) {
  if(typeof agentId!=='string' || !/^[A-Za-z0-9_-]{1,40}$/.test(agentId) || typeof memoryId!=='string' || !/^project_lesson_[a-f0-9]{32}$/.test(memoryId))throw new Error('project reference identity required');
  readDecisionRows(store,agentId);rowsFor(store,'notebook:'+agentId);
  let saved,duplicate=false,removed=false;
  await store.update('decisions:'+agentId,async rows=>{
    const source=promotedSource(rows,agentId,memoryId);
    if(source.p.status==='revoked') {
      checkRevocation(source,source.p.revocationReceipt);
      if(rowsFor(store,'notebook:'+agentId).some(r=>r && r.id===memoryId))throw new Error('revoked project reference is still active');
      saved=source.p.revocationReceipt;duplicate=true;return undefined;
    }
    await store.update('notebook:'+agentId,stored=>{
      if(stored!==undefined && !Array.isArray(stored))throw new Error('malformed notebook storage');
      const list=stored||[],matches=list.filter(r=>r && r.id===memoryId);
      if(matches.length>1 || (matches.length===1 && !sameRecord(matches[0],source.record)))throw new Error('project reference notebook row is conflicting or edited');
      if(!matches.length)return undefined;
      removed=true;return list.filter(r=>!r || r.id!==memoryId);
    });
    const now=clock.now();
    if(!Number.isFinite(now) || now<source.receipt.promotedAt)throw new Error('revocation clock is stale');
    saved=revocationFor(source,now);
    const next={...source.p,status:'revoked',revokedAt:now,revocationReceipt:saved};
    return rows.map(d=>d===source.d?{...d,lessonProposals:d.lessonProposals.map(p=>p===source.p?next:p)}:d);
  });
  return {ok:true,id:memoryId,revocation:'project-reference',removed,duplicate,revokedAt:saved.revokedAt,...LABELS};
}
function canRead(store,record,ctx) {
  try {
    const snap=ctx && ctx.lessonScopeSnapshot,mark=record && record.lessonPromotion;
    if(!snap || snap.schemaVersion!==1 || snap.type!=='project' || !/^[A-Za-z0-9_-]{16,120}$/.test(snap.id) || !mark || mark.agentId!==ctx.agentId || mark.projectId!==snap.id)return false;
    const s=candidate(readDecisionRows(store,ctx.agentId),ctx.agentId,mark.decisionId,mark.outcomeEventId,ctx.now);
    checkReceipt(s,s.p.promotionReceipt);
    const stored=rowsFor(store,'notebook:'+ctx.agentId).filter(r=>r && r.id===s.record.id);
    return s.identity.projectId===snap.id && stored.length===1 && sameRecord(record,s.record) && sameRecord(stored[0],s.record);
  }catch(_){return false;}
}
module.exports={PROMOTION,promote,revoke,canRead,pendingPromotion,retryProposal,isStructuredProposal,makeEffectTool,projectEffects,MAX_EFFECTS,MAX_EFFECT_BYTES};
