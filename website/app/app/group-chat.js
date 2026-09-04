/* Group DM UI: backend-owned membership, dispatch and transcript; direct COMMS stays intact. */
'use strict';
const GroupChat = (() => {
  let active = null, group = null, root, timer, busy = false, replyTo = null, roster = [], selected = [];
  let generation = 0, lastPaint = '', notice = '', draftKey = null;
  let openedFileUrl = null;
  const composerDrafts = new Map();
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
  function name(id) { return id === 'user' ? 'YOU' : (roster.find(a => a.id === id)?.name || App.agents?.().find(a => a.id === id)?.name || id); }
  function participantsHeader(element, ids) {
    element.replaceChildren(h('span', { class: 'gc-count' }, ids.length + (ids.length === 1 ? ' agent' : ' agents')));
    const people = h('div', { class: 'gc-people', 'aria-label': 'Agents in this session' });
    for (const id of ids) people.append(h('span', { class: 'gc-person' }, name(id)));
    element.append(people);
  }
  function init() {
    if (root) return;
    const bar = $('comms-idbar'); if (!bar) return;
    root = h('section', { id: 'group-chat', 'aria-label': 'Group conversation', hidden: '' });
    const header = h('div', { id: 'gc-header', class: 'gc-header', hidden: '' });
    const addAgents = button('+ Add agents', () => picker(true)); addAgents.id = 'gc-add-agents';
    bar.append(header, addAgents);
    const tools = h('div', { class: 'gc-actions' });
    tools.append(button('PAUSE', () => action('pause')), button('RESUME', () => action('resume')));
    const more = h('details', { id: 'gc-options' }); more.append(h('summary', {}, 'Chat options'));
    const extra = h('div', { class: 'gc-actions' });
    extra.append(button('CONTINUE HANDOFFS', () => action('continue')), button('SAVE GROUP', () => action('save-group')), button('BRANCH', branch),
      button('CATCH UP', () => sendText('Give me a concise catch-up on this group: decisions, unresolved questions, and completed or pending work. Cite the message IDs supporting each point. Do not use tools or hand off; keep uncertain outcomes explicit.')));
    const allowance = h('input', { id: 'gc-allowance', type: 'number', min: '1', max: '100', value: '6', 'aria-label': 'Automatic turns per message' });
    extra.append(h('label', {}, 'Automatic turns per message'), allowance, button('SAVE TURN LIMIT', async () => {
      const id = active.id, result = await api({ op: 'configure', id, revision: group.revision, maxTurns: Number(allowance.value) });
      if (active?.id === id) { group = result; lastPaint = ''; paint(); }
    }));
    more.append(extra);
    const pins = h('details', { class: 'gc-pins' }); pins.append(h('summary', {}, 'Session instructions'));
    pins.append(h('textarea', { id: 'gc-pins', rows: '3', maxlength: '8000', 'aria-label': 'Instructions for this session' }),
      button('SAVE INSTRUCTIONS', async () => { group = await api({ op: 'configure', id: active.id, revision: group.revision, instructions: $('gc-pins').value }); lastPaint = ''; paint(); }));
    const files = h('details', { class: 'gc-files' }); files.append(h('summary', {}, 'Shared files'), h('div', { id: 'gc-files' }), h('div', { id: 'gc-preview' }));
    const upload = h('input', { type: 'file', id: 'gc-upload', 'aria-label': 'Share a file up to 1 MiB' });
    upload.addEventListener('change', async () => {
      try {
        const f = upload.files[0]; if (!f) return; if (f.size > 1024 * 1024) throw new Error('Share a file up to 1 MiB');
        const id = active.id, bytes = new Uint8Array(await f.arrayBuffer());
        let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
        const result = await api({ op: 'attach', id, name: f.name, content: btoa(binary) });
        if (active?.id === id) { group = result; lastPaint = ''; paint(); } upload.value = '';
      } catch (e) { showError(e); }
    }); more.append(upload);
    const transcript = h('div', { id: 'gc-log', role: 'log', 'aria-label': 'Group messages', 'aria-live': 'polite', class: 'scrolly' });
    const states = h('div', { id: 'gc-states', 'aria-live': 'polite' });
    const activity = h('details'); activity.append(h('summary', {}, 'Activity & usage'), h('div', { id: 'gc-history' }));
    const recipient = h('div', { id: 'gc-recipients' });
    const input = h('textarea', { id: 'gc-input', rows: '1', maxlength: '100000', placeholder: 'Message the group · @ mention', 'aria-label': 'Message the group' });
    input.addEventListener('input', () => { draftKey = null; autocomplete(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(input.value).catch(showError); } if (e.key === 'Escape') { $('gc-mentions').replaceChildren(); } });
    const composer = h('div', { class: 'gc-composer' });
    const sendOptions = h('div', { class: 'gc-compose-row' });
    const independent = h('label'); independent.append(h('input', { id: 'gc-independent', type: 'checkbox' }), document.createTextNode(' Independent answers'));
    const summary = h('label'); summary.append(h('input', { id: 'gc-summary', type: 'checkbox' }), document.createTextNode(' Lead comparison'));
    sendOptions.append(h('span', { class: 'gc-prompt', 'aria-hidden': 'true' }, '>'), input, button('SEND', () => sendText(input.value)));
    const advancedSend = h('div', { class: 'gc-actions' });
    advancedSend.append(button('ASK EVERYONE', () => sendText(input.value, { all: true })), button('INTERRUPT & SEND', () => sendText(input.value, { interrupt: true })), independent, summary);
    composer.append(recipient, h('div', { id: 'gc-mentions', role: 'listbox', 'aria-label': 'Mention participants' }), sendOptions);
    more.append(tools, advancedSend, pins, activity);
    root.append(transcript, files, states, composer, h('div', { id: 'gc-notice', role: 'status' }), more);
    $('chat-log').before(root);
    const css = h('style'); css.textContent = `
      #group-chat{position:relative;display:flex;flex:1 1 0;min-width:0;min-height:0;flex-direction:column;overflow:hidden;color:var(--text);background:var(--panel);padding:0;gap:0}
      #group-chat[hidden],#gc-header[hidden]{display:none}
      #comms-idbar{flex:0 0 auto;flex-wrap:nowrap}#comms-idbar.gc-group>.comms-agent-wrap,#comms-idbar.gc-group>#comms-agent-model{display:none}
      #gc-header{display:flex;align-items:center;gap:10px;flex:1;min-width:0;color:var(--ph)}
      .gc-count{order:2;flex:0 0 auto;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--ph-dim);white-space:nowrap}
      #gc-add-agents{flex:0 0 auto;white-space:nowrap}
      .gc-people{display:flex;flex:1;gap:14px;min-width:0;overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--ph-dim) transparent}
      .gc-person{flex:0 0 auto;font-size:14px;line-height:18px;letter-spacing:1px;color:var(--ph);white-space:nowrap}.gc-person::before{content:'▪';margin-right:6px;color:var(--ph-dim)}
      #group-chat .bb,#gc-add-agents{margin:0;padding:3px 8px;min-height:26px;font-size:13px;line-height:18px;letter-spacing:1px;border:1px solid var(--ph-faint);border-radius:3px;background:var(--panel2);color:var(--ph);box-shadow:var(--raise)}
      #group-chat .bb:hover,#gc-add-agents:hover{border-color:var(--ph);background:var(--ph-faint)}
      #group-chat :focus-visible,.gc-picker :focus-visible{outline:1px solid var(--ph);outline-offset:2px}
      #gc-log{flex:1 1 0;min-height:0;min-width:0;overflow:auto;padding:8px 12px;display:flex;flex-direction:column;gap:5px;background:var(--panel);user-select:text;scrollbar-color:var(--ph-dim) transparent}
      #gc-log>.gc-message{flex:0 0 auto;margin:0;background:none;overflow-wrap:anywhere;white-space:normal}#gc-log .body{margin:0}.gc-message .bb{align-self:flex-start;font-size:11px!important;min-height:20px!important;padding:0 5px!important;margin-top:5px!important}
      .gc-composer{flex:0 0 auto;min-width:0;border-top:2px solid var(--ph-dim);background:var(--panel)}
      .gc-compose-row{display:flex;align-items:center;gap:6px;padding:6px 8px;min-width:0}.gc-prompt{color:var(--ph);flex:0 0 auto}
      #gc-input{flex:1;min-width:0;width:0;box-sizing:border-box;height:28px;min-height:28px;max-height:80px;resize:none;border:0;border-radius:0;padding:3px 2px;background:transparent;color:var(--text);font:inherit;line-height:22px;box-shadow:none}
      #gc-input:focus{outline:none}#gc-input::placeholder{color:var(--ph-dim)}.gc-compose-row>.bb{flex:0 0 auto}
      #gc-recipients:not(:empty),#gc-mentions:not(:empty){padding:4px 12px;font-size:13px;color:var(--ph-dim)}#gc-mentions{display:flex;gap:4px;flex-wrap:wrap}
      #gc-options,.gc-files{flex:0 0 auto;min-height:0;border-top:1px solid var(--ph-faint);font-size:13px;background:var(--panel2)}#gc-options[open],.gc-files[open]{max-height:40%;overflow:auto}
      #group-chat summary,.gc-picker summary{cursor:pointer;list-style:none;color:var(--ph-dim);font-size:12px;line-height:18px;letter-spacing:1px;padding:4px 12px;text-transform:uppercase}#group-chat summary::-webkit-details-marker,.gc-picker summary::-webkit-details-marker{display:none}
      #group-chat summary::before,.gc-picker summary::before{content:'▸';display:inline-block;width:14px}#group-chat details[open]>summary::before,.gc-picker details[open]>summary::before{content:'▾'}
      .gc-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 12px}.gc-actions label{font-size:13px}.gc-pins{padding-bottom:6px}#gc-pins{width:calc(100% - 24px);margin:4px 12px;background:var(--panel);color:var(--text);border:1px solid var(--ph-faint);padding:6px;box-sizing:border-box}#gc-allowance{width:50px}
      #gc-upload{margin:6px 12px;max-width:calc(100% - 24px)}#gc-states{flex:0 1 auto;max-height:25%;overflow:auto;font-size:13px;color:var(--ph-dim)}.gc-state{padding:6px 12px;border-top:1px solid var(--ph-faint)}.gc-state .bb{margin-left:6px!important}
      #gc-notice:empty{display:none}#gc-notice{flex:0 0 auto;padding:4px 12px;font-size:13px;color:var(--gold);overflow-wrap:anywhere}
      #gc-files,#gc-preview{padding:0 12px}#gc-files .bb{display:block;margin:5px 0!important;text-align:left;overflow-wrap:anywhere}#gc-preview{white-space:pre-wrap;overflow-wrap:anywhere}#gc-preview a{color:var(--ph)}
      .gc-picker{min-width:0}.gc-picker>.key-input{display:block;width:100%;box-sizing:border-box;margin:0 0 12px}
      .gc-picker-choices{max-height:35vh;overflow:auto}.gc-picker-choices .set-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--ph-faint);overflow-wrap:anywhere}.gc-picker label[hidden]{display:none}.gc-picker input[type=checkbox]{flex:0 0 auto;margin:0}
      .gc-picker .gc-selection{margin:10px 0;color:var(--ph-dim);font-size:12px;letter-spacing:1px;text-transform:uppercase}.gc-picker>p{margin:8px 0;font-size:14px;line-height:1.35;color:var(--ph-dim)}.gc-picker>[role=alert]:empty{display:none}
      .gc-picker-footer{display:flex;justify-content:flex-end;gap:8px;padding:10px 0;border-top:1px solid var(--ph-faint)}
      .gc-picker details{border-top:1px solid var(--ph-faint);padding:4px 0}.gc-picker details label{display:block;margin:6px 0;color:var(--ph-dim);font-size:13px}.gc-picker details input,.gc-picker details select{width:100%;margin:0 0 8px;box-sizing:border-box}.gc-picker select option{background:var(--panel2)}
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
    for (const id of ['chat-log', 'chat-inputrow', 'chat-queued']) { const e = $(id); if (e) e.style.display = enabled ? 'none' : ''; }
    root.hidden = !enabled;
    if (active?.id === ws?.id) return;
    if (openedFileUrl) { URL.revokeObjectURL(openedFileUrl); openedFileUrl = null; $('gc-preview').replaceChildren(); }
    if (active?.conversationMode === 'group') composerDrafts.set(active.id, $('gc-input').value);
    active = ws; group = null; replyTo = null; selected = []; lastPaint = ''; generation++;
    clearTimeout(timer); $('gc-log').replaceChildren(); $('gc-states').replaceChildren(); $('gc-input').value = composerDrafts.get(ws?.id) || ''; draftKey = null; $('gc-pins').value = ''; notice = ''; $('gc-notice').textContent = '';
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
    participantsHeader($('gc-header'), group.members);
    if (group.paused) $('gc-header').append(h('small', {}, 'Paused'));
    if (document.activeElement !== $('gc-pins')) $('gc-pins').value = group.instructions;
    if (document.activeElement !== $('gc-allowance')) $('gc-allowance').value = group.maxTurns;
    const log = $('gc-log'), bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    for (const m of group.messages) {
      const row = h('article', { class: 'gc-message cmsg' + (m.author === 'user' ? ' user' : ' agent'), 'data-message-id': m.id });
      const body = h('div', { class: 'body' });
      if (typeof Chat !== 'undefined' && Chat.renderProse) Chat.renderProse(body, m.content); else body.textContent = m.content;
      const color = typeof App !== 'undefined' && App.agents ? App.agents().find(a => a.id === m.author)?.color : '';
      if (/^#[0-9a-f]{3,8}$/i.test(color || '')) row.style.borderColor = color;
      row.append(h('span', { class: 'who' }, name(m.author).toUpperCase()), body);
      if (m.partial) row.append(h('small', {}, 'Partial response · work did not complete'));
      if (group.members.includes(m.author)) row.append(button('REPLY', () => { replyTo = m.id; selected = [m.author]; recipientLabel(); $('gc-input').focus(); }));
      log.append(row);
    }
    for (const t of group.turns) if (t.draft) { const row = h('article', { class: 'gc-message cmsg agent' }); row.append(h('span', { class: 'who' }, name(t.agentId).toUpperCase()), h('div', { class: 'body' }, t.draft)); log.append(row); }
    if (bottom) log.scrollTop = log.scrollHeight;
    const states = $('gc-states'); states.replaceChildren();
    const history = $('gc-history'); history.replaceChildren();
    for (const t of group.turns.slice(-15)) {
      const row = h('div', { class: 'gc-state', 'data-turn-id': t.id });
      row.append(document.createTextNode(name(t.agentId) + ': ' + t.state + (t.reason && t.reason !== 'done' ? ' — ' + t.reason : '') + (t.contextCutoff != null ? ' · context through #' + t.contextCutoff : '')));
      if (['queued', 'held', 'connecting', 'running', 'waiting for approval'].includes(t.state)) row.append(button('STOP', () => action('stop', { turnId: t.id })));
      if (['failed', 'interrupted', 'stopped'].includes(t.state)) row.append(button('RETRY', () => action('retry', { turnId: t.id })));
      if (t.approval) {
        row.append(h('p', {}, t.approval.tool + ': ' + t.approval.argsSummary));
        for (const decision of ['once', 'deny']) row.append(button(decision === 'once' ? 'ALLOW ONCE' : 'DENY', async () => { await api({ op: 'answer', id: group.id, promptId: t.approval.promptId, decision }); }));
      }
      const needsAttention = ['queued', 'held', 'connecting', 'running', 'waiting for approval', 'stopping'].includes(t.state) ||
        (t === group.turns.at(-1) && ['failed', 'interrupted'].includes(t.state));
      (needsAttention ? states : history).append(row);
    }
    const costs = group.turns.filter(t => typeof t.usd === 'number');
    if (costs.length) history.append(h('div', {}, 'Measured usage: $' + costs.reduce((s, t) => s + t.usd, 0).toFixed(4) + (costs.length < group.turns.filter(t => t.endedAt).length ? ' · some costs unavailable' : '')));
    const files = $('gc-files'); files.replaceChildren();
    files.parentElement.hidden = !group.artifacts.length;
    for (const f of group.artifacts) files.append(button('OPEN ' + f.name + ' · ' + f.hash.slice(0, 8) + ' · ' + name(f.agentId), () => openFile(group.id, f)));
    if (!group.artifacts.length) files.textContent = 'Files shared here are available to every participant.';
    recipientLabel();
  }
  function recipientLabel() {
    const e = $('gc-recipients'); e.replaceChildren();
    if (!selected.length) return;
    e.append(document.createTextNode('To: ' + (selected.length ? selected.map(name).join(', ') : name(group?.leadId || 'agent'))));
    if (selected.length) e.append(button('CLEAR', () => { selected = []; replyTo = null; recipientLabel(); }));
  }
  async function openFile(id, file) {
    const response = await fetch('/api/groups?id=' + encodeURIComponent(id) + '&file=' + encodeURIComponent(file.id));
    if (!response.ok) throw new Error('Could not open this shared file');
    const blob = await response.blob();
    if (active?.id !== id) return;
    const preview = $('gc-preview'); preview.replaceChildren();
    if (openedFileUrl) URL.revokeObjectURL(openedFileUrl);
    const url = URL.createObjectURL(blob);
    openedFileUrl = url;
    preview.append(h('h4', {}, file.name), h('small', {}, 'Version ' + file.hash.slice(0, 12)), h('a', { href: url, download: file.name }, 'SAVE FILE'));
    if (/\.(md|txt|csv|json|log|js|ts|py|html|css|xml|ya?ml|svg)$/i.test(file.sourcePath || file.name)) {
      const content = await blob.text(), body = h('div', { class: 'gc-message' });
      if (/\.md$/i.test(file.sourcePath || file.name) && Chat.renderProse) Chat.renderProse(body, content); else body.textContent = content;
      preview.append(body);
    } else preview.append(h('p', {}, 'This file can be saved and opened in its associated application.'));
    preview.append(button('CLOSE FILE', () => { URL.revokeObjectURL(url); openedFileUrl = null; preview.replaceChildren(); }));
  }
  function autocomplete() {
    const e = $('gc-mentions'); e.replaceChildren();
    if (!group) return;
    const input = $('gc-input'), match = input.value.slice(0, input.selectionStart).match(/(?:^|\s)@([\w-]*)$/);
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
    if (busy || !active || active.conversationMode !== 'group' || !String(value || '').trim()) return;
    const id = active.id, key = draftKey || (draftKey = uid()); busy = true;
    try {
      const result = await api({ op: 'send', id, key, text: value, replyTo, recipients: /(?:^|\s)@/.test(value) ? [] : selected,
        independent: $('gc-independent').checked, summarize: $('gc-summary').checked, ...options });
      composerDrafts.delete(id);
      if (active?.id === id) { group = result; $('gc-input').value = ''; $('gc-mentions').replaceChildren(); selected = []; replyTo = null; draftKey = null; notice = ''; $('gc-notice').textContent = ''; paint(); }
    } finally { busy = false; }
  }
  async function action(action, extra = {}) {
    const id = active.id; const result = await api({ op: 'control', id, action, ...extra });
    if (active?.id === id) { group = result; lastPaint = ''; paint(); }
  }
  async function branch() {
    const g = await api({ op: 'fork', id: active.id }); adopt(g); save(); App.openWorkstream(g.id);
  }
  async function picker(convert) {
    if ($('gc-picker')) return;
    if (App.pushRoster) await App.pushRoster();
    const info = await api(); roster = info.roster;
    const origin = convert ? active : null, existing = origin?.conversationMode === 'group' ? await api(null, '?id=' + origin.id) : null;
    const dialog = h('div', { id: 'gc-picker', class: 'gc-picker' });
    const close = () => StationUI.closeTerm('group-agents');
    const search = h('input', { type: 'search', class: 'key-input', placeholder: 'Find an agent', 'aria-label': 'Find an agent' }); dialog.append(search);
    const title = h('input', { type: 'text', class: 'key-input', maxlength: '80', 'aria-label': 'Group title', value: existing?.title || origin?.title || 'Group chat' });
    const checks = [];
    const choices = h('div', { class: 'gc-picker-choices' }); dialog.append(choices);
    for (const a of roster) {
      const box = h('input', { type: 'checkbox', value: a.id }); box.checked = existing ? existing.members.includes(a.id) : a.id === (origin?.agentId || 'agent');
      const display = a.name + (roster.filter(r => r.name === a.name).length > 1 ? ' (' + a.id + ')' : '');
      const label = h('label', { class: 'set-row' }); label.append(box, document.createTextNode(' ' + display)); choices.append(label); checks.push(box);
    }
    search.addEventListener('input', () => { for (const label of choices.children) label.hidden = !label.textContent.toLowerCase().includes(search.value.toLowerCase()); });
    const count = h('div', { class: 'gc-selection', 'aria-live': 'polite' }); dialog.append(count);
    const lead = h('select', { class: 'fbc-sel', 'aria-label': 'Group lead' });
    function options() { const previous = lead.value; lead.replaceChildren(); for (const c of checks.filter(c => c.checked)) lead.append(h('option', { value: c.value }, name(c.value))); if ([...lead.options].some(o => o.value === previous)) lead.value = previous; const n = checks.filter(c => c.checked).length; count.textContent = n + (n === 1 ? ' agent selected' : ' agents selected'); }
    for (const c of checks) c.addEventListener('change', options); options(); if (existing) lead.value = existing.leadId;
    const settings = h('details'); settings.append(h('summary', {}, 'Session settings'), h('label', {}, 'Session name'), title, h('label', {}, 'Default responder'), lead);
    dialog.append(h('p', {}, 'Selected agents can see this conversation and its shared files.'));
    const errors = h('p', { role: 'alert' }); dialog.append(errors);
    const footer = h('div', { class: 'gc-picker-footer' });
    footer.append(button('Done', async () => {
      try {
        const data = { members: checks.filter(c => c.checked).map(c => c.value), leadId: lead.value, title: title.value };
        const g = await api(existing ? { op: 'configure', id: existing.id, revision: existing.revision, ...data } : { op: 'create', ...(origin ? { id: origin.id, history: origin.history, originalAgentId: origin.agentId } : {}), ...data });
        adopt(g); save(); close(); active = null; App.openWorkstream(g.id); if (typeof Chat !== 'undefined') Chat.load(Workstreams.get(g.id));
      } catch (e) { errors.textContent = e.message; }
    }), button('Cancel', close));
    dialog.append(footer, settings);
    if (!existing && info.templates.length) {
      const saved = h('details'); saved.append(h('summary', {}, 'Saved groups')); dialog.append(saved);
      for (const t of info.templates) saved.append(button(t.title, async () => { const g = await api({ op: 'create', ...t, id: uid() }); adopt(g); save(); close(); App.openWorkstream(g.id); }));
    }
    StationUI.toggleTerm('group-agents', 'ADD AGENTS', body => body.replaceChildren(dialog), { onClose: () => dialog.remove() });
  }
  async function rename(id, title) { const state = await api(null, '?id=' + encodeURIComponent(id)); await api({ op: 'configure', id, revision: state.revision, title }); return true; }
  async function remove(id) { await api({ op: 'control', id, action: 'delete' }); }
  async function pause(id) { await api({ op: 'control', id, action: 'pause' }); }
  return { bind, sendText, discover, rename, remove, pause };
})();
