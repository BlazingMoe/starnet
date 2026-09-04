/* MY WORK joins the existing authorities. Opening it never starts work or grants access. */
'use strict';
(() => {
  if (typeof StationUI === 'undefined' || typeof WorkView === 'undefined' || typeof QuerySpine === 'undefined') return;
  const esc = StationUI.h.esc;
  const KEYS = ['work-deliverables', 'work-discovery', 'work-sources', 'cron', 'journey'];
  QuerySpine.define('work-deliverables', {path:'/api/deliverables',ttlMs:15000,pollMs:15000,validate:j=>!!(j && j.ok && Array.isArray(j.items))});
  QuerySpine.define('work-discovery', {path:'/api/discovery',ttlMs:15000,pollMs:30000,validate:j=>!!(j && j.ok && Array.isArray(j.staged))});
  QuerySpine.define('work-sources', {path:'/api/discovery/sources',ttlMs:15000,pollMs:30000,validate:j=>!!(j && j.ok && Array.isArray(j.sources))});
  let pane = 'overview', startOpts = {}, body = null, stops = [], timer = null, firstForm = null, preview = {}, signature = '';
  let current = null, artifactRows = [], selectedFinding = null;
  const data = key => { const s=QuerySpine.state(key); return s.hasData ? s.data : null; };
  const date = at => { const d=new Date(at); return isNaN(d.getTime()) ? 'Not recorded' : d.toLocaleString(); };
  const say = (message, bad) => { const el=body && body.querySelector('.wh-message'); if(el) {el.textContent=message;el.classList.toggle('warn',!!bad);} };
  async function post(path, payload) {
    const r=await Harness.apiFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok || j.ok===false) throw new Error(j.error || j.reason || 'The station could not save that change.'); return j;
  }
  function snapshot() {
    const streams=typeof Workstreams !== 'undefined' ? Workstreams.list() : [];
    const channels={};
    streams.forEach(s=>{ if(typeof Channels !== 'undefined') channels[s.id]={busy:Channels.isBusy(s.id),runId:Channels.runIdOf(s.id),pending:Channels.pendingOf(s.id)}; });
    const dl=data('work-deliverables'), discovery=data('work-discovery');
    return WorkView.project({streams,channels,deliverables:dl && dl.items,discovery:discovery && discovery.staged});
  }
  function cleanup() {
    if(body) body.removeEventListener('click',click);
    stops.forEach(stop=>stop());stops=[];
    if(timer) clearInterval(timer);timer=null;
    if(firstForm && firstForm.destroy) firstForm.destroy();firstForm=null;
    if(preview.blobUrl) URL.revokeObjectURL(preview.blobUrl);preview={};
    body=null;selectedFinding=null;
  }
  function open(next, opts) {
    pane=next || 'overview';startOpts=opts || {};selectedFinding=startOpts.findingId || null;
    StationUI.openTerm('work');
    if(body) mountPane();
  }
  function fileHtml(a) {
    const index=artifactRows.push(a)-1;
    return '<div class="wh-files" data-i="'+index+'">'+(a.files || []).map((f,i)=>f.openUrl
      ? '<a class="bb sm" data-file="'+i+'" href="'+esc(Deliverables.fileHref(f))+'" target="_blank" rel="noopener">OPEN '+esc(f.path)+'</a>'
      : '<span class="muted">'+esc(f.path)+' · unavailable</span>').join('')+'<div data-preview></div></div>';
  }
  function card(item) {
    const s=item.stream;
    const messages=s && typeof Workstreams.visibleMessages==='function' ? Workstreams.visibleMessages(s) : [];
    const objective=messages.find(m=>m.role==='user' && typeof m.content==='string');
    const answer=messages.slice().reverse().find(m=>m.role==='assistant' && typeof m.content==='string');
    return '<article class="wh-card" data-work="'+esc(item.id)+'"><div class="wh-card-top"><b>'+esc(item.title)+'</b><span class="wh-status">'+esc(item.status)+'</span></div>'+
      '<div class="muted">'+esc(App.agentName(item.agentId) || item.agentId || 'Agent')+(item.projectRoot ? ' · '+esc(item.projectRoot) : '')+'</div>'+
      item.artifacts.map(fileHtml).join('')+
      '<details class="wh-detail" data-detail="'+esc(item.id)+'"><summary>Objective, result & controls</summary>'+
      (objective ? '<h4>WHAT YOU ASKED FOR</h4><p class="wh-prose">'+esc(objective.content.startsWith('Task: ')?objective.content.split('\n')[0].slice(6):objective.content.slice(0,3500))+'</p>' : '')+
      (answer ? '<h4>LATEST RESPONSE</h4><p class="wh-prose">'+esc(answer.content.slice(0,5000))+'</p>' : '<p class="muted">No response has been recorded yet.</p>')+
      '<div class="wh-actions">'+(item.streamId ? '<button class="bb sm" data-session="'+esc(item.streamId)+'">OPEN CONVERSATION</button><button class="bb sm" data-correct="'+esc(item.streamId)+'">CORRECT THIS</button>' : '')+
      (objective ? '<button class="bb sm" data-repeat="'+esc(item.id)+'">MAKE RECURRING</button>' : '')+
      '<button class="bb sm" data-term-link="deliverables">ALL OUTPUT DETAILS</button></div></details></article>';
  }
  function group(title, items, empty) {
    return '<section class="wh-group"><h3>'+title+' <span class="muted">'+items.length+'</span></h3>'+ (items.length ? items.slice(0,50).map(card).join('') : '<p class="muted">'+empty+'</p>')+(items.length>50 ? '<p class="muted">Showing 50. Narrow the search to find older work.</p>' : '')+'</section>';
  }
  function discoveryHtml(findings) {
    return '<section class="wh-group"><h3>SUGGESTED FOR YOU</h3>'+(findings.length ? findings.map(f=>'<article class="wh-card"><b>'+esc(f.title)+'</b><p>'+esc(f.quote)+'</p><div class="muted">'+esc(f.displayPath || f.root)+'</div>'+ 
      '<details><summary>Why this was suggested</summary>'+(f.evidence || []).map(e=>'<p>'+esc(e.path)+':'+esc(e.line)+' — '+esc(e.quote)+'</p>').join('')+'</details>'+
      '<div class="wh-actions"><button class="bb sm" data-finding="'+esc(f.id)+'">REVIEW & START</button><button class="bb sm" data-dismiss="'+esc(f.id)+'">NOT USEFUL</button></div></article>').join('')
      : '<p class="muted">No current evidence-backed suggestions. Choose a folder to inspect, or start with a sample of work you want help with.</p><button class="bb sm" data-pane="sources">CHOOSE A SOURCE</button>')+'</section>';
  }
  function warnings() {
    const names={'work-deliverables':'Saved outputs','work-discovery':'Suggestions','work-sources':'Discovery sources',cron:'Recurring work',journey:'Station progress'};
    return KEYS.filter(k=>QuerySpine.state(k).error).map(k=>names[k]+': live read unavailable; '+(QuerySpine.state(k).hasData?'showing the last confirmed snapshot.':'no state is being inferred.')).join(' ');
  }
  function refreshView(force) {
    if(!body || pane==='start' || pane==='sources') return;
    const next=snapshot(), q=body.querySelector('.wh-search'), search=(q && q.value || '').toLowerCase();
    const journey=data('journey'), cron=data('cron');
    const sig=JSON.stringify([next,journey,cron,search,warnings(),pane]);
    if(!force && sig===signature) return; signature=sig;current=next;
    const content=body.querySelector('.wh-content');if(!content)return;
    const expanded=Array.from(content.querySelectorAll('details[open][data-detail]')).map(el=>el.dataset.detail);
    if(preview.blobUrl) URL.revokeObjectURL(preview.blobUrl);preview={}; artifactRows=[];
    if(pane==='station') content.innerHTML=stationHtml(journey && journey.journey,cron);
    else {
      const match=items=>items.filter(i=>(i.title+' '+i.status+' '+(i.projectRoot||'')).toLowerCase().includes(search));
      content.innerHTML=discoveryHtml(next.suggestions.filter(f=>(f.title+' '+f.quote).toLowerCase().includes(search)))+
        '<div class="wh-columns">'+group('DOING & PLANNED',match(next.doing.concat(next.planned)),'Nothing is queued or running.')+
        group('NEEDS YOU',match(next.needsYou),'No decisions or interrupted work need your attention.')+
        group('FINISHED',match(next.finished),'Your first completed result will appear here.')+'</div>';
    }
    content.querySelectorAll('details[data-detail]').forEach(el=>{el.open=expanded.includes(el.dataset.detail);});
    const warning=body.querySelector('.wh-freshness');warning.textContent=warnings();warning.hidden=!warning.textContent;
  }
  function stationHtml(journey, cron) {
    const v=WorkView.stationView(journey);
    return '<section class="wh-station"><span class="wh-eyebrow">YOUR WORK LEAVES A MARK</span><h2>'+esc(v.name)+'</h2><p>'+esc(v.reason)+'</p>'+
      '<p class="muted">Your station changes through recorded goal outcomes. Tools and customization are available from the start.</p></section>'+
      '<section class="wh-group"><h3>WORK THAT COMES BACK TO YOU</h3>'+(cron && cron.jobs.length ? cron.jobs.map(job=>{
        const r=WorkView.routineView(job,cron);return '<article class="wh-card"><b>'+esc(r.title)+'</b><p>'+esc(r.status)+' · '+esc(r.last)+'</p>'+(r.next?'<p>Next: '+esc(date(r.next))+'</p>':'')+
          (job.lastOutput?'<details><summary>Latest recorded result</summary><p class="wh-prose">'+esc(String(job.lastOutput).slice(0,5000))+'</p></details>':'')+'<button class="bb sm" data-term-link="automation">VIEW RESULTS & SCHEDULE</button></article>';
      }).join(''):'<p class="muted">No recurring work recorded. Use MAKE RECURRING on a useful result to prepare its schedule.</p>')+'</section>'+
      '<section class="wh-group"><h3>WHAT CHANGED YOUR STATION</h3>'+(v.outcomes.length?v.outcomes.map(o=>'<article class="wh-card"><b>'+esc(o.title)+'</b><p>'+esc(o.evidence)+'</p><div class="muted">'+esc(o.verifiedBy==='harness-contract'?'Verified by harness':o.verifiedBy==='commander-confirmed'?'Confirmed by you':'Recorded by you')+' · '+esc(date(o.at))+'</div><button class="bb sm" data-term-link="quests">VIEW GOAL & EVIDENCE</button></article>').join(''):'<p class="muted">No verified outcomes recorded yet. Running tools or spending tokens does not advance this record.</p>')+'</section>'+
      '<section class="wh-group"><h3>WHAT THE STATION LEARNED TO DO DIFFERENTLY</h3>'+(v.receipts.length?v.receipts.map(r=>'<p>'+esc(r.text)+'</p>').join(''):'<p class="muted">No adaptation receipts yet.</p>')+'<button class="bb sm" data-term-link="commander">REVIEW WHAT IT KNOWS ABOUT YOU</button></section>';
  }
  async function mountSources() {
    const host=body && body.querySelector('.wh-content');if(!host)return;
    host.innerHTML='<p>Reading your approved folders…</p>';
    try { await QuerySpine.refresh('work-sources'); } catch (_) {}
    if(!body || pane!=='sources' || !host.isConnected)return;
    const j=data('work-sources'), state=QuerySpine.state('work-sources');
    if(!j || state.error) {host.innerHTML='<p class="warn">Discovery sources could not be read. Try refresh; no changes were made.</p>';return;}
    const roots=(j.approvedRoots || []).map(r=>typeof r==='string'?r:(r.root || r.path || '')).filter(Boolean);
    const source=j.sources.find(s=>s.kind==='client-update');
    host.innerHTML='<section class="wh-group"><h3>FIND WORK IN YOUR DOCUMENTS</h3><p>Choose a folder you already approved. StarNet looks for recent text notes that could become a client update. It shows its evidence before you choose to run anything.</p>'+
      '<p class="muted">This source inspects bounded local text files. It does not send them to a model, run a task, or grant new access. You can pause or remove this source here.</p>'+
      (roots.length?'<label class="wh-field">APPROVED FOLDER<select class="key-input wh-root">'+roots.map(r=>'<option value="'+esc(r)+'"'+(source && source.root===r?' selected':'')+'>'+esc(r)+'</option>').join('')+'</select></label><button class="bb" data-source-save>USE THIS FOLDER</button>':'<p>No approved folders yet. Add a project folder explicitly, or start with a pasted sample.</p>')+
      '<div class="wh-actions"><button class="bb sm" data-projects>MANAGE PROJECT FOLDERS</button><button class="bb sm" data-pane="start">USE A SAMPLE INSTEAD</button></div>'+
      (source?'<article class="wh-card"><b>'+esc(source.root)+'</b><p>'+(source.enabled?'Discovery enabled':'Discovery paused')+' · '+esc(source.status || 'Not scanned')+'</p><p class="muted">'+(source.available===false?'Folder unavailable or access revoked. ': '')+'Last scan: '+(source.lastScanAt?esc(date(source.lastScanAt)):'Not recorded')+'</p><div class="wh-actions"><button class="bb sm" data-source-toggle="'+(source.enabled?'pause':'resume')+'">'+(source.enabled?'PAUSE DISCOVERY':'RESUME DISCOVERY')+'</button><button class="bb sm" data-source-remove>REMOVE SOURCE</button><button class="bb sm" data-scan>SCAN NOW</button></div></article>':'')+'</section>';
  }
  function mountPane() {
    if(!body)return;
    if(firstForm && firstForm.destroy) firstForm.destroy();firstForm=null;signature='';
    body.querySelectorAll('[data-pane]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pane===pane)));
    body.querySelector('.wh-search').hidden=pane!=='overview';
    const content=body.querySelector('.wh-content');
    if(pane==='sources') {mountSources();return;}
    if(pane==='start') {
      if(typeof FirstValue==='undefined') {content.textContent='The first-work guide is unavailable. Your agent is available in COMMS.';return;}
      firstForm=FirstValue.mount(content,Object.assign({},startOpts,{onLaunch:async(recipe,values,source)=>{
        if (selectedFinding) {
          await post('/api/discovery/decide',{id:selectedFinding,decision:'validate'});
        }
        const launched=App.launchRecipe(recipe,values,source);
        if(launched && selectedFinding) {
          const id=selectedFinding; selectedFinding=null;
          post('/api/discovery/decide',{id,decision:'accept'}).then(()=>QuerySpine.refresh('work-discovery')).catch(()=>say('Request sent; suggestion history could not be updated. Refresh before retrying.',true));
        }
        return launched;
      },onProjects:showProjects,onModelSetup:()=>StationUI.openTerm('settings','providers'),onOpenWork:()=>open('overview')}));
      return;
    }
    refreshView(true);
  }
  function showProjects() {StationUI.closeTerm('work');const b=document.getElementById('ws-tab-projects');if(b)b.click();}
  async function click(ev) {
    if(await Deliverables.handleOpenClick(ev,artifactRows,preview,say))return;
    const b=ev.target.closest('button');if(!b || !body.contains(b))return;
    if(b.dataset.pane) {selectedFinding=null;pane=b.dataset.pane;startOpts={};mountPane();return;}
    if(b.dataset.termLink) {StationUI.openTerm(b.dataset.termLink);return;}
    if(b.dataset.session || b.dataset.correct) {
      const id=b.dataset.session || b.dataset.correct;App.openWorkstream(id);StationUI.closeTerm('work');
      if(b.dataset.correct && typeof Chat!=='undefined') Chat.prefill('Please revise this result. Here is what needs to change: ');return;
    }
    if(b.dataset.repeat) {
      const item=current && current.items.find(i=>i.id===b.dataset.repeat), s=item && item.stream;
      const m=s && Workstreams.visibleMessages(s).find(m=>m.role==='user');
      if(m && typeof AutomationWindow!=='undefined' && AutomationWindow.openDraft) AutomationWindow.openDraft({name:item.title,prompt:m.content,agentId:item.agentId,workdir:item.projectRoot});
      return;
    }
    if(b.dataset.finding) {
      const f=(data('work-discovery').staged || []).find(f=>f.id===b.dataset.finding);if(!f)return;
      open('start',{findingId:f.id,root:f.root,intent:f.kind==='client-update'?'client-update':'custom',request:f.kind==='client-update'?'Draft a weekly client update':('Review this finding in '+f.root+': '+f.quote),pain:f.title,reason:'Suggested from the evidence in your selected folder'});return;
    }
    if(b.hasAttribute('data-projects')){showProjects();return;}
    if(!b.dataset.dismiss && !b.hasAttribute('data-source-save') && !b.dataset.sourceToggle && !b.hasAttribute('data-source-remove') && !b.hasAttribute('data-scan') && !b.hasAttribute('data-refresh')) return;
    b.disabled=true;
    try {
      if(b.dataset.dismiss) {await post('/api/discovery/decide',{id:b.dataset.dismiss,decision:'dismiss'});await QuerySpine.refresh('work-discovery');say('Dismissed.');}
      else if(b.hasAttribute('data-source-save')) {const root=body.querySelector('.wh-root').value;await post('/api/discovery/sources',{root,enabled:true});say('Source saved. Scan it when you are ready.');await mountSources();}
      else if(b.dataset.sourceToggle) {await post('/api/discovery/sources',{enabled:b.dataset.sourceToggle==='resume'});say('Discovery preference saved.');await mountSources();}
      else if(b.hasAttribute('data-source-remove')) {await post('/api/discovery/sources',{remove:true});say('Source removed. Project access is unchanged; revoke it in PROJECTS if needed.');await mountSources();}
      else if(b.hasAttribute('data-scan')) {const r=await post('/api/discovery/scan',{});await QuerySpine.refresh('work-discovery');await mountSources();say(r.reason || 'Scan complete. Review the suggestions in MY WORK.');}
      else if(b.hasAttribute('data-refresh')) {await Promise.allSettled(KEYS.map(k=>QuerySpine.refresh(k)));if(pane==='sources')await mountSources();say(warnings() || 'Live state refreshed.',!!warnings());}
      refreshView(true);
    } catch(e) {say(e.message,true);} finally {if(b.isConnected)b.disabled=false;}
  }
  function mount(el) {
    cleanup();body=el;selectedFinding=startOpts.findingId || null;
    body.innerHTML='<div class="wh"><div class="wh-header"><div><span class="wh-eyebrow">LESS TO MANAGE. MORE DONE.</span><h2>YOUR WORK, IN ONE PLACE</h2></div><button class="bb" data-pane="start">START SOMETHING USEFUL</button></div>'+
      '<nav class="wh-tabs" aria-label="Work views"><button class="bb sm" data-pane="overview">MY WORK</button><button class="bb sm" data-pane="sources">FIND WORK</button><button class="bb sm" data-pane="station">MY STATION</button><button class="bb sm" data-refresh>REFRESH</button></nav>'+
      '<label class="wh-search-label"><input class="key-input wh-search" type="search" aria-label="Search your work" placeholder="Find a result, task or suggestion…"></label>'+
      '<p class="wh-message" role="status" aria-live="polite"></p><p class="wh-freshness warn" hidden></p><div class="wh-content"></div>'+
      '<details class="wh-advanced"><summary>ALL CONTROLS</summary><div class="wh-actions">'+[['tasks','TASK BOARD'],['deliverables','OUTPUT LIBRARY'],['automation','AUTOMATION'],['quests','GOALS & QUESTS'],['connectors','ABILITIES']].map(([key,label])=>'<button class="bb sm" data-term-link="'+key+'">'+label+'</button>').join('')+'</div></details></div>';
    body.addEventListener('click',click);
    body.querySelector('.wh-search').addEventListener('input',()=>refreshView(true));
    mountPane();stops=KEYS.map(key=>QuerySpine.subscribe(key,()=>refreshView()));timer=setInterval(()=>refreshView(),1500);
  }
  StationUI.registerWindow('work','MY WORK',mount,{console:true,className:'work-hub-win',onClose:cleanup});
  window.WorkHub={open};
  if(typeof FirstValue!=='undefined') FirstValue.configure({onOpen:opts=>open('start',opts)});
  // A persistent station instrument, backed by the existing journey ledger; no new progression state.
  const stage=document.getElementById('stage-wrap');
  if(stage) {
    const beacon=document.createElement('button');beacon.type='button';beacon.className='wh-beacon';beacon.setAttribute('aria-label','Open your station outcomes');stage.appendChild(beacon);
    beacon.addEventListener('click',()=>open('station'));
    QuerySpine.subscribe('journey',s=>{const v=WorkView.stationView(s.hasData && s.data && s.data.journey);beacon.innerHTML='<span>YOUR STATION · '+esc(v.name)+'</span><small>'+esc(s.error?'Progress read unavailable':v.reason)+'</small>';});
  }
})();
