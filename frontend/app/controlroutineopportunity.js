/* Moe AI Station — read-only view of StarNet's existing routine-nudge decision. No second habit detector. */
'use strict';
(() => {
  if(typeof document==='undefined'||typeof window==='undefined'||window.ControlModeRoutineOpportunity)return;
  let host=null,timer=0; const POLL_MS=4000;
  function make(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=String(value);return n;}
  function panel(){return document.getElementById('control-mode-panel');}
  function isOpen(){const p=panel();return !!(p&&!p.hidden);}
  function ensureHost(){const p=panel();if(!p)return null;if(host&&host.isConnected)return host;host=make('section','cm-action-shell');host.id='cm-routine-opportunity';host.setAttribute('aria-label','Routine opportunity');const detail=p.querySelector('#cm-task-detail');if(detail)p.insertBefore(host,detail);else p.appendChild(host);return host;}
  // Classic scripts share the store's top-level const binding, not a window property.
  function candidate(){const s=typeof RoutineNudgeStore!=='undefined'?RoutineNudgeStore:window.RoutineNudgeStore;if(!s||typeof s.opportunityEvidence!=='function')return {known:false,item:null};try{return s.opportunityEvidence();}catch(_){return {known:false,item:null};}}
  function render(){const r=ensureHost();if(!r)return;r.replaceChildren();const c=candidate();const h=make('div','cm-action-head');h.append(make('div','cm-action-title','AUTOMATION · ROUTINE OPPORTUNITY'),make('div','cm-action-proof',c.known?(c.stale?'LAST KNOWN ROUTINE EVIDENCE · READ ONLY':'EXISTING ROUTINE EVIDENCE · READ ONLY'):'READ ONLY'));r.appendChild(h);
    if(!c.known){r.appendChild(make('div','cm-action-error','Routine evidence unavailable — no automation opportunity is inferred.'));return;}
    if(c.stale){r.appendChild(make('div','cm-action-warning','Routine schedule evidence is out of date — current eligibility is unknown.'));return;}
    if(!c.item){r.appendChild(make('div','cm-action-meta','No schedule-worthy repeated recipe is currently proven by StarNet’s existing routine-nudge rules.'));}
    else{r.appendChild(make('div','cm-action-warning','CANDIDATE · '+String(c.item.name||c.item.id)+' · '+String(c.item.n)+' MANUAL LAUNCHES'));r.appendChild(make('div','cm-action-meta','WHY · StarNet’s existing routine evidence says this repeated recipe is eligible for a schedule offer and is not already represented by a live routine.'));r.appendChild(make('div','cm-action-meta','NEXT · Use the existing Schedule It flow to choose and confirm cadence. No schedule is inferred here.'));}
    r.appendChild(make('div','cm-action-warning','OBSERVE ONLY · This pane reuses RoutineNudgeStore. It never creates, edits, arms, runs, or deletes a routine.'));
  }
  function refresh(){if(isOpen())render();}
  function start(){ensureHost();if(timer)clearInterval(timer);refresh();timer=setInterval(refresh,POLL_MS);}
  function stop(){if(timer){clearInterval(timer);timer=0;}}
  function watch(){const p=panel();if(!p||typeof MutationObserver!=='function')return;new MutationObserver(()=>{if(isOpen())start();else stop();}).observe(p,{attributes:true,attributeFilter:['hidden']});if(isOpen())start();}
  watch();window.ControlModeRoutineOpportunity=Object.freeze({refresh,host:()=>ensureHost()});
})();
