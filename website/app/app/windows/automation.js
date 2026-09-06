/* STARNET — windows/automation.js : the AUTOMATION window (ROUTINES + LOOPS, one console).

   NAV CONDENSE (2026-08-04): the WORK dock sold three flavours of "job" — TASKS, ROUTINES, LOOPS —
   and the subtitles were already apologising for it. ROUTINES answer WHEN, LOOPS answer UNTIL; both
   are standing automation over the same crew, and their windows had the identical shape (an ACTIVE
   list + a CREATE flow). So they now share ONE dock item and ONE console window with four sections:
   ACTIVE ROUTINES · CREATE ROUTINE · ACTIVE LOOPS · START A LOOP.

   Mechanics: this file owns the window slot (key `automation`) and a tiny lane registry. Loads AFTER
   stationui.js and BEFORE windows/routines.js + windows/loops.js (see index.html); each of those
   registers a LANE — a function of (body) returning { sections, wire } — instead of mounting its own
   console. buildAutomation concatenates the lanes' sections into one mountConsole call, then runs
   each lane's wire() against the shared body. All panes are mounted up-front (mountConsole's design),
   the two lanes' ids are disjoint (rt-* / lp-*), so both wirings coexist untouched. */
'use strict';
(() => {
  if (typeof StationUI === 'undefined' || !StationUI.registerWindow) return;
  const lanes = [];
  // the seam routines.js / loops.js register through. Kept deliberately tiny: order of registration
  // (script order in index.html) is the section order in the rail — routines first, loops second.
  let draft = null;
  let awayAgent = null;
  window.AutomationWindow = {
    registerLane(fn) { if (typeof fn === 'function') lanes.push(fn); },
    openAway(agentId) {
      awayAgent = agentId || null;
      StationUI.openTerm('automation', 'away');
      StationUI.h.rerender('automation');
    },
    openDraft(value) {
      draft = Object.assign({}, value || {});
      StationUI.openTerm('automation', 'routines-create');
    }
  };

  function buildAutomation(body) {
    const built = lanes.map(fn => fn(body)).filter(b => b && Array.isArray(b.sections));
    const sections = built.reduce((acc, b) => acc.concat(b.sections), []);
    const H = StationUI.h;
    sections.push({ id: 'away', label: 'WHILE I’M AWAY', glyph: '◈', desc: 'Review queued builds and control which agent works between your messages. The station must remain running.', build: pane => {
      pane.innerHTML = '<label for="auto-away-agent">AGENT</label><select id="auto-away-agent" class="key-input">' + H.present.map(a => '<option value="' + H.esc(a.id) + '">' + H.esc(a.name || a.id) + '</option>').join('') + '</select><div id="auto-away-body"></div>' +
        '<details class="cf-group"><summary>Self-directed work and initiative</summary><p>Queued builds are jobs you chose. The station’s autonomy settings also control whether agents propose or choose their own jobs.</p><button class="bb sm" id="auto-initiative">CONFIGURE INITIATIVE</button></details>';
    }});
    StationUI.h.mountConsole(body, 'automation', sections, { search: false, groups: [
      { id: 'schedule', label: 'ON A SCHEDULE', sections: ['routines', 'routines-create'] },
      { id: 'goal', label: 'UNTIL A GOAL IS COMPLETE', sections: ['loops', 'loops-start'] },
      { id: 'away', label: 'WHILE I’M AWAY', sections: ['away'] }
    ] });
    built.forEach(b => { if (typeof b.wire === 'function') b.wire(); });
    const picker = body.querySelector('#auto-away-agent');
    const awayBody = body.querySelector('#auto-away-body');
    picker.value = H.present.some(a => a.id === awayAgent) ? awayAgent : (H.present[H.sel] || H.present[0] || {}).id || '';
    const renderAway = () => {
      awayAgent = picker.value;
      const a = H.present.find(a => a.id === awayAgent);
      awayBody.innerHTML = a ? H.workshopCard(a) : '<p>No agents on this station. Recruit one to configure away work.</p>';
      if (a) H.wireWorkshop(awayBody, a);
    };
    picker.addEventListener('change', renderAway);
    body.querySelector('#auto-initiative').onclick = () => H.openTerm('settings', 'autonomy');
    renderAway();
    if (draft) {
      if (draft.widgetId) {
        const prompt = body.querySelector('#rt-prompt');
        if (prompt) prompt.dataset.widgetId = draft.widgetId;
      }
      if (draft.workflowTakeoverId) {
        const prompt = body.querySelector('#rt-prompt');
        if (prompt) {
          prompt.dataset.workflowTakeoverId = draft.workflowTakeoverId;
          const note = document.createElement('p'); note.className = 'set-about';
          note.textContent = 'Takeover review — ' + draft.count + ' separate completed requests. Check sources, changing dates, saved choices and required access. Choose the schedule below; nothing is scheduled until you add the routine.';
          prompt.insertAdjacentElement('beforebegin', note);
          const evidence = document.createElement('details');
          const summary = document.createElement('summary'); summary.textContent = 'Requests behind this offer'; evidence.appendChild(summary);
          for (const item of (draft.evidence || [])) {
            const line = document.createElement('p'); line.textContent = new Date(item.at).toLocaleDateString() + ' — ' + item.quote; evidence.appendChild(line);
          }
          prompt.insertAdjacentElement('beforebegin', evidence);
        }
      }
      if(String(draft.prompt || '').includes('Pasted source (JSON string):')) {
        const note=document.createElement('p');note.className='warn';note.textContent='This draft contains a fixed pasted sample. For fresh updates on each run, replace that sample with an approved source folder before adding the routine.';
        const prompt=body.querySelector('#rt-prompt');if(prompt)prompt.insertAdjacentElement('beforebegin',note);
      }
      for (const [selector, key] of [['#rt-name','name'],['#rt-prompt','prompt'],['#rt-workdir','workdir']]) {
        const el = body.querySelector(selector); if (el) el.value = String(draft[key] || '');
      }
      const agentButton = Array.from(body.querySelectorAll('.rt-agent-btn')).find(b => b.dataset.agent === draft.agentId);
      if (agentButton) agentButton.click();
      draft = null; // a draft is not a routine; only the existing CREATE click can persist one.
    }
  }

  StationUI.registerWindow('automation', 'AUTOMATION', buildAutomation, { console: true });
})();
