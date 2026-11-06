'use strict';
// Held-out evidence is a claim, never approval or an instruction.
const crypto = require('crypto');
const MAX_EVIDENCE_BYTES=8*1024, MAX_AUDIT_BYTES=32*1024, MAX_PROJECTION_BYTES=2*1024;
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
function budget(v,max,name) { if(bytes(v)>max) throw new Error(name+' exceeds serialized UTF-8 byte budget'); }
const MAX_VALIDATIONS=12, LABELS={trust:'unverified',authority:'reference-only'};
function stable(v) { return JSON.stringify(v,(_,x)=>x && typeof x==='object' && !Array.isArray(x)?Object.keys(x).sort().reduce((o,k)=>{o[k]=x[k];return o;},{}):x); }
function shape(v,keys,name) { if(!v || typeof v!=='object' || Array.isArray(v) || Object.keys(v).some(k=>!keys.includes(k)) || keys.some(k=>!Object.prototype.hasOwnProperty.call(v,k))) throw new Error(name+' has missing or unsupported fields'); }
function text(v,name,max=1000) { if(typeof v!=='string' || !v.trim() || v!==v.trim() || v.length>max) throw new Error(name+' must be bounded nonempty text'); }
function refs(v,name,required=true) { if(!Array.isArray(v) || (required && !v.length) || v.length>12 || new Set(v).size!==v.length) throw new Error(name+' requires bounded unique source references'); v.forEach(x=>text(x,name)); return v; }
function evidence(v) {
  shape(v,['validationId','binding','uncertainty','cases'],'validation'); text(v.validationId,'validationId',120); text(v.uncertainty,'uncertainty');
  const b=v.binding; shape(b,['agentId','decisionId','outcomeEventId','version','scope','sourceRefs'],'binding');
  for(const k of ['agentId','decisionId','outcomeEventId','version']) text(b[k],k,k==='version'?80:120);
  shape(b.scope,b.scope && b.scope.type==='global'?['type']:['type','id'],'scope');
  if(!['global','customer','project'].includes(b.scope.type)) throw new Error('unsupported scope');
  if(b.scope.type!=='global') text(b.scope.id,'scope.id',120); refs(b.sourceRefs,'binding.sourceRefs');
  if(!Array.isArray(v.cases) || v.cases.length<2 || v.cases.length>12) throw new Error('requires 2 to 12 held-out cases');
  const ids=new Set(),categories=new Set();
  for(const c of v.cases) {
    shape(c,['id','category','sourceRefs','expected','observed','result'],'case'); text(c.id,'case.id',120);
    if(ids.has(c.id)) throw new Error('duplicate case id'); ids.add(c.id);
    if(!['positive','negative'].includes(c.category) || !['pass','fail'].includes(c.result)) throw new Error('invalid category or result');
    categories.add(c.category); refs(c.sourceRefs,'case.sourceRefs'); text(c.expected,'expected'); text(c.observed,'observed');
  }
  if(categories.size!==2) throw new Error('positive and negative held-out cases required');
  budget(v,MAX_EVIDENCE_BYTES,'validation evidence');
  return JSON.parse(JSON.stringify(v));
}
function freshness(c,now) {
  if(!Number.isFinite(now) || now<0) throw new Error('injected timestamp required');
  const expiry=Date.parse(c.expiresAt+'T00:00:00.000Z'),recheck=Date.parse(c.recheckAt+'T00:00:00.000Z');
  if(!Number.isFinite(expiry) || !Number.isFinite(recheck)) throw new Error('malformed freshness dates');
  return now>=expiry?'expired':now>=recheck?'recheck-required':'current';
}
function inspect(rows,b,cleanContract) {
  if(!Array.isArray(rows)) throw new Error('malformed decision storage');
  const found=rows.filter(r=>r && r.id===b.decisionId); if(found.length!==1) throw new Error('source decision missing or ambiguous');
  const d=found[0];
  if(d.source!=='model' || d.trust!=='unconfirmed' || !Array.isArray(d.outcomeEvents) || !Array.isArray(d.lessonProposals)) throw new Error('malformed source history');
  const os=d.outcomeEvents.filter(o=>o && o.eventId===b.outcomeEventId),ps=d.lessonProposals.filter(p=>p && p.outcomeEventId===b.outcomeEventId);
  if(os.length!==1 || ps.length!==1) throw new Error('source outcome or candidate missing or ambiguous');
  const o=os[0],p=ps[0]; if(o.source!=='model' || o.trust!=='unconfirmed' || !p.contract) throw new Error('typed source provenance required');
  const {trust,authority,...input}=p.contract,contract=cleanContract(input,s=>s);
  if(stable(contract)!==stable(p.contract)) throw new Error('malformed stored contract');
  const sourceRefs=[...refs(d.evidenceRefs,'decision evidence',false),...refs(o.evidenceRefs,'outcome evidence',false)];
  if(!contract.sourceRefs.length || contract.sourceRefs.some(r=>!sourceRefs.includes(r))) throw new Error('contract source identity does not match history');
  if(stable(b)!==stable({agentId:b.agentId,decisionId:d.id,outcomeEventId:o.eventId,version:contract.version,scope:contract.scope,sourceRefs:contract.sourceRefs})) throw new Error('validation binding does not match candidate');
  if(stable(d.sourceProjectBinding||null)!==stable(p.sourceProjectBinding||null)) throw new Error('stored project provenance conflict');
  if(contract.scope.type==='project' && (!d.sourceProjectBinding || d.sourceProjectBinding.schemaVersion!==1 || d.sourceProjectBinding.type!=='project' || !/^[A-Za-z0-9_-]{16,120}$/.test(d.sourceProjectBinding.id) || d.sourceProjectBinding.id!==contract.scope.id)) throw new Error('stored project provenance required');
  if(!Number.isFinite(p.createdAt) || p.createdAt<0) throw new Error('malformed candidate timestamp');
  for(const [name,row,field] of [['decision',d,'decision'],['outcome',o,'outcome'],['candidate',p,'lesson']]) { text(row[field],name); if(!Number.isFinite(row.createdAt) || row.createdAt<0) throw new Error('malformed source timestamp'); }
  if(o.createdAt<d.createdAt || p.createdAt<o.createdAt) throw new Error('malformed source chronology');
  if(d.sourceProjectBinding) { shape(d.sourceProjectBinding,['schemaVersion','type','id'],'stored project binding'); if(d.sourceProjectBinding.schemaVersion!==1 || d.sourceProjectBinding.type!=='project' || !/^[A-Za-z0-9_-]{16,120}$/.test(d.sourceProjectBinding.id)) throw new Error('malformed source project binding'); }
  refs(contract.sourceRefs,'contract source refs');
  const sourceDigest=crypto.createHash('sha256').update(stable({decision:{id:d.id,decision:d.decision,evidenceRefs:d.evidenceRefs,uncertainty:d.uncertainty,createdAt:d.createdAt},outcome:o,lesson:p.lesson,contract,createdAt:p.createdAt,sourceProjectBinding:d.sourceProjectBinding||null})).digest('hex');
  return {d,p,contract,sourceRefs,sourceDigest};
}
function result(e) { return e.cases.every(c=>c.result==='pass')?'evidence-passed':'evidence-failed'; }
function review(a) { return {state:a.result,validationId:a.evidence.validationId,recordedAt:a.recordedAt,...LABELS}; }
function audit(p,b,sourceDigest,sourceRefs) {
  if(p.validations===undefined && p.reviewState===undefined) return [];
  if(!Array.isArray(p.validations) || !p.validations.length || p.validations.length>MAX_VALIDATIONS) throw new Error('malformed validation audit');
  budget({validations:p.validations,reviewState:p.reviewState},MAX_AUDIT_BYTES,'validation audit');
  const ids=new Set(); let last=-1;
  for(const a of p.validations) {
    shape(a,['evidence','inputDigest','sourceDigest','recordedAt','result','trust','authority'],'audit'); evidence(a.evidence);
    if(stable(a.evidence.binding)!==stable(b) || ids.has(a.evidence.validationId) || !/^[a-f0-9]{64}$/.test(a.inputDigest) || !Number.isFinite(a.recordedAt) || a.recordedAt<p.createdAt || a.recordedAt<last || a.trust!==LABELS.trust || a.authority!==LABELS.authority || a.result!==result(a.evidence)) throw new Error('malformed validation audit binding or state');
    if(!/^[a-f0-9]{64}$/.test(a.sourceDigest) || (sourceDigest && sourceDigest!==a.sourceDigest) || freshness(p.contract,a.recordedAt)!=='current') throw new Error('stale validation source or contract');
    const held=new Set(); for(const c of a.evidence.cases) for(const ref of c.sourceRefs) { if(held.has(ref) || (sourceRefs && sourceRefs.includes(ref))) throw new Error('malformed held-out audit sources'); held.add(ref); }
    ids.add(a.evidence.validationId);last=a.recordedAt;
  }
  if(stable(p.reviewState)!==stable(review(p.validations[p.validations.length-1]))) throw new Error('malformed review state');
  return p.validations;
}
function makeValidationTool({store,clock,redact,readRows,cleanContract}) {
  return {name:'decision.lesson_validate',capability:'memory',scope:'write',requiresConsent:false,
    description:'Attach positive and negative held-out evidence to an existing typed lesson. Unverified reference-only audit: never promotion, Keep/Edit, retrieval, permission, activation or evaluation authority.',
    schema:{type:'object',additionalProperties:false,required:['validationId','binding','uncertainty','cases'],properties:{validationId:{type:'string',maxLength:120},binding:{type:'object',additionalProperties:false,required:['agentId','decisionId','outcomeEventId','version','scope','sourceRefs'],properties:{agentId:{type:'string'},decisionId:{type:'string'},outcomeEventId:{type:'string'},version:{type:'string',maxLength:80},scope:{type:'object',properties:{type:{enum:['global','customer','project']},id:{type:'string'}}},sourceRefs:{type:'array',minItems:1,maxItems:12,items:{type:'string'}}}},uncertainty:{type:'string',maxLength:1000},cases:{type:'array',minItems:2,maxItems:12,items:{type:'object',additionalProperties:false,required:['id','category','sourceRefs','expected','observed','result'],properties:{id:{type:'string',maxLength:120},category:{enum:['positive','negative']},sourceRefs:{type:'array',minItems:1,maxItems:12,items:{type:'string',maxLength:1000}},expected:{type:'string',maxLength:1000},observed:{type:'string',maxLength:1000},result:{enum:['pass','fail']}}}}}},
    run:async(args,ctx)=>{
      const raw=evidence(args),aid=ctx && ctx.agentId || 'agent'; if(raw.binding.agentId!==aid) throw new Error('validation agent does not match execution agent');
      const clean=evidence(JSON.parse(JSON.stringify(raw,(_,v)=>typeof v==='string'?String(redact(v)):v)));
      if(stable(raw.binding)!==stable(clean.binding)) throw new Error('redaction cannot change binding');
      const inputDigest=crypto.createHash('sha256').update(stable(raw)).digest('hex');
      readRows(store,aid); const now=clock.now(); let saved,duplicate=false,currentFreshness;
      await store.update('decisions:'+aid,rows=>{
        const {d,p,contract,sourceRefs,sourceDigest}=inspect(rows,clean.binding,cleanContract);
        if(p.status!=='pending') throw new Error('validation requires pending candidate; terminal or conflicted states cannot be revived');
        const history=audit(p,clean.binding,sourceDigest,sourceRefs);
        currentFreshness=freshness(contract,now);
        if(now<p.createdAt || history.some(a=>a.recordedAt>now)) throw new Error('validation clock is stale');
        const prior=history.find(a=>a.evidence.validationId===clean.validationId);
        if(prior) { if(prior.inputDigest!==inputDigest || stable(prior.evidence)!==stable(clean)) throw new Error('validationId already belongs to different evidence'); saved=prior;duplicate=true;return undefined; }
        if(currentFreshness!=='current') throw new Error('candidate expired or requires recheck; fresh contract required');
        if(history.length>=MAX_VALIDATIONS) throw new Error('validation audit full');
        const held=new Set();
        for(const c of clean.cases) for(const ref of c.sourceRefs) { if(sourceRefs.includes(ref) || held.has(ref)) throw new Error('held-out sources must differ from training and other cases'); held.add(ref); }
        saved={evidence:clean,inputDigest,sourceDigest,recordedAt:now,result:result(clean),...LABELS};
        const retained={validations:[...history,saved],reviewState:review(saved)};
        budget(retained,MAX_AUDIT_BYTES,'validation audit');
        const next={...p,...retained};
        return rows.map(r=>r===d?{...d,lessonProposals:d.lessonProposals.map(x=>x===p?next:x)}:r);
      });
      return {content:JSON.stringify({validationId:saved.evidence.validationId,result:saved.result,recordedAt:saved.recordedAt,duplicate,validationFreshness:currentFreshness,...LABELS}),summary:'reference-only validation evidence recorded'};
    }
  };
}
function projectValidation(p,redact,now,row,agentId,cleanContract) {
  if(!p || (!Object.prototype.hasOwnProperty.call(p,'validations') && !Object.prototype.hasOwnProperty.call(p,'reviewState'))) return {};
  try {
    const binding=p.validations[0].evidence.binding;
    if(binding.agentId!==agentId || binding.decisionId!==row.id || binding.outcomeEventId!==p.outcomeEventId) throw new Error('projection source mismatch');
    const source=inspect([row],binding,cleanContract);
    const history=audit(p,binding,source.sourceDigest,source.sourceRefs);
    // One recent audit entry, with one positive and one negative case. The full audit stays durable.
    const latest=history[history.length-1], e=latest.evidence;
    for(const textLimit of [160,80,40,20,0]) {
      let detailsTruncated=false;
      const clip=value=>{const clean=String(redact(value)),chars=Array.from(clean);if(chars.length>textLimit) detailsTruncated=true;return chars.slice(0,textLimit).join('');};
      const cases=['positive','negative'].map(category=>{
        const c=e.cases.find(x=>x.category===category);
        if(c.sourceRefs.length>1) detailsTruncated=true;
        return {id:clip(c.id),category,expected:clip(c.expected),observed:clip(c.observed),result:c.result,sourceRefs:[clip(c.sourceRefs[0])],sourceRefsTotal:c.sourceRefs.length,sourceRefsTruncated:c.sourceRefs.length>1};
      });
      if(e.cases.length>cases.length) detailsTruncated=true;
      const reviewState={state:latest.result,validationId:clip(e.validationId),recordedAt:latest.recordedAt,...LABELS};
      const projectedEvidence={validationId:clip(e.validationId),uncertainty:clip(e.uncertainty),cases,casesTotal:e.cases.length,casesTruncated:e.cases.length>cases.length};
      const projected={reviewState,validations:[{evidence:projectedEvidence,recordedAt:latest.recordedAt,result:latest.result,...LABELS}],validationsTotal:history.length,validationsTruncated:history.length>1,validationDetailsTruncated:detailsTruncated,validationFreshness:typeof now==='number'?freshness(p.contract,now):'unknown'};
      if(bytes(projected)<=MAX_PROJECTION_BYTES) return projected;
    }
    throw new Error('validation projection exceeds byte budget');
  } catch (_) { return {reviewState:{state:'unavailable',...LABELS},validationFreshness:'unknown'}; }
}
module.exports={inspect,audit,freshness,stable,makeValidationTool,projectValidation,MAX_EVIDENCE_BYTES,MAX_AUDIT_BYTES,MAX_PROJECTION_BYTES};
