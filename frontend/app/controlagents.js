/* Moe AI Station — read-only live organization pane for Control Mode.
   Reads only the sanitized /api/control/agents projection. It does not infer hierarchy,
   mutate roster state, or inspect system prompts/credentials. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeAgents) return;

  const ENDPOINT = '/api/control/agents';
  const POLL_MS = 3000;
  let host = null;
  let timer = 0;
  let refreshing = false;
  let generation = 0;

  function make(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function text(v, fallback) {
    return v == null || String(v).trim() === '' ? (fallback || '—') : String(v);
  }
  function installStyle() {
    if (document.getElementById('control-agents-style')) return;
    const s = document.createElement('style');
    s.id = 'control-agents-style';
    s.textContent = `
.cm-org-shell{width:min(1180px,100%);margin:0 auto 28px}.cm-org-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid color-mix(in srgb,currentColor 35%,transparent);padding-top:13px}.cm-org-title{font-size:1rem;letter-spacing:.08em}.cm-org-proof{opacity:.6;font-size:.82em}.cm-org-groups{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:10px;margin-top:10px}.cm-org-tier{border:1px solid color-mix(in srgb,currentColor 30%,transparent);padding:9px;background:rgba(255,255,255,.02)}.cm-org-tier h4{margin:0 0 8px;font-size:.85em;letter-spacing:.08em;text-transform:uppercase}.cm-org-agent{border-top:1px dotted color-mix(in srgb,currentColor 24%,transparent);padding:8px 0}.cm-org-agent:first-of-type{border-top:0}.cm-org-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cm-org-meta{opacity:.65;font-size:.8em;margin-top:3px;overflow-wrap:anywhere}.cm-org-state{text-transform:uppercase}.cm-org-empty,.cm-org-error{opacity:.65;padding:10px 0}.cm-org-parent{opacity:.72}@media(max-width:900px){.cm-org-groups{grid-template-columns:repeat(2,minmax(150px,1fr))}}@media(max-width:520px){.cm-org-groups{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }
  function getPanel() { return document.getElementById('control-mode-panel'); }
  function ensureHost() {
    const panel = getPanel();
    if (!panel) return null;
    if (host && host.isConnected) return host;
    host = make('section', 'cm-org-shell');
    host.id = 'cm-agent-organization';
    host.setAttribute('aria-label', 'Agent organization');
    const detail = panel.querySelector('#cm-task-detail');
    if (detail) panel.insertBefore(host, detail); else panel.appendChild(host);
    return host;
  }
  function isOpen() {
    const panel = getPanel();
    return !!(panel && !panel.hidden);
  }
  async function get() {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(ENDPOINT);
  }
  function renderUnavailable(message) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren();
    const head = make('div', 'cm-org-head');
    head.append(make('div', 'cm-org-title', 'AGENT ORGANIZATION'), make('div', 'cm-org-proof', 'AUTHORITATIVE ROSTER · READ ONLY'));
    root.append(head, make('div', 'cm-org-error', message || 'Agent roster unavailable — no hierarchy is inferred.'));
  }
  function render(body) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren();
    const org = body && body.ok && body.organization && body.organization.schemaVersion === 'moe.control-agents.v1' ? body.organization : null;
    const head = make('div', 'cm-org-head');
    const proof = org && org.evidence
      ? ('ROSTER ' + (org.evidence.rosterKnown ? 'KNOWN' : 'UNKNOWN') + ' · ' + Number(org.evidence.hierarchyEdgesExplicit || 0) + ' EXPLICIT EDGES · 0 INFERRED')
      : 'AUTHORITATIVE ROSTER · READ ONLY';
    head.append(make('div', 'cm-org-title', 'AGENT ORGANIZATION'), make('div', 'cm-org-proof', proof));
    root.appendChild(head);
    if (!org) { root.appendChild(make('div', 'cm-org-error', 'Agent roster unavailable — no hierarchy is inferred.')); return; }
    const groups = Array.isArray(org.groups) ? org.groups : [];
    if (!groups.length || !org.total) { root.appendChild(make('div', 'cm-org-empty', org.evidence && org.evidence.rosterKnown ? 'No agents are currently present in the live roster.' : 'Roster state is unknown.')); return; }
    const grid = make('div', 'cm-org-groups');
    groups.forEach(group => {
      const agents = Array.isArray(group && group.agents) ? group.agents : [];
      if (!agents.length) return;
      const tier = make('section', 'cm-org-tier');
      tier.appendChild(make('h4', '', text(group.role, 'unclassified') + ' · ' + agents.length));
      agents.forEach(agent => {
        const row = make('div', 'cm-org-agent');
        row.appendChild(make('div', 'cm-org-name', text(agent.name, agent.agentId || 'unknown')));
        const status = make('div', 'cm-org-meta cm-org-state', 'STATUS ' + text(agent.status, 'unknown'));
        row.appendChild(status);
        const tech = [agent.provider, agent.model, agent.reasoningEffort].filter(Boolean).join(' · ');
        if (tech) row.appendChild(make('div', 'cm-org-meta', tech));
        if (agent.parentAgentId) row.appendChild(make('div', 'cm-org-meta cm-org-parent', 'REPORTS TO ' + agent.parentAgentId + ' · ' + text(agent.parentSource, 'explicit')));
        else row.appendChild(make('div', 'cm-org-meta cm-org-parent', 'PARENT —'));
        tier.appendChild(row);
      });
      grid.appendChild(tier);
    });
    if (!grid.children.length) root.appendChild(make('div', 'cm-org-empty', 'No classified roster entries are available.'));
    else root.appendChild(grid);
  }
  async function refresh() {
    if (refreshing || !isOpen()) return;
    refreshing = true;
    const token = ++generation;
    try {
      const body = await get();
      if (token === generation && isOpen()) render(body);
    } catch (_) {
      if (token === generation && isOpen()) renderUnavailable('Agent roster unavailable — no hierarchy or live state is inferred.');
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
      .observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    if (isOpen()) start();
  }
  installStyle();
  watchPanel();
  window.ControlModeAgents = Object.freeze({ refresh, endpoint: ENDPOINT, host: () => ensureHost() });
})();
