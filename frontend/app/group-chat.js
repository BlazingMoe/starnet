/* Group DM UI: backend-owned membership, dispatch and transcript; direct COMMS stays intact. */
'use strict';
const GroupChat = (() => {
  let active = null, group = null, root, timer, busy = false, replyTo = null, roster = [], selected = [];
  let generation = 0, lastPaint = '', notice = '', draftKey = null;
  let openedFileUrl = null;
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
      #gc-header{display:flex;align-items:center;gap:10px;flex:1;min-width:0;color:var(--ph)}
      .gc-count{order:2;flex:0 0 auto;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--ph-dim);white-space:nowrap}
      #gc-add-agents{flex:0 0 auto;white-space:nowrap}
      .gc-people{display:flex;flex:1;gap:14px;min-width:0;overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--ph-dim) transparent}
      .gc-person{flex:0 0 auto;font-size:14px;line-height:18px;letter-spacing:1px;color:var(--ph);white-space:nowrap}.gc-person::before{content:'▪';margin-right:6px;color:var(--ph-dim)}
      #group-chat .bb,#gc-add-agents{margin:0;padding:3px 8px;min-height:26px;font-size:13px;line-height:18px;letter-spacing:1px;border:1px solid var(--ph-faint);border-radius:3px;background:var(--panel2);color:var(--ph);box-shadow:var(--raise)}
      #group-chat .bb:hover,#gc-add-agents:hover{border-color:var(--ph);background:var(--ph-faint)}
      #group-chat :focus-visible,.gc-picker :focus-visible{outline:1px solid var(--ph);outline-offset:2px}
      #gc-log{flex:1 1 0;min-height:0;min-width:0;overflow:auto;padding:8px 12px;display:flex;flex-direction:column;gap:5px;background:var(--panel);user-select:text;scrollbar-color:var(--ph-dim) transparent}
      #gc-log>.gc-message{flex:0 0 auto;margin:0;background:none;overflow-wrap:anywhere;white-space:normal}#gc-log .body{margin:0}#gc-log .gc-message .who{display:block}.gc-message .bb{align-self:flex-start;font-size:11px!important;min-height:20px!important;padding:0 5px!important;margin-top:5px!important}
      #gc-recipients:not(:empty),#gc-mentions:not(:empty){padding:4px 12px;font-size:13px;color:var(--ph-dim)}#gc-mentions{display:flex;gap:4px;flex-wrap:wrap}
      .gc-files{flex:0 1 auto;min-height:0;max-height:35%;overflow:auto;border-top:1px solid var(--ph-faint);font-size:13px;background:var(--panel2)}
      #gc-states{flex:0 1 auto;max-height:25%;overflow:auto;font-size:13px;color:var(--ph-dim)}.gc-state{padding:6px 12px;border-top:1px solid var(--ph-faint)}.gc-state .bb{margin-left:6px!important}
      #gc-notice:empty{display:none}#gc-notice{flex:0 0 auto;padding:4px 12px;font-size:13px;color:var(--gold);overflow-wrap:anywhere}
      #gc-files,#gc-preview{padding:0 12px}#gc-files .bb{display:block;margin:5px 0!important;text-align:left;overflow-wrap:anywhere}#gc-preview{white-space:pre-wrap;overflow-wrap:anywhere}#gc-preview a{color:var(--ph)}
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
    if (active?.id === ws?.id) return;
    if (openedFileUrl) { URL.revokeObjectURL(openedFileUrl); openedFileUrl = null; $('gc-preview').replaceChildren(); }
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
    participantsHeader($('gc-header'), group.members);
    if (group.paused) $('gc-header').append(h('small', {}, 'Paused'));
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
      if (group.members.includes(m.author)) row.append(button('REPLY', () => { replyTo = m.id; selected = [m.author]; recipientLabel(); $('chat-input').focus(); }));
      log.append(row);
    }
    for (const t of group.turns) if (t.draft) { const row = h('article', { class: 'gc-message cmsg agent' }); row.append(h('span', { class: 'who' }, name(t.agentId).toUpperCase()), h('div', { class: 'body' }, t.draft)); log.append(row); }
    if (bottom) log.scrollTop = log.scrollHeight;
    const states = $('gc-states'); states.replaceChildren();
    for (const t of group.turns.slice(-15)) {
      const needsAttention = ['queued', 'held', 'connecting', 'running', 'waiting for approval', 'stopping'].includes(t.state) ||
        (t === group.turns.at(-1) && ['failed', 'interrupted'].includes(t.state));
      if (!needsAttention) continue;
      const row = h('div', { class: 'gc-state', 'data-turn-id': t.id });
      row.append(document.createTextNode(name(t.agentId) + ': ' + (t.state === 'held' ? 'Ready to continue' : t.state)));
      if (t.state === 'held') row.append(button('Continue', () => action('continue')));
      if (['failed', 'interrupted', 'stopped'].includes(t.state)) row.append(button('RETRY', () => action('retry', { turnId: t.id })));
      if (t.approval) {
        row.append(h('p', {}, t.approval.tool + ': ' + t.approval.argsSummary));
        for (const decision of ['once', 'deny']) row.append(button(decision === 'once' ? 'ALLOW ONCE' : 'DENY', async () => { await api({ op: 'answer', id: group.id, promptId: t.approval.promptId, decision }); }));
      }
      states.append(row);
    }
    const files = $('gc-files'); files.replaceChildren();
    files.parentElement.hidden = !group.artifacts.length;
    for (const f of group.artifacts) files.append(button(f.name, () => openFile(group.id, f)));
    if (!group.artifacts.length) files.textContent = 'Files shared here are available to every participant.';
    recipientLabel();
    if (Chat.refreshGroupControls) Chat.refreshGroupControls();
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
