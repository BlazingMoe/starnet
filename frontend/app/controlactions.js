/* Moe AI Station — read-only Action Trace pane for Control Mode.
   Reads only /api/control/actions. It never dispatches, retries, resolves, or mutates tool execution state. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeActions) return;

  const ENDPOINT = '/api/control/actions?runs=100&limit=100';
  const POLL_MS = 4000;
  let host = null, timer = 0, refreshing = false, generation = 0;

  function make(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function label(value, fallback) {
    const text = value == null ? '' : String(value).trim();
    return text || (fallback || '—');
  }
  function fmtWhen(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    try { return new Date(Number(value)).toLocaleString(); } catch (_) { return '—'; }
  }
  function installStyle() {
    if (document.getElementById('control-action-style')) return;
    const style = document.createElement('style');
    style.id = 'control-action-style';
    style.textContent = `
.cm-action-shell{width:min(1180px,100%);margin:0 auto 28px}.cm-action-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid color-mix(in srgb,currentColor 35%,transparent);padding-top:13px}.cm-action-title{font-size:1rem;letter-spacing:.08em}.cm-action-proof,.cm-action-meta{opacity:.65;font-size:.8em}.cm-action-list{margin-top:10px;border:1px solid color-mix(in srgb,currentColor 28%,transparent);background:rgba(255,255,255,.02)}.cm-action-row{display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(130px,1fr) minmax(110px,.8fr) minmax(100px,.7fr);gap:10px;padding:9px 10px;border-top:1px dotted color-mix(in srgb,currentColor 24%,transparent);overflow-wrap:anywhere}.cm-action-row:first-child{border-top:0}.cm-action-primary{font-weight:600}.cm-action-warning,.cm-action-error,.cm-action-empty{opacity:.7;padding:9px 10px}.cm-action-warning{border:1px solid color-mix(in srgb,currentColor 42%,transparent);margin-top:10px}@media(max-width:760px){.cm-action-row{grid-template-columns:1fr 1fr}}`;
    document.head.appendChild(style);
  }
  function getPanel() { return document.getElementById('control-mode-panel'); }
  function isOpen() { const panel = getPanel(); return !!(panel && !panel.hidden); }
  function ensureHost() {
    const panel = getPanel();
    if (!panel) return null;
    if (host && host.isConnected) return host;
    host = make('section', 'cm-action-shell');
    host.id = 'cm-action-trace';
    host.setAttribute('aria-label', 'Action trace');
    const detail = panel.querySelector('#cm-task-detail');
    if (detail) panel.insertBefore(host, detail); else panel.appendChild(host);
    return host;
  }
  async function get() {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(ENDPOINT);
  }
  function header(root, verified) {
    const head = make('div', 'cm-action-head');
    head.append(make('div', 'cm-action-title', 'ACTION TRACE'), make('div', 'cm-action-proof', verified ? 'RUN JOURNAL · READ ONLY' : 'READ ONLY'));
    root.appendChild(head);
  }
  function renderUnavailable(message) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren(); header(root, false);
    root.appendChild(make('div', 'cm-action-error', message || 'Action trace unavailable — no tool calls or outcomes are inferred.'));
  }
  function render(body) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren();
    const trace = body && body.ok && body.trace && body.trace.schemaVersion === 'moe.control-actions.v1' ? body.trace : null;
    header(root, !!trace);
    if (!trace) {
      root.appendChild(make('div', 'cm-action-error', 'Action trace unavailable — no tool calls or outcomes are inferred.'));
      return;
    }
    const rows = Array.isArray(trace.rows) ? trace.rows : [];
    if (!rows.length) root.appendChild(make('div', 'cm-action-empty', 'No journal-backed tool actions are present in this page.'));
    else {
      const list = make('div', 'cm-action-list');
      rows.forEach(item => {
        const row = make('div', 'cm-action-row');
        row.append(
          make('div', 'cm-action-primary', label(item.tool, 'unknown tool')),
          make('div', '', label(item.phase, 'unknown phase')),
          make('div', '', item.mutating === true ? 'MUTATING' : (item.mutating === false ? 'READ' : 'UNKNOWN')),
          make('div', '', item.ok === true ? 'OK' : (item.ok === false || item.isError === true ? 'ERROR' : '—'))
        );
        row.appendChild(make('div', 'cm-action-meta', 'RUN ' + label(item.runId) + ' · AGENT ' + label(item.agentId)));
        row.appendChild(make('div', 'cm-action-meta', 'CALL ' + label(item.callId)));
        row.appendChild(make('div', 'cm-action-meta', 'STARTED ' + fmtWhen(item.startedAt)));
        row.appendChild(make('div', 'cm-action-meta', item.summary ? 'SUMMARY ' + label(item.summary) : 'No result summary is recorded.'));
        list.appendChild(row);
      });
      root.appendChild(list);
    }
    const evidence = trace.evidence || {};
    root.appendChild(make('div', 'cm-action-warning', 'OBSERVE ONLY · Tool arguments, raw result content, replay fingerprints, retries, and mutation controls are intentionally absent.'));
    root.appendChild(make('div', 'cm-action-meta', 'Source: ' + label(evidence.source) + ' · Journal runs ' + label(evidence.journalRuns) + ' · Returned actions ' + label(evidence.returnedRows) + (evidence.bounded ? ' · BOUNDED' : '')));
  }
  async function refresh() {
    if (refreshing || !isOpen()) return;
    refreshing = true;
    const token = ++generation;
    try {
      const body = await get();
      if (token === generation && isOpen()) render(body);
    } catch (_) {
      if (token === generation && isOpen()) renderUnavailable('Action trace unavailable — no tool calls, phases, or outcomes are inferred.');
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

  installStyle();
  watchPanel();
  window.ControlModeActions = Object.freeze({ refresh, endpoint: ENDPOINT, host: () => ensureHost() });
})();
