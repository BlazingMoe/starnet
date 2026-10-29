/* Moe AI Station — read-only Memory / Provenance pane for Control Mode.
   Reads only the content-free /api/control/memory projection. It never requests or renders
   memory title/body/content, and never exposes edit/pin/forget controls from the Memory Core. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeMemory) return;

  const ENDPOINT = '/api/control/memory?perAgent=12';
  const POLL_MS = 5000;
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
  function pct(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return Math.max(0, Math.min(100, Math.round(Number(value) * 100))) + '%';
  }
  function num(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : String(Math.max(0, Math.floor(Number(value))));
  }
  function label(value, fallback) {
    const text = value == null ? '' : String(value).trim();
    return text || (fallback || '—');
  }
  function fmtWhen(ts) {
    if (!ts) return '—';
    try { return new Date(Number(ts)).toLocaleString(); } catch (_) { return '—'; }
  }
  function entries(obj) {
    return obj && typeof obj === 'object'
      ? Object.keys(obj).map(key => [key, Number(obj[key]) || 0]).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      : [];
  }

  function installStyle() {
    if (document.getElementById('control-memory-style')) return;
    const style = document.createElement('style');
    style.id = 'control-memory-style';
    style.textContent = `
.cm-memory-shell{width:min(1180px,100%);margin:0 auto 28px}.cm-memory-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid color-mix(in srgb,currentColor 35%,transparent);padding-top:13px}.cm-memory-title{font-size:1rem;letter-spacing:.08em}.cm-memory-proof{opacity:.6;font-size:.82em}.cm-memory-cards{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:9px;margin-top:10px}.cm-memory-card{border:1px solid color-mix(in srgb,currentColor 28%,transparent);padding:9px;background:rgba(255,255,255,.02)}.cm-memory-card-k{opacity:.62;font-size:.78em;letter-spacing:.06em}.cm-memory-card-v{font-size:1.2rem;margin-top:3px}.cm-memory-agents{display:grid;grid-template-columns:repeat(2,minmax(250px,1fr));gap:10px;margin-top:10px}.cm-memory-agent{border:1px solid color-mix(in srgb,currentColor 28%,transparent);padding:10px;background:rgba(255,255,255,.018)}.cm-memory-agent-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.cm-memory-agent-name{font-weight:600}.cm-memory-known{font-size:.78em;opacity:.65;text-transform:uppercase}.cm-memory-meta{opacity:.67;font-size:.8em;margin-top:4px;overflow-wrap:anywhere}.cm-memory-records{margin-top:8px}.cm-memory-record{border-top:1px dotted color-mix(in srgb,currentColor 24%,transparent);padding:7px 0}.cm-memory-record:first-child{border-top:0}.cm-memory-record-name{font-size:.88em}.cm-memory-error,.cm-memory-empty{opacity:.65;padding:10px 0}@media(max-width:760px){.cm-memory-cards{grid-template-columns:repeat(2,minmax(120px,1fr))}.cm-memory-agents{grid-template-columns:1fr}} `;
    document.head.appendChild(style);
  }

  function getPanel() { return document.getElementById('control-mode-panel'); }
  function isOpen() {
    const panel = getPanel();
    return !!(panel && !panel.hidden);
  }
  function ensureHost() {
    const panel = getPanel();
    if (!panel) return null;
    if (host && host.isConnected) return host;
    host = make('section', 'cm-memory-shell');
    host.id = 'cm-memory-provenance';
    host.setAttribute('aria-label', 'Memory provenance');
    const detail = panel.querySelector('#cm-task-detail');
    if (detail) panel.insertBefore(host, detail); else panel.appendChild(host);
    return host;
  }
  async function get() {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(ENDPOINT);
  }

  function renderUnavailable(message) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren();
    const head = make('div', 'cm-memory-head');
    head.append(make('div', 'cm-memory-title', 'MEMORY / PROVENANCE'), make('div', 'cm-memory-proof', 'CONTENT HIDDEN · READ ONLY'));
    root.append(head, make('div', 'cm-memory-error', message || 'Memory provenance unavailable — no record counts are inferred.'));
  }

  function render(body) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren();
    const overview = body && body.ok && body.overview && body.overview.schemaVersion === 'moe.control-memory.v1' ? body.overview : null;
    const head = make('div', 'cm-memory-head');
    head.append(
      make('div', 'cm-memory-title', 'MEMORY / PROVENANCE'),
      make('div', 'cm-memory-proof', overview ? 'CONTENT HIDDEN · PROVENANCE/TRUST ONLY · READ ONLY' : 'CONTENT HIDDEN · READ ONLY')
    );
    root.appendChild(head);
    if (!overview) {
      root.appendChild(make('div', 'cm-memory-error', 'Memory provenance unavailable — no record counts are inferred.'));
      return;
    }

    const totals = overview.totals || {};
    const cards = make('div', 'cm-memory-cards');
    [
      ['RECORDS', num(totals.records)],
      ['PINNED', num(totals.pinned)],
      ['SOURCE-RUN LINKED', num(totals.withSourceRun)],
      ['KNOWN AGENTS', num(totals.knownAgents)]
    ].forEach(([key,value]) => {
      const card = make('div', 'cm-memory-card');
      card.append(make('div', 'cm-memory-card-k', key), make('div', 'cm-memory-card-v', value));
      cards.appendChild(card);
    });
    root.appendChild(cards);

    const agents = Array.isArray(overview.agents) ? overview.agents : [];
    if (!agents.length) {
      root.appendChild(make('div', 'cm-memory-empty', 'No agents are present in the authoritative roster.'));
      return;
    }

    const grid = make('div', 'cm-memory-agents');
    agents.forEach(agent => {
      const box = make('section', 'cm-memory-agent');
      const boxHead = make('div', 'cm-memory-agent-head');
      boxHead.append(
        make('div', 'cm-memory-agent-name', label(agent.name, agent.agentId)),
        make('div', 'cm-memory-known', agent.known ? 'KNOWN' : 'UNKNOWN')
      );
      box.appendChild(boxHead);
      if (!agent.known) {
        box.appendChild(make('div', 'cm-memory-meta', 'Store unavailable — record count, trust and provenance remain unknown.'));
        grid.appendChild(box); return;
      }

      box.appendChild(make('div', 'cm-memory-meta',
        'RECORDS ' + num(agent.total) + ' · PINNED ' + num(agent.pinned) + ' · SOURCE-RUN ' + num(agent.withSourceRun) +
        ' · AVG EFFECTIVE TRUST ' + pct(agent.averageEffectiveTrust)));
      const scopes = entries(agent.scopes).slice(0,4).map(([k,v]) => k + ' ' + v).join(' · ');
      const origins = entries(agent.origins).slice(0,4).map(([k,v]) => k + ' ' + v).join(' · ');
      if (scopes) box.appendChild(make('div', 'cm-memory-meta', 'SCOPES ' + scopes));
      if (origins) box.appendChild(make('div', 'cm-memory-meta', 'ORIGINS ' + origins));

      const records = Array.isArray(agent.records) ? agent.records : [];
      if (records.length) {
        const list = make('div', 'cm-memory-records');
        records.forEach(record => {
          const row = make('div', 'cm-memory-record');
          row.appendChild(make('div', 'cm-memory-record-name',
            [label(record.kind, 'note'), label(record.scope, 'global'), label(record.origin, 'commander')].join(' · ')));
          row.appendChild(make('div', 'cm-memory-meta',
            'ID ' + label(record.id) + ' · SOURCE RUN ' + label(record.sourceRunId) + ' · CREATED ' + fmtWhen(record.createdAt)));
          row.appendChild(make('div', 'cm-memory-meta',
            'TRUST ' + pct(record.effectiveTrust) + ' · EARNED ' + pct(record.trust) + ' · USES ' + num(record.useCount) +
            (record.pinned ? ' · PINNED' : '')));
          list.appendChild(row);
        });
        box.appendChild(list);
      } else box.appendChild(make('div', 'cm-memory-meta', 'No durable memory records are present for this agent.'));
      grid.appendChild(box);
    });
    root.appendChild(grid);
    root.appendChild(make('div', 'cm-memory-meta', 'Memory text is intentionally hidden in Control Mode. Use the dedicated Memory Core when you need to inspect or edit content.'));
  }

  async function refresh() {
    if (refreshing || !isOpen()) return;
    refreshing = true;
    const token = ++generation;
    try {
      const body = await get();
      if (token === generation && isOpen()) render(body);
    } catch (_) {
      if (token === generation && isOpen()) renderUnavailable('Memory provenance unavailable — no record counts, trust, or source-run links are inferred.');
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
  function loadApprovalPane() {
    if (window.ControlModeApprovals) return;
    if (typeof document.createElement !== 'function' || !document.head || typeof document.head.appendChild !== 'function') return;
    if (document.getElementById('mo-control-mode-approvals')) return;
    const script = document.createElement('script');
    script.id = 'mo-control-mode-approvals';
    script.src = 'app/controlapprovals.js';
    script.async = false;
    document.head.appendChild(script);
  }

  installStyle();
  watchPanel();
  loadApprovalPane();
  window.ControlModeMemory = Object.freeze({ refresh, endpoint: ENDPOINT, host: () => ensureHost() });
})();
