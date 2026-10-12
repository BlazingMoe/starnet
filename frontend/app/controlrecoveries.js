/* Moe AI Station — read-only managed recovery pane for Control Mode.
   Pages the authoritative managed-task-history projection with a filter-bound cursor. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeRecoveries) return;
  const LIMIT = 100;
  const POLL_MS = 4000;
  const DISPOSITIONS = ['', 'SAFE_RESTART', 'RECONCILE_BEFORE_RETRY', 'RECONCILED_APPLIED'];
  let host = null, timer = 0, refreshing = false, loadingMore = false, editingFilters = false, generation = 0;
  let filters = { agent: '', disposition: '' };
  let draftFilters = { agent: '', disposition: '' };
  let firstRows = [], olderRows = [], firstPageCursor = '', nextCursor = '', hasMore = false, storageTruncated = false;
  let notice = '';

  function make(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function label(value, fallback) { const text = value == null ? '' : String(value).trim(); return text || (fallback || '—'); }
  function installStyle() {
    if (!document.head || document.getElementById('control-recovery-style')) return;
    const style = make('style'); style.id = 'control-recovery-style';
    style.textContent = '.cm-recovery-filters{display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin-top:10px}.cm-recovery-filter-label{display:grid;gap:4px;opacity:.8;font-size:.84em}.cm-recovery-filter{font:inherit;color:inherit;background:rgba(0,0,0,.18);border:1px solid color-mix(in srgb,currentColor 35%,transparent);padding:7px 9px;min-width:180px}.cm-recovery-filter:focus-visible,.cm-recovery-filters button:focus-visible{outline:2px solid currentColor;outline-offset:2px}@media(max-width:560px){.cm-recovery-filter-label,.cm-recovery-filter{width:100%;min-width:0}}';
    document.head.appendChild(style);
  }
  function panel() { return document.getElementById('control-mode-panel'); }
  function isOpen() { const root = panel(); return !!(root && !root.hidden); }
  function ensureHost() {
    const root = panel(); if (!root) return null;
    if (host && host.isConnected) return host;
    host = make('section', 'cm-action-shell'); host.id = 'cm-managed-recoveries';
    host.setAttribute('aria-label', 'Managed task recovery status');
    const detail = root.querySelector('#cm-task-detail');
    if (detail) root.insertBefore(host, detail); else root.appendChild(host);
    return host;
  }
  function endpoint(cursor, selected) {
    const query = new URLSearchParams();
    query.set('limit', String(LIMIT));
    if (selected.agent) query.set('agent', selected.agent);
    if (selected.disposition) query.set('disposition', selected.disposition);
    if (cursor) query.set('cursor', cursor);
    return '/api/managed-task-recoveries?' + query.toString();
  }
  async function get(cursor, selected) {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(endpoint(cursor, selected));
  }
  function header(root, verified) {
    const head = make('div', 'cm-action-head');
    head.append(make('div', 'cm-action-title', 'RECOVERY STATUS'), make('div', 'cm-action-proof', verified ? 'TASK HISTORY · READ ONLY' : 'READ ONLY'));
    root.appendChild(head);
  }
  function uniqueRows(rows) {
    const seen = new Set();
    return rows.filter(row => row && typeof row.taskId === 'string' && row.taskId && !seen.has(row.taskId) && seen.add(row.taskId));
  }
  function resetPages() { firstRows = []; olderRows = []; firstPageCursor = ''; nextCursor = ''; hasMore = false; storageTruncated = false; }
  function renderUnavailable(message) {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren(); header(root, false);
    root.appendChild(make('div', 'cm-action-error', message || 'Recovery status unavailable — no task outcome or retry safety is inferred.'));
    const reload = make('button', 'cm-refresh', 'Reload recovery history'); reload.type = 'button';
    reload.addEventListener('click', () => { loadingMore = false; editingFilters = false; resetPages(); notice = ''; refresh(true); }); root.appendChild(reload);
  }
  function renderLoading() {
    const root = ensureHost(); if (!root) return;
    root.replaceChildren(); header(root, false);
    root.appendChild(make('div', 'cm-action-meta', 'Loading current recovery evidence — retry safety is not yet known.'));
  }
  function readPage(body) {
    const view = body && body.ok && body.recoveries && body.recoveries.schemaVersion === 'moe.control-recoveries.v1' ? body.recoveries : null;
    const evidence = view && view.evidence;
    const page = body && body.page;
    const valid = view && Array.isArray(view.rows) && view.rows.every(row => row && typeof row === 'object' && !Array.isArray(row)) &&
      evidence && evidence.source === 'managed-task-history' && evidence.authoritative === true &&
      typeof evidence.bounded === 'boolean' && evidence.returnedRows === view.rows.length &&
      typeof evidence.hasMore === 'boolean' && typeof evidence.storageTruncated === 'boolean' &&
      page && typeof page.hasMore === 'boolean' && typeof page.storageTruncated === 'boolean' &&
      page.hasMore === evidence.hasMore && page.storageTruncated === evidence.storageTruncated &&
      typeof page.nextCursor === 'string' && (page.hasMore ? page.nextCursor.length > 0 : page.nextCursor === '');
    return valid ? { rows: view.rows, hasMore: page.hasMore, storageTruncated: page.storageTruncated, nextCursor: page.nextCursor } : null;
  }
  function filterControls(root) {
    const form = make('form', 'cm-recovery-filters'); form.setAttribute('aria-label', 'Filter recovery history');
    const agentLabel = make('label', 'cm-recovery-filter-label', 'Agent ID');
    const agent = make('input', 'cm-recovery-filter'); agent.type = 'text'; agent.maxLength = 80;
    agent.value = draftFilters.agent; agent.setAttribute('autocomplete', 'off'); agent.setAttribute('aria-label', 'Filter by agent ID');
    agent.addEventListener('focus', () => { editingFilters = true; });
    agent.addEventListener('blur', () => { editingFilters = false; });
    agent.addEventListener('input', () => { draftFilters.agent = String(agent.value || '').slice(0, 80); });
    agentLabel.appendChild(agent);
    const dispositionLabel = make('label', 'cm-recovery-filter-label', 'Disposition');
    const disposition = make('select', 'cm-recovery-filter'); disposition.setAttribute('aria-label', 'Filter by recovery disposition');
    disposition.addEventListener('focus', () => { editingFilters = true; });
    disposition.addEventListener('blur', () => { editingFilters = false; });
    const names = new Map([['', 'All dispositions'], ['SAFE_RESTART', 'Safe to restart'],
      ['RECONCILE_BEFORE_RETRY', 'Do not retry / reconcile'], ['RECONCILED_APPLIED', 'Already applied']]);
    DISPOSITIONS.forEach(value => {
      const option = make('option', '', names.get(value)); option.value = value; option.selected = draftFilters.disposition === value;
      disposition.appendChild(option);
    });
    disposition.addEventListener('change', () => { draftFilters.disposition = DISPOSITIONS.includes(disposition.value) ? disposition.value : ''; });
    dispositionLabel.appendChild(disposition);
    const apply = make('button', 'cm-refresh', 'Apply filters'); apply.type = 'submit';
    form.append(agentLabel, dispositionLabel, apply); form.addEventListener('submit', event => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const next = { agent: String(agent.value || '').trim().slice(0, 80), disposition: DISPOSITIONS.includes(disposition.value) ? disposition.value : '' };
      draftFilters = { ...next };
      if (next.agent === filters.agent && next.disposition === filters.disposition) return;
      filters = next; generation++; refreshing = false; loadingMore = false; editingFilters = false; resetPages(); notice = '';
      renderLoading(); return refresh(true);
    });
    root.appendChild(form);
  }
  function render(body, appendPage) {
    const root = ensureHost(); if (!root) return;
    const page = readPage(body);
    if (!page) { renderUnavailable(); return; }
    if (appendPage) {
      const known = new Set(firstRows.concat(olderRows).map(row => row.taskId));
      olderRows = olderRows.concat(page.rows.filter(row => !known.has(row.taskId)));
      nextCursor = page.nextCursor;
      hasMore = page.hasMore;
      storageTruncated = page.storageTruncated;
      notice = '';
    } else {
      const ids = rows => rows.map(row => row.taskId).join('\u0000');
      const firstChanged = firstRows.length > 0 && (ids(firstRows) !== ids(page.rows) || firstPageCursor !== page.nextCursor);
      if (firstChanged && olderRows.length) {
        olderRows = [];
        notice = 'The recovery queue changed; older pages were cleared so the history stays in order. Load older records again if needed.';
      }
      firstRows = page.rows;
      firstPageCursor = page.nextCursor;
      if (!olderRows.length || firstChanged) {
        nextCursor = page.nextCursor;
        hasMore = page.hasMore;
      }
      storageTruncated = page.storageTruncated;
    }
    const rows = uniqueRows(firstRows.concat(olderRows));
    root.replaceChildren(); header(root, true); filterControls(root);
    if (notice) root.appendChild(make('div', 'cm-action-meta', notice));
    const safe = rows.filter(row => row.operatorState === 'SAFE TO RESTART').length;
    const blocked = rows.filter(row => row.operatorState === 'DO NOT RETRY').length;
    const review = rows.length - safe - blocked;
    const summary = make('div', 'cm-action-warning', 'RECOVERY HISTORY · ' + rows.length + ' SHOWN · ' + safe + ' SAFE TO RESTART · ' + blocked + ' DO NOT RETRY · ' + review + ' REVIEW');
    summary.setAttribute('aria-label', 'Recovery history summary'); root.appendChild(summary);
    if (storageTruncated) root.appendChild(make('div', 'cm-action-warning', 'The in-memory recovery window has dropped older checkpoints. Records beyond that retained window cannot be loaded.'));
    if (!rows.length) root.appendChild(make('div', 'cm-action-empty', filters.agent || filters.disposition ? 'No recovery records match these filters.' : storageTruncated ? 'No recoveries are shown in the retained window; older checkpoints were dropped.' : 'No managed tasks currently require recovery.'));
    else {
      const list = make('div', 'cm-action-list');
      rows.forEach(item => {
        const row = make('div', 'cm-action-row');
        if (item.taskId && window.ControlModeUI && typeof window.ControlModeUI.inspectTask === 'function') {
          row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', 'Open durable task history for ' + item.taskId);
          const inspect = () => window.ControlModeUI.inspectTask(item.taskId, row, item);
          row.addEventListener('click', inspect); row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(); } });
        }
        row.append(make('div', 'cm-action-primary', label(item.taskId, 'unknown task')), make('div', '', label(item.disposition, 'unknown disposition')),
          make('div', '', label(item.stage, 'unknown stage')), make('div', '', label(item.operatorState, 'REVIEW')));
        row.appendChild(make('div', 'cm-action-meta', 'STATE ' + label(item.state) + ' · ' + label(item.reason)));
        row.appendChild(make('div', 'cm-action-meta', 'RECONCILIATION ' + label(item.reconciliationOutcome) + ' · DECISION ' + label(item.reconciliationDecision)));
        row.appendChild(make('div', 'cm-action-meta', 'WHY · ' + label(item.operatorMeaning, 'No operator guidance is available from the durable projection.')));
        row.appendChild(make('div', 'cm-action-meta', 'NEXT · ' + label(item.nextMove, 'No automatic retry is authorized from the evidence currently shown.')));
        list.appendChild(row);
      });
      root.appendChild(list);
    }
    if (hasMore) {
      const more = make('button', 'cm-refresh', loadingMore ? 'Loading older records…' : 'Load older recovery records');
      more.type = 'button'; more.disabled = loadingMore; more.setAttribute('aria-label', 'Load older recovery records');
      more.addEventListener('click', loadMore); root.appendChild(more);
    }
    root.appendChild(make('div', 'cm-action-warning', 'OBSERVE ONLY · Provider references and task content are intentionally hidden. This pane never retries or resolves work.'));
    root.appendChild(make('div', 'cm-action-meta', 'Source: managed-task-history · ' + (rows.length ? rows.length + ' loaded' : '0 loaded') + (hasMore ? ' · MORE AVAILABLE' : '') + (storageTruncated ? ' · OLDER CHECKPOINTS NOT RETAINED' : '')));
  }
  function cursorExpiredMessage(error) {
    return error && /^http (400|410)$/.test(String(error.message || ''))
      ? 'The recovery cursor is invalid or expired. Reload the recovery history to start a fresh page sequence.'
      : 'Recovery history unavailable — no task outcome or retry safety is inferred.';
  }
  async function refresh(force) {
    if (!isOpen() || loadingMore || (editingFilters && force !== true)) return;
    const token = ++generation; refreshing = true;
    try {
      const body = await get('', filters);
      if (token === generation && isOpen() && !editingFilters) render(body);
    } catch (error) {
      if (token === generation && isOpen() && !editingFilters) renderUnavailable(cursorExpiredMessage(error));
    } finally { if (token === generation) refreshing = false; }
  }
  async function loadMore() {
    if (loadingMore || refreshing || !hasMore || !nextCursor || !isOpen()) return;
    const token = generation, cursor = nextCursor, selected = { ...filters }; loadingMore = true;
    render({ ok: true, recoveries: { schemaVersion: 'moe.control-recoveries.v1', rows: firstRows,
      evidence: { source: 'managed-task-history', authoritative: true, returnedRows: firstRows.length, bounded: true, hasMore, storageTruncated } },
      page: { hasMore, storageTruncated, nextCursor: firstPageCursor } });
    try {
      const body = await get(cursor, selected);
      if (token !== generation || !isOpen()) return;
      const page = readPage(body);
      if (!page) { renderUnavailable(); return; }
      loadingMore = false;
      render(body, true);
    } catch (error) {
      if (token !== generation || !isOpen()) return;
      if (/^http (400|410)$/.test(String(error && error.message || ''))) {
        resetPages(); loadingMore = false; renderUnavailable(cursorExpiredMessage(error));
      } else renderUnavailable(cursorExpiredMessage(error));
    } finally { if (token === generation) loadingMore = false; }
  }
  function start() { renderLoading(); if (timer) clearInterval(timer); refresh(); timer = setInterval(() => { if (isOpen() && !refreshing && !loadingMore) return refresh(); }, POLL_MS); }
  function stop() { generation++; refreshing = false; loadingMore = false; editingFilters = false; if (timer) { clearInterval(timer); timer = 0; } }
  function watch() {
    const root = panel(); if (!root || typeof MutationObserver !== 'function') return;
    new MutationObserver(() => { if (isOpen()) start(); else stop(); }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
    if (isOpen()) start();
  }
  function loadNightshiftPane() {
    if (window.ControlModeNightshift || typeof document.createElement !== 'function' || !document.head || typeof document.head.appendChild !== 'function') return;
    if (document.getElementById('mo-control-mode-nightshift')) return;
    const script = document.createElement('script'); script.id = 'mo-control-mode-nightshift'; script.src = 'app/controlnightshift.js'; script.async = false; document.head.appendChild(script);
  }
  installStyle(); watch(); loadNightshiftPane();
  window.ControlModeRecoveries = Object.freeze({ refresh, endpoint: endpoint('', filters), host: () => ensureHost() });
})();
