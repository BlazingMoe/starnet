/* Moe AI Station — read-only projection of StarNet's existing Night Shift runtime. No second autonomy state. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined' || window.ControlModeNightshift) return;
  const ENDPOINT='/api/nightshift/status', LEDGER='/api/autonomy/ledger?source=nightshift&limit=500';
  const DRAFTS='/api/nightshift/drafts?since=', POLL_MS=4000, DIGEST_POLL_MS=30000, WINDOW_MS=24*60*60*1000;
  let host=null,statusHost=null,digestHost=null,timer=0,digestTimer=0,statusRefreshing=false,digestRefreshing=false,generation=0;
  function make(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=String(value);return n;}
  function label(v,fallback){const s=v==null?'':String(v).trim();return s||(fallback||'—');}
  function nonnegative(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0;}
  function validStatus(v){return !!(v&&typeof v==='object'&&!Array.isArray(v)&&['active','away','halted','inFlight'].every(k=>typeof v[k]==='boolean')&&nonnegative(v.beatsUsedToday));}
  function panel(){return document.getElementById('control-mode-panel');} function isOpen(){const p=panel();return !!(p&&!p.hidden);}
  function ensureHost(){const p=panel();if(!p)return null;if(host&&host.isConnected)return host;host=make('section','cm-action-shell');host.id='cm-nightshift-status';host.setAttribute('aria-label','Night Shift autonomy status');statusHost=make('div','');statusHost.id='cm-nightshift-live-state';digestHost=make('div','cm-action-digest');digestHost.id='cm-nightshift-digest';host.append(statusHost,digestHost);const detail=p.querySelector('#cm-task-detail');if(detail)p.insertBefore(host,detail);else p.appendChild(host);return host;}
  async function get(endpoint){if(!window.Harness||!Harness.api||typeof Harness.api.get!=='function')throw new Error('sidecar API unavailable');return Harness.api.get(endpoint);}
  function header(root,known){const h=make('div','cm-action-head');h.append(make('div','cm-action-title','AUTONOMY · NIGHT SHIFT'),make('div','cm-action-proof',known?'EXISTING NIGHT SHIFT STATE · READ ONLY':'READ ONLY'));root.appendChild(h);}
  function renderUnavailable(){ensureHost();if(!statusHost)return;statusHost.replaceChildren();header(statusHost,false);statusHost.appendChild(make('div','cm-action-error','Night Shift status unavailable — autonomy state is not inferred.'));}
  function renderLoading(){ensureHost();if(!statusHost||!digestHost)return;statusHost.replaceChildren();digestHost.replaceChildren();header(statusHost,false);statusHost.appendChild(make('div','cm-action-meta','Loading current Night Shift evidence — autonomy and E-STOP state are not yet known.'));digestHost.appendChild(make('div','cm-action-title','RECENT OPERATOR DIGEST · LAST 24 HOURS'));digestHost.appendChild(make('div','cm-action-meta','Loading recent decision and draft evidence…'));}
  function renderStatus(body){
    ensureHost();if(!statusHost)return;
    const v=validStatus(body)?body:null;
    if(!v){renderUnavailable();return;}
    statusHost.replaceChildren();header(statusHost,true);
    const model=window.NightReport&&typeof window.NightReport.panelModel==='function'?window.NightReport.panelModel({status:v,tzOffsetMin:-new Date().getTimezoneOffset()}):null;
    const state=v.halted?(model&&model.stateText?model.stateText:'HALTED'):(v.inFlight?'RUNNING':(model&&model.stateText?model.stateText:(v.active?'ARMED':'OFF'))); const used=v.beatsUsedToday; const limit=nonnegative(v.leashPerDay)?v.leashPerDay:null;
    statusHost.appendChild(make('div','cm-action-warning','STATE · '+state+' · MODE '+label(v.buildMode,'UNKNOWN')+' · TODAY '+(used==null?'—':used)+' / '+(limit==null?'—':limit)+' · '+(v.away?'OPERATOR AWAY':'OPERATOR PRESENT')));
    const gateKnown=v.binding===null||typeof v.binding==='string';
    const gateMeaning=gateKnown?(window.NightReport&&typeof window.NightReport.bindingPhrase==='function'?window.NightReport.bindingPhrase(v.binding):label(v.binding,'unknown')):'unknown';
    const list=make('div','cm-action-list'); const rows=[['SCHEDULER',v.active?'ARMED':'OFF'],['E-STOP',v.halted?'ENGAGED':'CLEAR'],['CURRENT GATE',gateMeaning],['BEAT IN FLIGHT',v.inFlight?'YES':'NO'],['WORKSHOP GRANT',v.workshopGranted===true?'YES':(v.workshopGranted===false?'NO':'UNKNOWN')]];
    rows.forEach(x=>{const row=make('div','cm-action-row');row.append(make('div','cm-action-primary',x[0]),make('div','',x[1]));list.appendChild(row);});statusHost.appendChild(list);
    if(v.focus)statusHost.appendChild(make('div','cm-action-meta','FOCUS · '+label(v.focus.label||v.focus.ref)+' · '+label(v.focus.kind,'unknown')+(v.focus.steered?' · OPERATOR STEERED':'')));
    if(model&&model.why&&(gateKnown||v.halted))statusHost.appendChild(make('div','cm-action-meta','WHY · '+model.why));
    if(model&&model.modeText)statusHost.appendChild(make('div','cm-action-meta','MODE · '+model.modeText));
    if(model&&model.readinessText)statusHost.appendChild(make('div','cm-action-meta','READINESS · '+model.readinessText));
    if(model){statusHost.appendChild(make('div','cm-action-meta','PRESENCE · '+label(model.presence)));statusHost.appendChild(make('div','cm-action-meta','LAST BEAT · '+(nonnegative(v.lastBeatAt)?label(model.lastBeatText):'UNKNOWN')+' · NEXT · '+(v.halted||nonnegative(v.nextEligibleAt)?label(model.nextEligibleText):'UNKNOWN')));}
    statusHost.appendChild(make('div','cm-action-warning','OBSERVE ONLY · This pane reads existing Night Shift telemetry. It cannot arm, halt, steer, fire a beat, widen reach, grant tools, or change budgets.'));
  }
  function renderDigest(status,ledgerResponse,draftsResponse,since,now){
    ensureHost();if(!digestHost)return;
    // Never retain old outcome claims across a refresh.
    digestHost.replaceChildren();digestHost.appendChild(make('div','cm-action-title','RECENT OPERATOR DIGEST · LAST 24 HOURS'));
    digestHost.appendChild(make('div','cm-action-meta','Composed from the existing NightReport logic. Draft bodies stay hidden here.'));
    const ledgerKnown=!!(ledgerResponse&&Array.isArray(ledgerResponse.entries));
    const draftsKnown=!!(draftsResponse&&Array.isArray(draftsResponse.drafts));
    if(!ledgerKnown&&!draftsKnown){digestHost.appendChild(make('div','cm-action-error','Recent outcomes unavailable — decision history and draft records could not be read; this is not evidence of an empty night.'));return;}
    const inWindow=value=>typeof value==='number'&&Number.isFinite(value)&&value>=since&&value<=now;
    const ledger=ledgerKnown?ledgerResponse.entries.filter(e=>e&&inWindow(e.ts)):[];
    const drafts=draftsKnown?draftsResponse.drafts.filter(d=>d&&inWindow(d.at)).map(d=>({title:d.title,at:d.at,archetype:d.archetype})):[];
    let report=null;
    try{if(window.NightReport&&typeof window.NightReport.compose==='function')report=window.NightReport.compose({status:validStatus(status)?status:null,ledger,drafts,awaySince:since,nowMs:now,tzOffsetMin:-new Date().getTimezoneOffset()});}catch(_){report=null;}
    if(!report){digestHost.appendChild(make('div','cm-action-error','Recent digest could not be composed — no outcome is inferred.'));return;}
    if(report.hasReport){
      if(report.priorityLine)digestHost.appendChild(make('div','cm-action-meta',report.priorityLine));
      const headline=!draftsKnown&&report.actCount===0?report.declineCount+' beat'+(report.declineCount===1?'':'s')+' skipped — draft records unavailable':report.headline;
      digestHost.appendChild(make('div','cm-action-warning','RECENT OUTCOMES · '+headline));
      for(const line of report.actLines||[])digestHost.appendChild(make('div','cm-action-meta',line));
      for(const line of report.declineLines||[])digestHost.appendChild(make('div','cm-action-meta',line));
      if(report.idleReason&&(draftsKnown||report.actCount>0))digestHost.appendChild(make('div','cm-action-meta',report.idleReason));
    }else if(ledgerKnown&&draftsKnown){
      digestHost.appendChild(make('div','cm-action-meta','No Night Shift acts or declined beats were recorded in the last 24 hours.'));
    }else{
      digestHost.appendChild(make('div','cm-action-error','No outcomes can be confirmed because part of the decision history is unavailable.'));
    }
    if(!ledgerKnown)digestHost.appendChild(make('div','cm-action-error','Decision ledger unavailable — reported acts/declines may be incomplete.'));
    if(!draftsKnown)digestHost.appendChild(make('div','cm-action-error','Draft records unavailable — draft titles and counts may be incomplete.'));
    if(ledgerKnown&&ledgerResponse.entries.length>=500)digestHost.appendChild(make('div','cm-action-warning','Decision history reached its 500-row read cap; older decisions in the 24-hour window may be omitted.'));
    if(draftsKnown&&draftsResponse.drafts.length>=20)digestHost.appendChild(make('div','cm-action-warning','Draft history reached its 20-item read cap; older drafts in the 24-hour window may be omitted.'));
    digestHost.appendChild(make('div','cm-action-meta','VIEW REFRESHED · '+(new Date(now)).toLocaleString()));
    digestHost.appendChild(make('div','cm-action-meta','WINDOW · '+(new Date(since)).toLocaleString()+' — '+(new Date(now)).toLocaleString()));
  }
  function renderDigestLoading(){ensureHost();if(!digestHost)return;digestHost.replaceChildren();digestHost.appendChild(make('div','cm-action-title','RECENT OPERATOR DIGEST · LAST 24 HOURS'));digestHost.appendChild(make('div','cm-action-meta','Refreshing decision and draft evidence — prior outcomes are hidden until this read completes.'));}
  async function refreshStatus(){if(statusRefreshing||!isOpen())return;statusRefreshing=true;const token=generation;try{const b=await get(ENDPOINT);if(token===generation&&isOpen())renderStatus(b);}catch(_){if(token===generation&&isOpen())renderUnavailable();}finally{statusRefreshing=false;}}
  async function refreshDigest(){if(digestRefreshing||!isOpen())return;digestRefreshing=true;const token=generation,now=Date.now(),since=now-WINDOW_MS;renderDigestLoading();try{
      const results=await Promise.all([get(ENDPOINT).catch(()=>null),get(LEDGER).catch(()=>null),get(DRAFTS+encodeURIComponent(since)+'&limit=20').catch(()=>null)]);
      if(token===generation&&isOpen())renderDigest(results[0],results[1],results[2],since,now);
    }catch(_){if(token===generation&&isOpen())renderDigest(null,null,null,since,now);}finally{digestRefreshing=false;}}
  async function refresh(){await Promise.all([refreshStatus(),refreshDigest()]);}
  function start(){generation++;renderLoading();if(timer)clearInterval(timer);if(digestTimer)clearInterval(digestTimer);refreshStatus();refreshDigest();timer=setInterval(()=>{if(isOpen())refreshStatus();},POLL_MS);digestTimer=setInterval(()=>{if(isOpen())refreshDigest();},DIGEST_POLL_MS);}
  function stop(){generation++;if(timer){clearInterval(timer);timer=0;}if(digestTimer){clearInterval(digestTimer);digestTimer=0;}}
  function watch(){const p=panel();if(!p||typeof MutationObserver!=='function')return;new MutationObserver(()=>{if(isOpen())start();else stop();}).observe(p,{attributes:true,attributeFilter:['hidden']});if(isOpen())start();}
  function loadRoutinePane(){if(window.ControlModeRoutineOpportunity)return;if(typeof document.createElement!=='function'||!document.head||typeof document.head.appendChild!=='function')return;if(document.getElementById('mo-control-mode-routine-opportunity'))return;const script=document.createElement('script');script.id='mo-control-mode-routine-opportunity';script.src='app/controlroutineopportunity.js';script.async=false;document.head.appendChild(script);}
  watch();loadRoutinePane();window.ControlModeNightshift=Object.freeze({refresh,endpoint:ENDPOINT,ledgerEndpoint:LEDGER,draftsEndpoint:DRAFTS,host:()=>ensureHost()});
})();
