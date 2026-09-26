/* sidecar/control/approval-view.js — pure, read-only Control Mode approval projection.
   Standing grants come from permgrants.snapshot(); session grants come from permissions.snapshot();
   live pending prompts come from the SAME consentwait Map(s) used by the response/ack path. Pending
   state only owns prompt IDs, so this projection deliberately does not invent agent/tool/action metadata. */
'use strict';

function text(v,max){const s=v==null?'':String(v).trim();return s?s.slice(0,max||160):'';}
function finiteOrNull(v){return typeof v==='number'&&Number.isFinite(v)?v:null;}
function list(v){return Array.isArray(v)?v:[];}

function collectPendingIds(pending){
  const ids=[];
  function add(id){const clean=text(id,160);if(clean)ids.push(clean);}
  if(pending instanceof Map){
    let nested=false;
    for(const value of pending.values()){
      if(value instanceof Map){nested=true;for(const id of value.keys())add(id);}
    }
    if(!nested){for(const id of pending.keys())add(id);}
  }else if(Array.isArray(pending)){
    for(const id of pending)add(id);
  }
  return Array.from(new Set(ids)).sort();
}

function projectApprovalCenter(grantSnapshot, consentSnapshot, pending){
  const standing=grantSnapshot&&typeof grantSnapshot==='object'?grantSnapshot:{};
  const consent=consentSnapshot&&typeof consentSnapshot==='object'?consentSnapshot:{};
  const grantable=new Set(list(standing.grantable).map(v=>text(v,120)).filter(Boolean));
  const meta=standing.meta&&typeof standing.meta==='object'?standing.meta:{};
  const grants=list(standing.grants).map(v=>text(v,120)).filter(Boolean).sort();
  const permanent=grants.map(key=>({
    key,
    grantable:grantable.has(key),
    grantedAt:finiteOrNull(meta[key]&&meta[key].grantedAt)
  }));

  const sessions=[];
  const sessionObj=consent.session&&typeof consent.session==='object'?consent.session:{};
  for(const sessionId of Object.keys(sessionObj).sort()){
    const keys=list(sessionObj[sessionId]).map(v=>text(v,120)).filter(Boolean).sort();
    if(keys.length) sessions.push({sessionId:text(sessionId,120),grants:keys});
  }

  const pendingIds=collectPendingIds(pending);

  return {
    schemaVersion:'moe.control-approvals.v1',
    mode:'read-only',
    permanent,
    sessions,
    pending:pendingIds.map(promptId=>({promptId})),
    evidence:{
      standingGrantSource:'permgrants.snapshot',
      sessionGrantSource:'permissions.snapshot',
      pendingSource:'consentwait.pending',
      pendingDetailsAvailable:false,
      mutationsExposed:false
    }
  };
}

module.exports={projectApprovalCenter,collectPendingIds};
