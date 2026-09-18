/* Moe AI Station — read-only Cost / Budget pane for Control Mode.
   Reads only /api/control/costs. It never changes caps, budgets, billing, or ledger state. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeCosts) return;

  const ENDPOINT = '/api/control/costs';
  const POLL_MS = 5000;
  let host = null, timer = 0, refreshing = false, generation = 0;

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
  function num(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : String(Math.max(0, Math.floor(Number(value))));
  }
  function usd(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : '$' + Math.max(0, Number(value)).toFixed(4);
  }
  function pct(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : Math.max(0, Number(value) * 100).toFixed(1) + '%';
  }

  function installStyle() {
    if (document.getElementById('control-cost-style')) return;
    const style = document.createElement('style');
    style.id = 'control-cost-style';
    style.textContent = `
.cm-cost-shell{width:min(1180px,100%);margin:0 auto 28px}.cm-cost-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid color-mix(in srgb,currentColor 35%,transparent);padding-top:13px}.cm-cost-title{font-size:1rem;letter-spacing:.08em}.cm-cost-proof,.cm-cost-meta{opacity:.65;font-size:.8em}.cm-cost-cards{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:9px;margin-top:10px}.cm-cost-card,.cm-cost-box{border:1px solid color-mix(in srgb,currentColor 28%,transparent);padding:9px;background:rgba(255,255,255,.02);min-width:0}.cm-cost-card-k{opacity:.62;font-size:.78em;letter-spacing:.06em}.cm-cost-card-v{font-size:1.18rem;margin-top:3px}.cm-cost-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:10px;margin-top:10px}.cm-cost-box h4{margin:0 0 8px;font-size:.88em;letter-spacing:.06em}.cm-cost-row{border-top:1px dotted color-mix(in srgb,currentColor 24%,transparent);padding:7px 0;overflow-wrap:anywhere}.cm-cost-row:first-of-type{border-top:0}.cm-cost-warning,.cm-cost-error,.cm-cost-empty{opacity:.7;padding:9px 10px}.cm-cost-warning{border:1px solid color-mix(in srgb,currentColor 42%,transparent);margin-top:10px}@media(max-width:760px){.cm-cost-cards{grid-template-columns:repeat(2,minmax(120px,1fr))}.cm-cost-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }
  function getPanel() { return document.getElementById('control-mode-panel'); }
  function isOpen() { const panel = getPanel(); return !!(panel && !panel.hidden); }
  function ensureHost() {
    const panel = getPanel();
    if (!panel) return null;
    if (host && host.isConnected) return host;
    host = make('section', 'cm-cost-shell');
    host.id = 'cm-cost-budget';
    host.setAttribute('aria-label', 'Cost and budget overview');
    const detail = panel.querySelector('#cm-task-detail');
    if (detail) panel.insertBefore(host, detail); else panel.appendChild(host);
    return host;
  }
  async function get() {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(ENDPOINT);
  }
  function header(root, verified) {
    const head = make('div', 'cm-cost-head');
    head.append(make('div', 'cm-cost-title', 'COST / BUDGET'), make('div', 'cm-cost-proof', verified ? 'SPEND LEDGER + BUDGET GOVERNOR · READ ONLY' : 'READ ONLY'));
    root.appendChild(head);
  }
  function renderUnavailable(message) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren(); header(root, false);
    root.appendChild(make('div', 'cm-cost-error', message || 'Cost and budget state unavailable — no spend, token, or cap values are inferred.'));
  }
  function render(body) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren();
    const overview = body && body.ok && body.overview && body.overview.schemaVersion === 'moe.control-costs.v1' ? body.overview : null;
    header(root, !!overview);
    if (!overview) {
      root.appendChild(make('div', 'cm-cost-error', 'Cost and budget state unavailable — no spend, token, or cap values are inferred.'));
      return;
    }

    const totals = overview.totals || {};
    const cards = make('div', 'cm-cost-cards');
    [
      ['METERED USD', usd(totals.meteredUsd)],
      ['RUNS', num(totals.runs)],
      ['TOKENS', num(totals.tokens)],
      ['UNMETERED RUNS', num(totals.unmeteredRuns)]
    ].forEach(([key,value]) => {
      const card = make('div', 'cm-cost-card');
      card.append(make('div', 'cm-cost-card-k', key), make('div', 'cm-cost-card-v', value));
      cards.appendChild(card);
    });
    root.appendChild(cards);

    const budgets = overview.budgets || {};
    const grid = make('div', 'cm-cost-grid');
    const budgetBox = make('section', 'cm-cost-box');
    budgetBox.appendChild(make('h4', '', 'BUDGET GOVERNOR'));
    [
      ['LIVE USD', usd(overview.liveUsd)],
      ['PER RUN CAP', usd(budgets.perRun)],
      ['PER AGENT CAP', usd(budgets.perAgent)],
      ['PER DAY CAP', usd(budgets.perDay)],
      ['GLOBAL CAP', usd(budgets.globalCap)]
    ].forEach(([key,value]) => {
      const row = make('div', 'cm-cost-row'); row.append(make('div', '', key + ' · ' + value)); budgetBox.appendChild(row);
    });
    if (budgets.day) budgetBox.appendChild(make('div', 'cm-cost-meta', 'DAY POOL ' + usd(budgets.day.usd) + ' / ' + usd(budgets.day.cap) + ' · ' + pct(budgets.day.fraction)));
    if (budgets.global) budgetBox.appendChild(make('div', 'cm-cost-meta', 'GLOBAL POOL ' + usd(budgets.global.usd) + ' / ' + usd(budgets.global.cap) + ' · ' + pct(budgets.global.fraction)));

    const agentsBox = make('section', 'cm-cost-box'); agentsBox.appendChild(make('h4', '', 'AGENTS'));
    const agents = rows(overview.agents).slice(0,20);
    if (!agents.length) agentsBox.appendChild(make('div', 'cm-cost-empty', 'No ledger-backed agent rows are present.'));
    else agents.forEach(agent => {
      const row = make('div', 'cm-cost-row');
      row.append(make('div', '', label(agent.name, agent.agentId)), make('div', 'cm-cost-meta', 'METERED ' + usd(agent.meteredUsd) + ' · RUNS ' + num(agent.runs) + ' · TOKENS ' + num(agent.tokens) + ' · UNMETERED ' + num(agent.unmeteredRuns) + (agent.current ? ' · CURRENT' : ' · HISTORICAL')));
      agentsBox.appendChild(row);
    });

    const modelsBox = make('section', 'cm-cost-box'); modelsBox.appendChild(make('h4', '', 'MODELS'));
    const models = rows(overview.models);
    if (!models.length) modelsBox.appendChild(make('div', 'cm-cost-empty', 'No ledger-backed model rows are present.'));
    else models.forEach(model => {
      const row = make('div', 'cm-cost-row');
      row.append(make('div', '', label(model.model, '(unknown)')), make('div', 'cm-cost-meta', 'METERED ' + usd(model.meteredUsd) + ' · RUNS ' + num(model.runs) + ' · TOKENS ' + num(model.tokens) + ' · UNMETERED ' + num(model.unmeteredRuns)));
      modelsBox.appendChild(row);
    });

    const evidenceBox = make('section', 'cm-cost-box'); evidenceBox.appendChild(make('h4', '', 'EVIDENCE'));
    const evidence = overview.evidence || {};
    evidenceBox.appendChild(make('div', 'cm-cost-row', 'LEDGER ROWS · ' + num(evidence.ledgerRows)));
    evidenceBox.appendChild(make('div', 'cm-cost-meta', evidence.budgetGovernorKnown ? 'Budget governor status is present.' : 'Budget governor status is unavailable; no governor state is inferred.'));
    evidenceBox.appendChild(make('div', 'cm-cost-meta', evidence.unmeteredExcludedFromMeteredUsd ? 'Unmetered/subscription runs are excluded from metered USD.' : 'Metering exclusion evidence unavailable.'));

    grid.append(budgetBox, agentsBox, modelsBox, evidenceBox); root.appendChild(grid);
    root.appendChild(make('div', 'cm-cost-warning', 'OBSERVE ONLY · Control Mode cannot change caps, budgets, billing, or ledger records. Displayed values come from the existing spend ledger and budget governor projection.'));
  }
  async function refresh() {
    if (refreshing || !isOpen()) return;
    refreshing = true;
    const token = ++generation;
    try {
      const body = await get();
      if (token === generation && isOpen()) render(body);
    } catch (_) {
      if (token === generation && isOpen()) renderUnavailable('Cost and budget state unavailable — no spend, token, cap, or governor values are inferred.');
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
    new MutationObserver(() => { if (isOpen()) start(); else stop(); }).observe(panel, { attributes:true, attributeFilter:['hidden'] });
    if (isOpen()) start();
  }
  function loadProviderPane() {
    if (window.ControlModeProviders) return;
    if (typeof document.createElement !== 'function' || !document.head || typeof document.head.appendChild !== 'function') return;
    if (document.getElementById('mo-control-mode-providers')) return;
    const script = document.createElement('script');
    script.id = 'mo-control-mode-providers';
    script.src = 'app/controlproviders.js';
    script.async = false;
    document.head.appendChild(script);
  }

  installStyle();
  watchPanel();
  loadProviderPane();
  window.ControlModeCosts = Object.freeze({ refresh, endpoint: ENDPOINT, host: () => ensureHost() });
})();
