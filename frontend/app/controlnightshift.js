/* Moe AI Station — read-only projection of StarNet's existing Night Shift runtime. No second autonomy state. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined' || window.ControlModeNightshift) return;
  const ENDPOINT='/api/nightshift/status', POLL_MS=4000; let host=null,timer=0,refreshing=false,generation=0;
  function make(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=String(value);return n;}
  function label(v,fallback){const s=v==null?'':String(v).trim();return s||(fallback||'—');}
  function panel(){return document.getElementById('control-mode-panel');} function isOpen(){const p=panel();return !!(p&&!p.hidden);}
  function ensureHost(){const p=panel();if(!p)return null;if(host&&host.isConnected)return host;host=make('section','cm-action-shell');host.id='cm-nightshift-status';host.setAttribute('aria-label','Night Shift autonomy status');const detail=p.querySelector('#cm-task-detail');if(detail)p.insertBefore(host,detail);else p.appendChild(host);return host;}
  async function get(){if(!window.Harness||!Harness.api||typeof Harness.api.get!=='function')throw new Error('sidecar API unavailable');return Harness.api.get(ENDPOINT);}
  function header(root,known){const h=make('div','cm-action-head');h.append(make('div','cm-action-title','AUTONOMY · NIGHT SHIFT'),make('div','cm-action-proof',known?'EXISTING NIGHT SHIFT STATE · READ ONLY':'READ ONLY'));root.appendChild(h);}
  function renderUnavailable(){const r=ensureHost();if(!r)return;r.replaceChildren();header(r,false);r.appendChild(make('div','cm-action-error','Night Shift status unavailable — autonomy state is not inferred.'));}
  function render(body){const r=ensureHost();if(!r)return;r.replaceChildren();const v=body&&typeof body==='object'?body:null;header(r,!!v);if(!v){renderUnavailable();return;}
    const model=window.NightReport&&typeof window.NightReport.panelModel==='function'?window.NightReport.panelModel({status:v,tzOffsetMin:-new Date().getTimezoneOffset()}):null;
    const state=v.inFlight?'RUNNING':(model&&model.stateText?model.stateText:(v.halted?'HALTED':(v.active?'ARMED':'OFF'))); const used=Number.isFinite(Number(v.beatsUsedToday))?Number(v.beatsUsedToday):null; const limit=Number.isFinite(Number(v.leashPerDay))?Number(v.leashPerDay):null;
    r.appendChild(make('div','cm-action-warning','STATE · '+state+' · MODE '+label(v.buildMode,'UNKNOWN')+' · TODAY '+(used==null?'—':used)+' / '+(limit==null?'—':limit)+' · '+(v.away?'OPERATOR AWAY':'OPERATOR PRESENT')));
    const gateMeaning=window.NightReport&&typeof window.NightReport.bindingPhrase==='function'?window.NightReport.bindingPhrase(v.binding):label(v.binding,'unknown');
    const list=make('div','cm-action-list'); const rows=[['SCHEDULER',v.active?'ARMED':'OFF'],['E-STOP',v.halted?'ENGAGED':'CLEAR'],['CURRENT GATE',gateMeaning],['BEAT IN FLIGHT',v.inFlight?'YES':'NO'],['WORKSHOP GRANT',v.workshopGranted===true?'YES':(v.workshopGranted===false?'NO':'UNKNOWN')]];
    rows.forEach(x=>{const row=make('div','cm-action-row');row.append(make('div','cm-action-primary',x[0]),make('div','',x[1]));list.appendChild(row);});r.appendChild(list);
    if(v.focus)r.appendChild(make('div','cm-action-meta','FOCUS · '+label(v.focus.label||v.focus.ref)+' · '+label(v.focus.kind,'unknown')+(v.focus.steered?' · OPERATOR STEERED':''));
    if(model&&model.why)r.appendChild(make('div','cm-action-meta','WHY · '+model.why));
    if(model&&model.modeText)r.appendChild(make('div','cm-action-meta','MODE · '+model.modeText));
    if(model&&model.readinessText)r.appendChild(make('div','cm-action-meta','READINESS · '+model.readinessText));
    if(model){r.appendChild(make('div','cm-action-meta','PRESENCE · '+label(model.presence)));r.appendChild(make('div','cm-action-meta','LAST BEAT · '+label(model.lastBeatText)+' · NEXT · '+label(model.nextEligibleText)));}
    r.appendChild(make('div','cm-action-warning','OBSERVE ONLY · This pane reads the existing Night Shift status endpoint. It cannot arm, halt, steer, fire a beat, widen reach, grant tools, or change budgets.'));
  }
  async function refresh(){if(refreshing||!isOpen())return;refreshing=true;const token=++generation;try{const b=await get();if(token===generation&&isOpen())render(b);}catch(_){if(token===generation&&isOpen())renderUnavailable();}finally{refreshing=false;}}
  function start(){ensureHost();if(timer)clearInterval(timer);refresh();timer=setInterval(()=>{if(isOpen())refresh();},POLL_MS);} function stop(){generation++;if(timer){clearInterval(timer);timer=0;}}
  function watch(){const p=panel();if(!p||typeof MutationObserver!=='function')return;new MutationObserver(()=>{if(isOpen())start();else stop();}).observe(p,{attributes:true,attributeFilter:['hidden']});if(isOpen())start();}
  function loadRoutinePane(){if(window.ControlModeRoutineOpportunity)return;if(typeof document.createElement!=='function'||!document.head||typeof document.head.appendChild!=='function')return;if(document.getElementById('mo-control-mode-routine-opportunity'))return;const script=document.createElement('script');script.id='mo-control-mode-routine-opportunity';script.src='app/controlroutineopportunity.js';script.async=false;document.head.appendChild(script);}
  watch();loadRoutinePane();window.ControlModeNightshift=Object.freeze({refresh,endpoint:ENDPOINT,host:()=>ensureHost()});
})();