/* Moe AI Station — read-only managed recovery pane for Control Mode.
   Shows only the privacy-safe projection from /api/managed-task-recoveries. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeRecoveries) return;
  const ENDPOINT = '/api/managed-task-recoveries?limit=100';
  const POLL_MS = 4000;
  let host = null, timer = 0, refreshing = false, generation = 0;
  function make(tag, cls, value) { const n=document.createElement(tag); if(cls)n.className=cls; if(value!=null)n.textContent=String(value); return n; }
  function label(v, fallback) { const s=v==null?'':String(v).trim(); return s || (fallback || '—'); }
  function operatorMeaning(item) {
    if(item.safeToRestart===true) return 'WHY · The durable task record confirms execution did not happen. Moe may safely start this work again.';
    if(item.executionMayHaveStarted===true) return 'WHY · Execution may already have happened. Moe will not repeat this action until authoritative evidence resolves it.';
    return 'WHY · The durable record does not prove a safe retry. Moe keeps this task paused for review.';
  }
  function nextMove(item) {
    if(item.safeToRestart===true) return 'NEXT · Moe can resume this task through the normal capability, consent, budget, and execution gates.';
    if(item.executionMayHaveStarted===true) return 'NEXT · Moe must obtain authoritative outcome evidence before any retry is allowed.';
    if(item.recoverable===true) return 'NEXT · Moe keeps the task in recovery and waits for enough durable evidence to choose a safe path.';
    return 'NEXT · No automatic retry is authorized from the evidence currently shown.';
  }
  function panel() { return document.getElementById('control-mode-panel'); }
  function isOpen() { const p=panel(); return !!(p && !p.hidden); }
  function ensureHost() {
    const p=panel(); if(!p)return null; if(host && host.isConnected)return host;
    host=make('section','cm-action-shell'); host.id='cm-managed-recoveries'; host.setAttribute('aria-label','Managed task recovery status');
    const detail=p.querySelector('#cm-task-detail'); if(detail)p.insertBefore(host,detail); else p.appendChild(host); return host;
  }
  async function get() { if(!window.Harness || !Harness.api || typeof Harness.api.get!=='function')throw new Error('sidecar API unavailable'); return Harness.api.get(ENDPOINT); }
  function header(root, verified) { const h=make('div','cm-action-head'); h.append(make('div','cm-action-title','RECOVERY STATUS'),make('div','cm-action-proof',verified?'TASK HISTORY · READ ONLY':'READ ONLY')); root.appendChild(h); }
  function renderUnavailable() { const r=ensureHost(); if(!r)return; r.replaceChildren(); header(r,false); r.appendChild(make('div','cm-action-error','Recovery status unavailable — no task outcome or retry safety is inferred.')); }
  function render(body) {
    const r=ensureHost(); if(!r)return; r.replaceChildren();
    const view=body && body.ok && body.recoveries && body.recoveries.schemaVersion==='moe.control-recoveries.v1' ? body.recoveries : null;
    header(r,!!view); if(!view){ renderUnavailable(); return; }
    const rows=Array.isArray(view.rows)?view.rows:[];
    const safe=rows.filter(item=>item.safeToRestart===true).length;
    const blocked=rows.filter(item=>item.safeToRestart!==true && item.executionMayHaveStarted===true).length;
    const review=rows.length-safe-blocked;
    const summary=make('div','cm-action-warning','RECOVERY QUEUE · '+rows.length+' TOTAL · '+safe+' SAFE TO RESTART · '+blocked+' DO NOT RETRY · '+review+' REVIEW');
    summary.setAttribute('aria-label','Recovery queue summary'); r.appendChild(summary);
    if(!rows.length) r.appendChild(make('div','cm-action-empty','No managed tasks currently require recovery.'));
    else { const list=make('div','cm-action-list'); rows.forEach(item=>{ const row=make('div','cm-action-row'); row.append(
      make('div','cm-action-primary',label(item.taskId,'unknown task')),
      make('div','',label(item.disposition,'unknown disposition')),
      make('div','',label(item.stage,'unknown stage')),
      make('div','',item.safeToRestart===true?'SAFE TO RESTART':(item.executionMayHaveStarted===true?'DO NOT RETRY':'REVIEW'))
    ); row.appendChild(make('div','cm-action-meta','STATE '+label(item.state)+' · '+label(item.reason))); row.appendChild(make('div','cm-action-meta','RECONCILIATION '+label(item.reconciliationOutcome)+' · DECISION '+label(item.reconciliationDecision))); row.appendChild(make('div','cm-action-meta',operatorMeaning(item))); row.appendChild(make('div','cm-action-meta',nextMove(item))); list.appendChild(row); }); r.appendChild(list); }
    const e=view.evidence||{}; r.appendChild(make('div','cm-action-warning','OBSERVE ONLY · Provider references and task content are intentionally hidden. This pane never retries or resolves work.'));
    r.appendChild(make('div','cm-action-meta','Source: '+label(e.source)+' · Returned recoveries '+label(e.returnedRows)+(e.bounded?' · BOUNDED':'')));
  }
  async function refresh(){ if(refreshing||!isOpen())return; refreshing=true; const token=++generation; try{const b=await get(); if(token===generation&&isOpen())render(b);}catch(_){if(token===generation&&isOpen())renderUnavailable();}finally{refreshing=false;} }
  function start(){ensureHost(); if(timer)clearInterval(timer); refresh(); timer=setInterval(()=>{if(isOpen())refresh();},POLL_MS);}
  function stop(){generation++; if(timer){clearInterval(timer);timer=0;}}
  function watch(){const p=panel(); if(!p||typeof MutationObserver!=='function')return; new MutationObserver(()=>{if(isOpen())start();else stop();}).observe(p,{attributes:true,attributeFilter:['hidden']}); if(isOpen())start();}
  watch(); window.ControlModeRecoveries=Object.freeze({refresh,endpoint:ENDPOINT,host:()=>ensureHost()});
})();
