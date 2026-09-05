/* Group DM UI: backend-owned membership, dispatch and transcript; direct COMMS stays intact. */
'use strict';
const GroupChat = (() => {
  let active = null, group = null, root, timer, busy = false, replyTo = null, roster = [], selected = [];
  let generation = 0, lastPaint = '', notice = '', draftKey = null;
  let openedFileUrl = null, openedFile = null;
  const composerDrafts = new Map();
  const sharedAttachments = new Set();
  const $ = id => document.getElementById(id);
  const uid = () => crypto.randomUUID();
  const h = (tag, attrs = {}, value) => {
    const e = document.createElement(tag);
    for (const [key, v] of Object.entries(attrs)) { if (key.startsWith('on')) e.addEventListener(key.slice(2), v); else if (key === 'class') e.className = v; else e.setAttribute(key, v); }
    if (value != null) e.textContent = value;
    return e;
  };
  const button = (label, fn) => h('button', { type: 'button', class: 'bb', onclick: () => Promise.resolve().then(fn).catch(showError) }, label);
  function showError(e) { notice = e.message || String(e); if ($('gc-notice')) $('gc-notice').textContent = notice; }
  async function api(body, query = '') {
    const r = await fetch('/api/groups' + query, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const out = await r.json(); if (!r.ok || !out.ok) throw new Error(out.error || 'Group request failed'); return out.result;
  }
  function save() { if (typeof App !== 'undefined') { App.persist(); App.refreshRail(); } }
  function adopt(g) {
    let ws = Workstreams.get(g.id) || Workstreams.adopt({ id: g.id, title: g.title, agentId: g.leadId, kind: 'chat', conversationMode: 'group', lane: 'active' });
    if (ws) {
      ws.conversationMode = 'group'; ws.agentId = g.leadId; ws.title = g.title;
      if (g.messages) {
        ws.history = g.messages.map(m => ({ role: m.author === 'user' ? 'user' : 'assistant', agentId: m.author === 'user' ? undefined : m.author, content: m.content, ts: m.at }));
        ws.runIds = g.turns.filter(t => t.runId).map(t => t.runId);
        ws.lastActiveAt = g.updatedAt;
      }
    }
    return ws;
  }
  function name(id) { return id === 'user' ? 'COMMANDER' : (roster.find(a => a.id === id)?.name || App.agents?.().find(a => a.id === id)?.name || id); }
  function colorOf(id) { const c = typeof App !== 'undefined' && App.agents ? App.agents().find(a => a.id === id)?.color : ''; return /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : ''; }
  /* The identity line in group mode: one pill in the same voice as the direct-chat agent select
     (▸ NAME · NAME · NAME), ellipsized, opens the picker; a status word on the right where the
     direct chat prints the model. No second header row, no scrolling name list. */
  function participantsHeader(element, ids, paused) {
    const names = ids.map(name);
    const pill = h('button', { type: 'button', class: 'gc-pill', 'aria-label': 'Agents on the line: ' + names.join(', ') + '. Add or remove agents', onclick: () => picker(true) });
    pill.append(h('span', { class: 'gc-sigil', 'aria-hidden': 'true' }, '▸'));
    const line = h('span', { class: 'gc-names' });
    names.forEach((n, i) => { if (i) line.append(h('span', { class: 'gc-sep', 'aria-hidden': 'true' }, '·')); line.append(h('span', { class: 'gc-name', style: colorOf(ids[i]) ? 'color:' + colorOf(ids[i]) : '' }, n)); });
    pill.append(line, h('span', { class: 'gc-caret', 'aria-hidden': 'true' }, '▾'));
    element.replaceChildren(pill);
    if (paused) element.append(h('span', { class: 'gc-status paused', 'aria-live': 'polite' }, 'paused'));
  }
  function init() {
    if (root) return;
    const bar = $('comms-idbar'); if (!bar) return;
    root = h('section', { id: 'group-chat', 'aria-label': 'Group conversation', hidden: '' });
    const header = h('div', { id: 'gc-header', class: 'gc-header', hidden: '' });
    const addAgents = button('+ ADD', () => picker(true)); addAgents.id = 'gc-add-agents'; addAgents.setAttribute('aria-label', 'Add agents to this conversation');
    bar.append(header, addAgents);
    const files = h('div', { class: 'gc-files' }); files.append(h('div', { id: 'gc-files' }), h('div', { id: 'gc-preview' }));
    const transcript = h('div', { id: 'gc-log', role: 'log', 'aria-label': 'Group messages', 'aria-live': 'polite', class: 'scrolly' });
    const states = h('div', { id: 'gc-states', 'aria-live': 'polite' });
    const recipient = h('div', { id: 'gc-recipients' });
    $('chat-input').addEventListener('input', () => { if (active?.conversationMode === 'group') { draftKey = null; autocomplete(); } });
    root.append(transcript, files, states, recipient, h('div', { id: 'gc-mentions', role: 'listbox', 'aria-label': 'Mention participants' }), h('div', { id: 'gc-notice', role: 'status' }));
    $('chat-log').before(root);
    const css = h('style'); css.textContent = `
      #group-chat{position:relative;display:flex;flex:1 1 0;min-width:0;min-height:0;flex-direction:column;overflow:hidden;color:var(--text);background:var(--panel);padding:0;gap:0}
      #group-chat[hidden],#gc-header[hidden]{display:none}
      #comms-idbar{flex:0 0 auto;flex-wrap:nowrap}#comms-idbar.gc-group>.comms-agent-wrap,#comms-idbar.gc-group>#comms-agent-model{display:none}
      #gc-header{display:flex;align-items:center;gap:8px;flex:1 1 0;min-width:0}
      .gc-pill{display:inline-flex;align-items:center;gap:6px;flex:0 1 auto;min-width:0;max-width:100%;margin:0;padding:3px 9px;font-family:inherit;font-size:14px;line-height:18px;letter-spacing:1px;text-transform:uppercase;color:var(--ph-bright);background:linear-gradient(180deg,color-mix(in srgb,var(--ph) 8%,var(--panel2)),var(--panel2));border:1px solid var(--ph-dim);border-radius:4px;cursor:pointer;text-shadow:0 0 5px var(--ph-glow);box-shadow:inset 0 1px 0 rgba(var(--ph-rgb),.12),0 1px 0 rgba(0,0,0,.4);transition:color .12s,border-color .12s,background-color .12s,box-shadow .12s}
      .gc-pill:hover{border-color:var(--ph);background:var(--ph-faint);box-shadow:inset 0 1px 0 rgba(var(--ph-rgb),.18),0 0 9px var(--ph-glow2),0 1px 0 rgba(0,0,0,.4)}
      .gc-pill .gc-sigil,.gc-pill .gc-caret{flex:0 0 auto;color:var(--ph-dim);font-size:12px;text-shadow:none}.gc-pill .gc-caret{font-size:11px}.gc-pill:hover .gc-caret{color:var(--ph)}
      .gc-names{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gc-sep{margin:0 5px;color:var(--ph-dim);text-shadow:none}
      .gc-status{flex:0 0 auto;margin-left:auto;font-size:11px;letter-spacing:.8px;color:var(--ph-dim);opacity:.82;white-space:nowrap}
      .gc-status.paused{color:var(--gold);opacity:1}.gc-status.paused::before{content:'⏸ ';opacity:.85}
      #gc-add-agents{flex:0 0 auto;white-space:nowrap}
      #group-chat .bb,#gc-add-agents{margin:0;padding:3px 8px;min-height:26px;font-size:13px;line-height:18px;letter-spacing:1px;border:1px solid var(--ph-faint);border-radius:3px;background:var(--panel2);color:var(--ph);box-shadow:var(--raise)}
      #group-chat .bb:hover,#gc-add-agents:hover{border-color:var(--ph);background:var(--ph-faint)}
      #group-chat :focus-visible,.gc-picker :focus-visible,.gc-pill:focus-visible{outline:1px solid var(--ph);outline-offset:2px}
      #gc-log{flex:1 1 0;min-height:0;min-width:0;overflow:auto;padding:8px 12px;display:flex;flex-direction:column;gap:5px;background:var(--panel);user-select:text;scrollbar-color:var(--ph-dim) transparent}
      #gc-log>.gc-message{flex:0 0 auto;margin:0;background:none;overflow-wrap:anywhere;white-space:normal}#gc-log .body{margin:0}#gc-log .gc-message .who{display:block}
      #gc-log .gc-message.agent .who{color:var(--gc-c,var(--ph-dim))}#gc-log .gc-message.agent{border-left-color:var(--gc-c,var(--ph-faint))}
      #gc-log .gc-message .who.gc-who{cursor:pointer;user-select:none;border:0;background:none;padding:0;font:inherit;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;text-align:left;width:auto}
      #gc-log .gc-message .who.gc-who:hover{color:var(--ph-bright);text-shadow:0 0 5px var(--ph-glow)}
      #gc-log .gc-message .who.gc-who::after{content:' @';opacity:0;font-size:11px;letter-spacing:0;transition:opacity .12s}#gc-log .gc-message .who.gc-who:hover::after{opacity:.8}
      .gc-message.draft .body{opacity:.85}.gc-message.draft .body::after{content:'▌';color:var(--ph);animation:1s steps(1) infinite comms-blink}
      .gc-message .gc-partial{display:block;margin-top:4px;font-size:12px;letter-spacing:.5px;color:var(--gold)}
      #gc-recipients:not(:empty),#gc-mentions:not(:empty){padding:4px 12px;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:var(--ph-dim);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      #gc-recipients .gc-to{color:var(--ph)}#gc-recipients .bb,#gc-mentions .bb{font-size:11px!important;min-height:20px!important;padding:0 6px!important}
      .gc-files{flex:0 0 auto;display:flex;flex-direction:column;min-height:0;max-height:40%;border-top:1px solid var(--ph-faint);font-size:13px;background:linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.04))}
      #gc-files{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 12px}#gc-files .gc-files-label{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--ph-dim);margin-right:2px}
      #gc-files .gc-file{display:inline-flex;align-items:baseline;gap:5px;max-width:100%;margin:0;padding:2px 8px;min-height:22px;font-size:12px;letter-spacing:.3px;border:1px solid var(--ph-faint);border-radius:var(--r-sm,3px);background:rgba(var(--ph-rgb),.03);color:var(--ph);cursor:pointer;box-shadow:none}
      #gc-files .gc-file:hover,#gc-files .gc-file.open{border-color:var(--ph-dim);background:rgba(var(--ph-rgb),.055);color:var(--ph-bright)}#gc-files .gc-file .tc-glyph{color:var(--ph-dim)}#gc-files .gc-file span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #gc-preview{flex:0 1 auto;min-height:0;overflow:auto;padding:0 12px 8px}#gc-preview:empty{display:none}#gc-preview h4{margin:6px 0 2px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--ph)}#gc-preview small{color:var(--ph-dim);font-size:11px;margin-right:10px}
      #gc-preview{white-space:pre-wrap;overflow-wrap:anywhere}#gc-preview a{color:var(--ph);font-size:11px;letter-spacing:1px}#gc-preview .gc-message{margin-top:6px}
      #gc-states{flex:0 0 auto;max-height:25%;overflow:auto;padding:0 12px 4px}
      .gc-state{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:4px 0 2px;padding:6px 11px;border-left:2px solid var(--ph);border-radius:0 4px 4px 0;background:linear-gradient(180deg,var(--ph-faint),rgba(0,0,0,.25));font-size:13px;letter-spacing:.5px;color:var(--ph-bright)}
      .gc-state .gc-dot{flex:0 0 auto;color:var(--ph);text-shadow:0 0 6px var(--ph-glow);animation:1s steps(1) infinite comms-blink}.gc-state .gc-verb{letter-spacing:1.5px;text-transform:uppercase}.gc-state .gc-what{color:var(--ph-dim);font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis}
      .gc-state.hold{border-left-color:var(--gold);background:linear-gradient(180deg,color-mix(in srgb,var(--gold) 14%,transparent),rgba(0,0,0,.25))}.gc-state.hold .gc-dot,.gc-state.hold .gc-verb{color:var(--gold);animation:none;text-shadow:none}
      .gc-state.bad{border-left-color:var(--bad)}.gc-state.bad .gc-dot,.gc-state.bad .gc-verb{color:var(--bad);animation:none;text-shadow:none}
      .gc-state .gc-approval{flex:1 0 100%;font-size:12px;color:var(--text);opacity:.9;overflow-wrap:anywhere}.gc-state .bb{margin-left:auto!important;font-size:11px!important;min-height:20px!important;padding:0 6px!important}.gc-state .bb+.bb{margin-left:0!important}
      #gc-notice:empty{display:none}#gc-notice{flex:0 0 auto;padding:4px 12px;font-size:13px;color:var(--gold);overflow-wrap:anywhere}
      .gc-picker{min-width:0}.gc-picker>.key-input{display:block;width:100%;box-sizing:border-box;margin:0 0 12px}
      .gc-picker-choices{max-height:35vh;overflow:auto}.gc-agent-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;box-sizing:border-box;text-align:left;padding:10px 12px;margin:0;border:0;border-bottom:1px solid var(--ph-faint);border-left:2px solid transparent;border-radius:0;background:transparent;color:var(--text);font:inherit;cursor:pointer;overflow-wrap:anywhere}.gc-agent-choice[aria-pressed=true]{border-left-color:var(--ph);background:var(--ph-faint);color:var(--ph)}.gc-agent-choice:hover{background:var(--panel2);color:var(--ph-bright)}.gc-agent-choice[hidden]{display:none}.gc-agent-state{flex:0 0 auto;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--ph-dim)}
      .gc-picker .gc-selection{margin:10px 0;color:var(--ph-dim);font-size:12px;letter-spacing:1px;text-transform:uppercase}.gc-picker>p{margin:8px 0;font-size:14px;line-height:1.35;color:var(--ph-dim)}.gc-picker>[role=alert]:empty{display:none}
      .gc-picker-footer{display:flex;justify-content:flex-end;gap:8px;padding:10px 0;border-top:1px solid var(--ph-faint)}
    `; document.head.append(css);
    discover().catch(showError);
  }
  async function discover() {
    const result = await api(); roster = result.roster;
    for (const g of result.groups) adopt(g);
    save();
  }
  function bind(ws) {
    init(); if (!root) return;
    const enabled = !!ws && ws.conversationMode === 'group';
    $('gc-header').hidden = !enabled;
    $('comms-idbar').classList.toggle('gc-group', enabled);
    $('comms-idbar').hidden = false;
    for (const id of ['chat-log', 'chat-queued']) { const e = $(id); if (e) e.style.display = enabled ? 'none' : ''; }
    $('chat-inputrow').style.display = '';
    root.hidden = !enabled;
    $('gc-add-agents').textContent = enabled ? '+ ADD' : '+ ADD AGENTS';
    if (active?.id === ws?.id) return;
    if (openedFileUrl) { URL.revokeObjectURL(openedFileUrl); openedFileUrl = null; openedFile = null; $('gc-preview').replaceChildren(); }
    if (active) composerDrafts.set(active.id, $('chat-input').value);
    active = ws; group = null; replyTo = null; selected = []; lastPaint = ''; generation++;
    clearTimeout(timer); $('gc-log').replaceChildren(); $('gc-states').replaceChildren(); $('chat-input').value = composerDrafts.get(ws?.id) || ''; draftKey = null; notice = ''; $('gc-notice').textContent = ''; $('gc-mentions').replaceChildren(); recipientLabel();
    if (enabled) poll(generation);
  }
  async function poll(gen) {
    try {
      const id = active.id, result = await api(null, '?id=' + encodeURIComponent(id));
      if (gen !== generation) return;
      group = result; paint();
    } catch (e) { if (gen === generation) showError(e); }
    if (gen === generation && active?.conversationMode === 'group') timer = setTimeout(() => poll(gen), 900);
  }
  function paint() {
    if (!group || group.id !== active?.id) return;
    const signature = JSON.stringify(group); if (lastPaint === signature) return; lastPaint = signature;
    const priorRevision = active.groupRevision;
    adopt(group);
    if (priorRevision !== group.revision) { active.groupRevision = group.revision; save(); }
    participantsHeader($('gc-header'), group.members, !!group.paused);
    const log = $('gc-log'), bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    /* Speaker on every reply. An agent's name is the reply affordance: click it and the next
       message goes to that agent (no button under every bubble). The agent's roster colour
       carries the rail and the name, so who-said-what reads at a glance across N speakers. */
    const speaker = (author, target) => {
      if (author === 'user') return h('span', { class: 'who' }, 'COMMANDER');
      const who = h('button', { type: 'button', class: 'who gc-who', 'aria-label': 'Reply to ' + name(author), onclick: () => { replyTo = target || null; selected = [author]; recipientLabel(); $('chat-input').focus(); } }, name(author).toUpperCase());
      return who;
    };
    for (const m of group.messages) {
      const row = h('article', { class: 'gc-message cmsg' + (m.author === 'user' ? ' user' : ' agent'), 'data-message-id': m.id });
      const body = h('div', { class: 'body' });
      if (typeof Chat !== 'undefined' && Chat.renderProse) Chat.renderProse(body, m.content); else body.textContent = m.content;
      const color = colorOf(m.author); if (color) row.style.setProperty('--gc-c', color);
      row.append(group.members.includes(m.author) ? speaker(m.author, m.id) : h('span', { class: 'who' }, name(m.author).toUpperCase()), body);
      if (m.partial) row.append(h('small', { class: 'gc-partial' }, 'partial · work did not complete'));
      log.append(row);
    }
    for (const t of group.turns) if (t.draft) {
      const row = h('article', { class: 'gc-message cmsg agent draft' }); const color = colorOf(t.agentId); if (color) row.style.setProperty('--gc-c', color);
      row.append(h('span', { class: 'who' }, name(t.agentId).toUpperCase()), h('div', { class: 'body' }, t.draft)); log.append(row);
    }
    if (bottom) log.scrollTop = log.scrollHeight;
    /* Turn state in the same voice as the direct chat's presence card: dot · NAME · verb.
       Truthful: 'running' only once the sidecar reports it; before that the word is 'connecting'. */
    const states = $('gc-states'); states.replaceChildren();
    const VERB = { queued: 'queued', held: 'ready', connecting: 'connecting…', running: 'working', 'waiting for approval': 'needs approval', stopping: 'stopping', failed: 'failed', interrupted: 'interrupted', stopped: 'stopped' };
    for (const t of group.turns.slice(-15)) {
      const needsAttention = ['queued', 'held', 'connecting', 'running', 'waiting for approval', 'stopping'].includes(t.state) ||
        (t === group.turns.at(-1) && ['failed', 'interrupted'].includes(t.state));
      if (!needsAttention) continue;
      const tone = ['failed', 'interrupted'].includes(t.state) ? ' bad' : ['held', 'waiting for approval', 'queued', 'stopped'].includes(t.state) ? ' hold' : '';
      const row = h('div', { class: 'gc-state' + tone, 'data-turn-id': t.id });
      row.append(h('span', { class: 'gc-dot', 'aria-hidden': 'true' }, '●'), h('span', { class: 'gc-verb', style: colorOf(t.agentId) && !tone ? 'color:' + colorOf(t.agentId) : '' }, name(t.agentId)), h('span', { class: 'gc-what' }, VERB[t.state] || t.state));
      if (t.state === 'held') row.append(button('CONTINUE', () => action('continue')));
      if (['failed', 'interrupted', 'stopped'].includes(t.state)) row.append(button('RETRY', () => action('retry', { turnId: t.id })));
      if (t.approval) {
        row.append(h('div', { class: 'gc-approval' }, t.approval.tool + ' · ' + t.approval.argsSummary));
        for (const decision of ['once', 'deny']) row.append(button(decision === 'once' ? 'ALLOW ONCE' : 'DENY', async () => { await api({ op: 'answer', id: group.id, promptId: t.approval.promptId, decision }); }));
      }
      states.append(row);
    }
    /* Shared files: one compact chip row in the tool-chip voice, not a stack of full-width buttons. */
    const files = $('gc-files'); files.replaceChildren();
    files.parentElement.hidden = !group.artifacts.length;
    if (group.artifacts.length) files.append(h('span', { class: 'gc-files-label' }, 'shared'));
    for (const f of group.artifacts) {
      const chip = h('button', { type: 'button', class: 'gc-file' + (openedFile === f.id ? ' open' : ''), 'aria-label': 'Open shared file ' + f.name, onclick: () => openFile(group.id, f).catch(showError) });
      chip.append(h('span', { class: 'tc-glyph', 'aria-hidden': 'true' }, '▤'), h('span', {}, f.name)); files.append(chip);
    }
    recipientLabel();
    if (Chat.refreshGroupControls) Chat.refreshGroupControls();
  }
  function recipientLabel() {
    const e = $('gc-recipients'); e.replaceChildren();
    if (!selected.length) return;
    e.append(document.createTextNode('to'), h('span', { class: 'gc-to' }, selected.map(name).join(', ')));
    e.append(button('✕', () => { selected = []; replyTo = null; recipientLabel(); }));
  }
  async function openFile(id, file) {
    const response = await fetch('/api/groups?id=' + encodeURIComponent(id) + '&file=' + encodeURIComponent(file.id));
    if (!response.ok) throw new Error('Could not open this shared file');
    const blob = await response.blob();
    if (active?.id !== id) return;
    const preview = $('gc-preview'); preview.replaceChildren();
    if (openedFileUrl) URL.revokeObjectURL(openedFileUrl);
    const url = URL.createObjectURL(blob);
    openedFileUrl = url; openedFile = file.id; lastPaint = ''; paint();
    preview.append(h('h4', {}, file.name), h('small', {}, 'version ' + file.hash.slice(0, 12)), h('a', { href: url, download: file.name }, 'SAVE FILE'));
    if (/\.(md|txt|csv|json|log|js|ts|py|html|css|xml|ya?ml|svg)$/i.test(file.sourcePath || file.name)) {
      const content = await blob.text(), body = h('div', { class: 'gc-message' });
      if (/\.md$/i.test(file.sourcePath || file.name) && Chat.renderProse) Chat.renderProse(body, content); else body.textContent = content;
      preview.append(body);
    } else preview.append(h('p', {}, 'This file can be saved and opened in its associated application.'));
    preview.append(button('CLOSE FILE', () => { URL.revokeObjectURL(url); openedFileUrl = null; openedFile = null; preview.replaceChildren(); lastPaint = ''; paint(); }));
  }
  function autocomplete() {
    const e = $('gc-mentions'); e.replaceChildren();
    if (!group) return;
    const input = $('chat-input'), match = input.value.slice(0, input.selectionStart).match(/(?:^|\s)@([\w-]*)$/);
    if (!match) return;
    for (const a of roster.filter(a => group.members.includes(a.id) && (a.name + ' ' + a.id).toLowerCase().includes(match[1].toLowerCase()))) {
      const b = button(a.name + ' [' + a.id + ']', () => {
        const pos = input.selectionStart, start = pos - match[1].length - 1;
        input.value = input.value.slice(0, start) + '@' + a.id + ' ' + input.value.slice(pos);
        selected = []; replyTo = null; recipientLabel(); e.replaceChildren(); input.focus();
      }); b.setAttribute('role', 'option'); e.append(b);
    }
  }
  async function sendText(value, options = {}) {
    if (busy || !active || active.conversationMode !== 'group' || (!String(value || '').trim() && !options.attachments?.length)) return false;
    const id = active.id, agentId = options.attachmentAgent || active.agentId, paused = group?.paused;
    const reply = replyTo, recipients = [...selected], key = draftKey || (draftKey = uid()); busy = true;
    try {
      for (const file of options.attachments || []) {
        const attachmentKey = id + ':' + file.id;
        if (sharedAttachments.has(attachmentKey)) continue;
        const response = await fetch('/api/file?agent=' + encodeURIComponent(agentId) + '&path=' + encodeURIComponent(file.path));
        if (!response.ok) throw new Error('Could not share ' + file.name);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 1024 * 1024) throw new Error('Group files currently support up to 1 MiB; ' + file.name + ' is still attached.');
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        await api({ op: 'attach', id, name: file.name, content: btoa(binary) });
        sharedAttachments.add(attachmentKey);
      }
      if (paused) await api({ op: 'control', id, action: 'resume' });
      const result = await api({ op: 'send', id, key, text: String(value || '').trim() || 'Please review the attached files.', replyTo: reply,
        recipients: /(?:^|\s)@/.test(value) ? [] : recipients });
      composerDrafts.delete(id);
      if (active?.id === id) { group = result; $('gc-mentions').replaceChildren(); selected = []; replyTo = null; draftKey = null; notice = ''; $('gc-notice').textContent = ''; paint(); }
      return true;
    } catch (e) { showError(e); return false; } finally { busy = false; }
  }
  function isBusy() { return !!(group && group.id === active?.id && group.turns.some(t => ['connecting', 'running', 'waiting for approval', 'stopping'].includes(t.state))); }
  async function stop() {
    const id = active?.id; if (!id) return;
    try {
      let result = await api({ op: 'control', id, action: 'pause' });
      for (const t of result.turns.filter(t => ['queued', 'held', 'connecting', 'running', 'waiting for approval', 'stopping'].includes(t.state)))
        result = await api({ op: 'control', id, action: 'stop', turnId: t.id });
      if (active?.id === id) { group = result; lastPaint = ''; paint(); }
    } catch (e) { showError(e); }
  }
  async function action(action, extra = {}) {
    const id = active.id; const result = await api({ op: 'control', id, action, ...extra });
    if (active?.id === id) { group = result; lastPaint = ''; paint(); }
  }
  async function picker(convert) {
    if ($('gc-picker')) return;
    if (App.pushRoster) await App.pushRoster();
    const info = await api(); roster = info.roster;
    const origin = convert ? active : null, existing = origin?.conversationMode === 'group' ? await api(null, '?id=' + origin.id) : null;
    const dialog = h('div', { id: 'gc-picker', class: 'gc-picker' });
    const close = () => StationUI.closeTerm('group-agents');
    const search = h('input', { type: 'search', class: 'key-input', placeholder: 'Find an agent', 'aria-label': 'Find an agent' }); dialog.append(search);
    const chosen = new Set(existing ? existing.members : [origin?.agentId || 'agent']);
    const choices = h('div', { class: 'gc-picker-choices', role: 'group', 'aria-label': 'Select agents' }); dialog.append(choices);
    for (const a of roster) {
      const display = a.name + (roster.filter(r => r.name === a.name).length > 1 ? ' (' + a.id + ')' : '');
      const row = h('button', { type: 'button', class: 'gc-agent-choice', 'aria-label': display,
        'data-agent-id': a.id, 'data-agent-name': display.toLowerCase(),
        onclick: () => { if (chosen.has(a.id)) chosen.delete(a.id); else chosen.add(a.id); options(); } });
      row.append(h('span', {}, display), h('span', { class: 'gc-agent-state', 'aria-hidden': 'true' })); choices.append(row);
    }
    search.addEventListener('input', () => { for (const row of choices.children) row.hidden = !row.dataset.agentName.includes(search.value.toLowerCase()); });
    const count = h('div', { class: 'gc-selection', 'aria-live': 'polite' }); dialog.append(count);
    function options() {
      for (const row of choices.children) {
        const selected = chosen.has(row.dataset.agentId);
        row.setAttribute('aria-pressed', String(selected)); row.lastElementChild.textContent = selected ? 'Added' : '';
      }
      const n = chosen.size; count.textContent = n + (n === 1 ? ' agent selected' : ' agents selected');
    }
    options();
    dialog.append(h('p', {}, 'Selected agents can see this conversation and its shared files.'));
    const errors = h('p', { role: 'alert' }); dialog.append(errors);
    const footer = h('div', { class: 'gc-picker-footer' });
    footer.append(button('ADD', async () => {
      try {
        const members = roster.filter(a => chosen.has(a.id)).map(a => a.id);
        const previousLead = existing?.leadId || origin?.agentId || 'agent';
        const data = { members, leadId: members.includes(previousLead) ? previousLead : members[0], title: existing?.title || origin?.title || 'Group chat' };
        const g = await api(existing ? { op: 'configure', id: existing.id, revision: existing.revision, ...data } : { op: 'create', ...(origin ? { id: origin.id, history: origin.history, originalAgentId: origin.agentId } : {}), ...data });
        adopt(g); save(); close(); active = null; App.openWorkstream(g.id); if (typeof Chat !== 'undefined') Chat.load(Workstreams.get(g.id));
      } catch (e) { errors.textContent = e.message; }
    }), button('Cancel', close));
    dialog.append(footer);
    StationUI.toggleTerm('group-agents', 'ADD AGENTS', body => body.replaceChildren(dialog), { onClose: () => dialog.remove() });
  }
  async function rename(id, title) { const state = await api(null, '?id=' + encodeURIComponent(id)); await api({ op: 'configure', id, revision: state.revision, title }); return true; }
  async function remove(id) { await api({ op: 'control', id, action: 'delete' }); }
  async function pause(id) { await api({ op: 'control', id, action: 'pause' }); }
  return { bind, sendText, discover, rename, remove, pause, isBusy, stop };
})();
