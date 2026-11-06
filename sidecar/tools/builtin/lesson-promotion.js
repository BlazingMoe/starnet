'use strict';
// Operator-only promotion. A notebook row is inert until its authoritative decision receipt commits.
const crypto=require('crypto');
const {readDecisionRows,cleanLessonContract}=require('./decisions.js');
const {inspect,audit,freshness,stable}=require('./lesson-validation.js');
const LABELS={trust:'unverified',authority:'reference-only'};
const PROMOTION='project-reference-only';
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
module.exports={PROMOTION,promote,canRead,pendingPromotion,retryProposal,isStructuredProposal};
