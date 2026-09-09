/* Moe AI Station — read-only Permission / Approval pane for Control Mode.
   Reads only /api/control/approvals. It never approves, rejects, grants, revokes, or mutates consent state. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeApprovals) return;

  const ENDPOINT = '/api/control/approvals';
  const POLL_MS = 4000;
  let host = null;
  let timer = 0;
  let refreshing = false;
  let generation = 0;

  function make(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function rows(value) { return Array.isArray(value) ? value : []; }
  function label(value, fallback) {
    const text = value == null ? '' : String(value).trim();
    return text || (fallback || '—');
  }
  function fmtWhen(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    try { return new Date(Number(value)).toLocaleString(); } catch (_) { return '—'; }
  }

  function installStyle() {
    if (document.getElementById('control-approval-style')) return;
    const style = document.createElement('style');
    style.id = 'control-approval-style';
    style.textContent = `
.cm-approval-shell{width:min(1180px,100%);margin:0 auto 28px}.cm-approval-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid color-mix(in srgb,currentColor 35%,transparent);padding-top:13px}.cm-approval-title{font-size:1rem;letter-spacing:.08em}.cm-approval-proof{opacity:.6;font-size:.82em}.cm-approval-grid{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:10px;margin-top:10px}.cm-approval-card{border:1px solid color-mix(in srgb,currentColor 28%,transparent);padding:10px;background:rgba(255,255,255,.02);min-width:0}.cm-approval-card h4{margin:0 0 8px;font-size:.88em;letter-spacing:.06em}.cm-approval-row{border-top:1px dotted color-mix(in srgb,currentColor 24%,transparent);padding:7px 0;overflow-wrap:anywhere}.cm-approval-row:first-of-type{border-top:0}.cm-approval-meta{opacity:.65;font-size:.8em;margin-top:3px}.cm-approval-empty,.cm-approval-error{opacity:.65;padding:8px 0}.cm-approval-warning{border:1px solid color-mix(in srgb,currentColor 42%,transparent);padding:8px;margin-top:10px;font-size:.82em}@media(max-width:850px){.cm-approval-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function getPanel() { return document.getElementById('control-mode-panel'); }
  function isOpen() { const panel = getPanel(); return !!(panel && !panel.hidden); }
  function ensureHost() {
    const panel = getPanel();
    if (!panel) return null;
    if (host && host.isConnected) return host;
    host = make('section', 'cm-approval-shell');
    host.id = 'cm-permission-approval-center';
    host.setAttribute('aria-label', 'Permission and approval center');
    const detail = panel.querySelector('#cm-task-detail');
    if (detail) panel.insertBefore(host, detail); else panel.appendChild(host);
    return host;
  }
  async function get() {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(ENDPOINT);
  }

  function header(root, verified) {
    const head = make('div', 'cm-approval-head');
    head.append(
      make('div', 'cm-approval-title', 'PERMISSION / APPROVAL CENTER'),
      make('div', 'cm-approval-proof', verified ? 'AUTHORITATIVE STORES · READ ONLY' : 'READ ONLY')
    );
    root.appendChild(head);
  }
  function renderUnavailable(message) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren(); header(root, false);
    root.appendChild(make('div', 'cm-approval-error', message || 'Approval state unavailable — no grants or prompts are inferred.'));
  }
  function render(body) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren();
    const ok = body && body.ok !== false && body.schemaVersion === 'moe.control-approvals.v1' && body.mode === 'read-only';
    header(root, ok);
    if (!ok) {
      root.appendChild(make('div', 'cm-approval-error', 'Approval state unavailable — no grants or prompts are inferred.'));
      return;
    }

    const evidence = body.evidence || {};
    const grid = make('div', 'cm-approval-grid');

    const permanent = make('section', 'cm-approval-card'); permanent.appendChild(make('h4', '', 'PERMANENT GRANTS'));
    const standing = rows(body.permanent);
    if (!standing.length) permanent.appendChild(make('div', 'cm-approval-empty', 'No permanent grants are recorded.'));
    else standing.forEach(grant => {
      const row = make('div', 'cm-approval-row');
      row.append(make('div', '', label(grant.key)), make('div', 'cm-approval-meta', (grant.grantable ? 'GRANTABLE' : 'NOT GRANTABLE') + ' · GRANTED ' + fmtWhen(grant.grantedAt)));
      permanent.appendChild(row);
    });

    const sessions = make('section', 'cm-approval-card'); sessions.appendChild(make('h4', '', 'SESSION GRANTS'));
    const sessionRows = rows(body.sessions);
    if (!sessionRows.length) sessions.appendChild(make('div', 'cm-approval-empty', 'No session grants are recorded.'));
    else sessionRows.forEach(session => {
      const row = make('div', 'cm-approval-row');
      row.append(make('div', '', label(session.sessionId, 'unknown session')), make('div', 'cm-approval-meta', rows(session.grants).map(v => label(v)).join(' · ') || 'No grant keys'));
      sessions.appendChild(row);
    });

    const pending = make('section', 'cm-approval-card'); pending.appendChild(make('h4', '', 'WAITING FOR CONSENT'));
    const pendingRows = rows(body.pending);
    if (!pendingRows.length) pending.appendChild(make('div', 'cm-approval-empty', 'No consent prompts are currently waiting.'));
    else pendingRows.forEach(item => {
      const row = make('div', 'cm-approval-row');
      row.append(make('div', '', 'PROMPT ' + label(item.promptId)), make('div', 'cm-approval-meta', 'Agent, tool, and action details are unavailable from the authoritative pending store.'));
      pending.appendChild(row);
    });

    grid.append(permanent, sessions, pending); root.appendChild(grid);
    root.appendChild(make('div', 'cm-approval-warning',
      'OBSERVE ONLY · Control Mode exposes no approve, reject, grant, revoke, or bypass action. Pending prompt details are not inferred beyond their real prompt IDs.'));
    root.appendChild(make('div', 'cm-approval-meta',
      'Sources: ' + label(evidence.standingGrantSource) + ' · ' + label(evidence.sessionGrantSource) + ' · ' + label(evidence.pendingSource)));
  }

  async function refresh() {
    if (refreshing || !isOpen()) return;
    refreshing = true;
    const token = ++generation;
    try {
      const body = await get();
      if (token === generation && isOpen()) render(body);
    } catch (_) {
      if (token === generation && isOpen()) renderUnavailable('Approval state unavailable — no grants, sessions, or waiting prompts are inferred.');
    } finally { refreshing = false; }
  }
  function start() {
    ensureHost();
    if (timer) clearInterval(timer);
    refresh();
    timer = setInterval(() => { if (isOpen()) refresh(); }, POLL_MS);
  }
  function stop() {
    generation++;
    if (timer) { clearInterval(timer); timer = 0; }
  }
  function watchPanel() {
    const panel = getPanel();
    if (!panel || typeof MutationObserver !== 'function') return;
    new MutationObserver(() => { if (isOpen()) start(); else stop(); })
      .observe(panel, { attributes:true, attributeFilter:['hidden'] });
    if (isOpen()) start();
  }

  installStyle();
  watchPanel();
  window.ControlModeApprovals = Object.freeze({ refresh, endpoint: ENDPOINT, host: () => ensureHost() });
})();
