/* Moe AI Station — read-only Control Mode surface for managed delegation telemetry.
   This module owns presentation only. It performs GET requests against the managed-task
   telemetry API, projects them through ControlModeView, and never mutates agent state. */
'use strict';
(() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.ControlModeUI) return;
  if (!window.ControlModeView || typeof window.ControlModeView.project !== 'function') return;

  const API = {
    summary: '/api/managed-tasks/summary',
    active: '/api/managed-tasks/active?limit=100',
    recent: '/api/managed-tasks?limit=20',
    runtime: '/api/state/snapshot',
    runs: '/api/runs?agent=*&limit=20'
  };
  const POLL_MS = 3000;
  let timer = 0;
  let refreshing = false;
  let generation = 0;
  let detailGeneration = 0;
  let panelReturnFocus = null;
  let detailReturnFocus = null;

  function make(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function fmtInt(v) { return v == null ? '—' : String(Math.max(0, Math.round(v))); }
  function fmtPct(v) { return v == null ? '—' : String(Math.max(0, Math.round(v))) + '%'; }
  function fmtUsd(v) { return v == null ? '—' : '$' + Number(v).toFixed(2); }
  function fmtDuration(ms) {
    if (ms == null) return '—';
    const s = Math.max(0, Math.round(Number(ms) / 1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60), rem = s % 60;
    return m + 'm ' + String(rem).padStart(2, '0') + 's';
  }
  function fmtWhen(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString(); } catch (_) { return ''; }
  }
  function rows(v) { return Array.isArray(v) ? v : []; }
  function focusIfPossible(node) {
    if (!node || !node.isConnected || typeof node.focus !== 'function') return;
    try { node.focus(); } catch (_) {}
  }

  function installStyle() {
    if (document.getElementById('control-mode-style')) return;
    const style = document.createElement('style');
    style.id = 'control-mode-style';
    style.textContent = `
#control-mode-panel{position:fixed;inset:0;z-index:12000;background:rgba(4,7,10,.96);color:var(--fg,#d9f4df);padding:24px;overflow:auto;font-family:inherit}
#control-mode-panel[hidden],.cm-detail[hidden]{display:none!important}.cm-shell{width:min(1180px,100%);margin:0 auto}.cm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid currentColor;padding-bottom:12px;margin-bottom:16px}.cm-kicker{opacity:.65;font-size:.9em}.cm-title{font-size:1.55rem;letter-spacing:.08em}.cm-status{display:inline-flex;align-items:center;gap:7px;margin-top:5px;opacity:.8}.cm-dot{width:8px;height:8px;border-radius:50%;background:currentColor}.cm-close{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;padding:6px 10px;cursor:pointer}.cm-close:focus-visible,.cm-refresh:focus-visible,.cm-row.cm-drill:focus-visible,#control-mode-panel:focus-visible{outline:2px solid currentColor;outline-offset:2px}.cm-actions{display:flex;gap:8px}.cm-refresh{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;padding:6px 10px;cursor:pointer}.cm-grid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin:0 0 18px}.cm-card{border:1px solid color-mix(in srgb,currentColor 40%,transparent);padding:10px;min-height:70px;background:rgba(255,255,255,.025)}.cm-card-l{opacity:.65;font-size:.82em;letter-spacing:.08em}.cm-card-v{font-size:1.45rem;margin-top:5px}.cm-section{border-top:1px solid color-mix(in srgb,currentColor 35%,transparent);padding-top:13px;margin-top:17px}.cm-section h3{margin:0 0 10px;font-size:1rem;letter-spacing:.08em}.cm-list{display:grid;gap:8px}.cm-row{display:grid;grid-template-columns:minmax(220px,2fr) minmax(100px,.8fr) minmax(110px,.8fr) minmax(80px,.5fr);gap:12px;align-items:center;border:1px solid color-mix(in srgb,currentColor 28%,transparent);padding:9px 10px}.cm-row.cm-drill{cursor:pointer}.cm-row.cm-drill:hover{background:rgba(255,255,255,.04)}.cm-row-main{min-width:0}.cm-objective{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cm-meta{opacity:.6;font-size:.82em;margin-top:3px}.cm-state{text-transform:uppercase}.cm-empty{opacity:.62;padding:10px 0}.cm-two{display:grid;grid-template-columns:1fr 1fr;gap:18px}.cm-rank{display:grid;grid-template-columns:minmax(120px,1fr) auto auto;gap:12px;padding:7px 0;border-bottom:1px dotted color-mix(in srgb,currentColor 24%,transparent)}.cm-note{opacity:.62;margin-top:10px;font-size:.88em}.cm-error{border:1px solid currentColor;padding:10px;opacity:.8}.cm-detail{position:fixed;z-index:12010;top:0;right:0;width:min(560px,100vw);height:100vh;overflow:auto;padding:20px;background:rgba(7,11,15,.99);border-left:1px solid currentColor;box-shadow:-18px 0 40px rgba(0,0,0,.45)}.cm-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid currentColor;padding-bottom:10px;margin-bottom:12px}.cm-detail-title{font-size:1.25rem}.cm-detail-grid{display:grid;grid-template-columns:130px 1fr;gap:7px 12px}.cm-detail-k{opacity:.58}.cm-detail-v{overflow-wrap:anywhere}.cm-detail-list{margin:5px 0 0;padding-left:18px}.cm-detail-block{border-top:1px solid color-mix(in srgb,currentColor 28%,transparent);padding-top:10px;margin-top:12px}.cm-detail-rev{border:1px solid color-mix(in srgb,currentColor 26%,transparent);padding:9px;margin-top:7px}@media(max-width:800px){#control-mode-panel{padding:14px}.cm-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.cm-row{grid-template-columns:1fr auto}.cm-row .cm-hide-small{display:none}.cm-two{grid-template-columns:1fr}.cm-detail{width:100vw}.cm-detail-grid{grid-template-columns:105px 1fr}}`;
    document.head.appendChild(style);
  }

  const panel = make('section');
  panel.id = 'control-mode-panel';
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'cm-title');
  panel.setAttribute('aria-hidden', 'true');
  const shell = make('div', 'cm-shell');
  const detail = make('aside', 'cm-detail');
  detail.id = 'cm-task-detail';
  detail.hidden = true;
  detail.setAttribute('role', 'dialog');
  detail.setAttribute('aria-modal', 'true');
  detail.setAttribute('aria-label', 'Managed task details');
  detail.setAttribute('aria-hidden', 'true');
  panel.append(shell, detail);
  document.body.appendChild(panel);
  installStyle();

  function renderCard(label, value) {
    const card = make('div', 'cm-card');
    card.append(make('div', 'cm-card-l', label), make('div', 'cm-card-v', value));
    return card;
  }

  function renderTaskRows(host, tasks, known, live) {
    if (!known) { host.appendChild(make('div', 'cm-empty', 'Telemetry unavailable — no task count is inferred.')); return; }
    if (!tasks.length) { host.appendChild(make('div', 'cm-empty', live ? 'No managed tasks are currently in flight.' : 'No completed managed tasks are recorded yet.')); return; }
    tasks.forEach(t => {
      const row = make('div', 'cm-row' + (!live && t.taskId ? ' cm-drill' : ''));
      const main = make('div', 'cm-row-main');
      main.append(make('div', 'cm-objective', t.objective), make('div', 'cm-meta', [t.taskId, t.workerAgentId && ('worker ' + t.workerAgentId)].filter(Boolean).join(' · ')));
      row.appendChild(main);
      row.appendChild(make('div', 'cm-state', t.state || 'unknown'));
      row.appendChild(make('div', 'cm-hide-small', live ? fmtDuration(t.durationMs) : (t.accepted ? 'ACCEPTED' : 'REVIEW')));
      row.appendChild(make('div', 'cm-hide-small', live ? '' : fmtUsd(t.usd)));
      if (!live && t.taskId) {
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', 'Open task details for ' + t.objective);
        row.addEventListener('click', () => openTaskDetail(t.taskId, row));
        row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openTaskDetail(t.taskId, row); } });
      }
      host.appendChild(row);
    });
  }

  function renderRank(host, data, mode) {
    if (!data.length) { host.appendChild(make('div', 'cm-empty', 'No verified data yet.')); return; }
    data.slice(0, 10).forEach(r => {
      const row = make('div', 'cm-rank');
      if (mode === 'worker') {
        row.append(make('div', '', r.workerAgentId), make('div', '', r.tasks + ' tasks'), make('div', '', fmtPct(r.acceptancePct)));
      } else {
        row.append(make('div', '', r.value), make('div', '', r.count), make('div', '', ''));
      }
      host.appendChild(row);
    });
  }

  function render(model, fetchErrors) {
    shell.replaceChildren();
    const head = make('header', 'cm-head');
    const left = make('div');
    left.append(make('div', 'cm-kicker', 'MOE AI STATION · READ-ONLY TELEMETRY'));
    const title = make('div', 'cm-title', 'CONTROL MODE'); title.id = 'cm-title'; left.appendChild(title);
    const knownCount = [model.evidence.historicalKnown, model.evidence.liveKnown, model.evidence.recentKnown, model.evidence.runtimeKnown, model.evidence.runHistoryKnown].filter(Boolean).length;
    const status = make('div', 'cm-status');
    status.append(make('span', 'cm-dot'), make('span', '', knownCount === 5 ? 'LIVE' : knownCount ? 'PARTIAL TELEMETRY' : 'SIDECAR OFFLINE'));
    left.appendChild(status);
    const actions = make('div', 'cm-actions');
    const refresh = make('button', 'cm-refresh', refreshing ? 'REFRESHING…' : 'REFRESH'); refresh.type = 'button'; refresh.disabled = refreshing; refresh.addEventListener('click', refreshNow);
    const close = make('button', 'cm-close', 'ESC · CLOSE'); close.type = 'button'; close.addEventListener('click', closePanel);
    actions.append(refresh, close); head.append(left, actions); shell.appendChild(head);

    const c = model.cards;
    const cards = make('div', 'cm-grid');
    cards.append(
      renderCard('ACTIVE TASKS', fmtInt(c.active)),
      renderCard('LIVE RUNS', fmtInt(c.liveRuns)),
      renderCard('QUEUED WORK', fmtInt(c.queuedWork)),
      renderCard('COMPLETED', fmtInt(c.completed)),
      renderCard('ACCEPTANCE', fmtPct(c.acceptancePct)),
      renderCard('ERROR RATE', fmtPct(c.errorPct)),
      renderCard('SPEND', fmtUsd(c.usd)),
      renderCard('REVISION RATE', fmtPct(c.revisionPct)),
      renderCard('AUDIT COVERAGE', fmtPct(c.auditCoveragePct)),
      renderCard('AUDIT REJECT', fmtPct(c.auditRejectPct)),
      renderCard('AVG DURATION', fmtDuration(c.averageDurationMs))
    );
    shell.appendChild(cards);

    const active = make('section', 'cm-section'); active.appendChild(make('h3', '', 'ACTIVE MANAGED WORK'));
    const activeList = make('div', 'cm-list'); active.appendChild(activeList); renderTaskRows(activeList, model.activeTasks, model.evidence.liveKnown, true); shell.appendChild(active);

    const runtime = make('div', 'cm-two');
    const liveRuns = make('section', 'cm-section'); liveRuns.appendChild(make('h3', '', 'LIVE RUNTIME RUNS'));
    const liveRunsList = make('div', 'cm-list'); liveRuns.appendChild(liveRunsList);
    if (!model.evidence.runtimeKnown) liveRunsList.appendChild(make('div', 'cm-empty', 'Runtime snapshot unavailable — no live runs are inferred.'));
    else if (!model.runtimeRuns.length) liveRunsList.appendChild(make('div', 'cm-empty', 'No runtime runs are currently in flight.'));
    else model.runtimeRuns.forEach(r => {
      const row = make('div', 'cm-row');
      const main = make('div', 'cm-row-main');
      main.append(make('div', 'cm-objective', r.agentId || 'unknown agent'), make('div', 'cm-meta', r.runId));
      row.append(main, make('div', 'cm-state', r.source || 'unknown'), make('div', 'cm-hide-small', fmtDuration(r.durationMs)), make('div', 'cm-hide-small', 'RUNNING'));
      liveRunsList.appendChild(row);
    });
    const queued = make('section', 'cm-section'); queued.appendChild(make('h3', '', 'QUEUE DEPTH'));
    const queueList = make('div', 'cm-list'); queued.appendChild(queueList);
    if (!model.evidence.runtimeKnown) queueList.appendChild(make('div', 'cm-empty', 'Queue snapshot unavailable — no queue depth is inferred.'));
    else if (!model.queues.length) queueList.appendChild(make('div', 'cm-empty', 'No queued work is waiting.'));
    else model.queues.forEach(q => {
      const row = make('div', 'cm-rank');
      row.append(make('div', '', q.agentId), make('div', '', q.depth + ' queued'), make('div', '', ''));
      queueList.appendChild(row);
    });
    runtime.append(liveRuns, queued); shell.appendChild(runtime);

    const trace = make('section', 'cm-section'); trace.appendChild(make('h3', '', 'RECENT TOOL / ACTION TRACE'));
    const traceList = make('div', 'cm-list'); trace.appendChild(traceList);
    if (!model.evidence.runHistoryKnown) traceList.appendChild(make('div', 'cm-empty', 'Run history unavailable — no action trace is inferred.'));
    else if (!model.actionTrace.length) traceList.appendChild(make('div', 'cm-empty', 'No recorded tool calls are present in the recent run window.'));
    else model.actionTrace.forEach(a => {
      const row = make('div', 'cm-row');
      const main = make('div', 'cm-row-main');
      main.append(make('div', 'cm-objective', a.name), make('div', 'cm-meta', [a.agentId, a.runId, a.callId].filter(Boolean).join(' · ')));
      row.append(main, make('div', 'cm-state', a.state), make('div', 'cm-hide-small', fmtDuration(a.ms)), make('div', 'cm-hide-small', ''));
      traceList.appendChild(row);
    });
    if (model.uncertainActions.length) {
      const warning = make('div', 'cm-error');
      warning.appendChild(make('div', '', 'UNCERTAIN MUTATIONS · REVIEW REQUIRED'));
      model.uncertainActions.forEach(a => warning.appendChild(make('div', 'cm-meta', [a.name || 'unknown tool', a.agentId, a.runId, a.callId].filter(Boolean).join(' · '))));
      trace.appendChild(warning);
    }
    trace.appendChild(make('div', 'cm-note', 'Trace metadata comes from the durable run ledger. Raw tool arguments and raw tool results are not displayed here.'));
    shell.appendChild(trace);

    const two = make('div', 'cm-two');
    const workers = make('section', 'cm-section'); workers.appendChild(make('h3', '', 'WORKER QUALITY'));
    const workersList = make('div'); workers.appendChild(workersList); renderRank(workersList, model.workers, 'worker');
    const risks = make('section', 'cm-section'); risks.appendChild(make('h3', '', 'TOP RISK FLAGS'));
    const riskList = make('div'); risks.appendChild(riskList); renderRank(riskList, model.topRiskFlags, 'risk');
    two.append(workers, risks); shell.appendChild(two);

    const recent = make('section', 'cm-section'); recent.appendChild(make('h3', '', 'RECENT COMPLETED WORK · ENTER FOR DETAILS'));
    const recentList = make('div', 'cm-list'); recent.appendChild(recentList); renderTaskRows(recentList, model.recentTasks, model.evidence.recentKnown, false); shell.appendChild(recent);

    if (model.topFindings.length) {
      const findings = make('section', 'cm-section'); findings.appendChild(make('h3', '', 'AUDIT FINDINGS'));
      const findingsList = make('div'); findings.appendChild(findingsList); renderRank(findingsList, model.topFindings, 'finding'); shell.appendChild(findings);
    }
    if (model.evidence.historyWindowTruncated) shell.appendChild(make('div', 'cm-note', 'Historical metrics are calculated from the retained telemetry window, not an implied all-time ledger.'));
    if (fetchErrors && fetchErrors.length) shell.appendChild(make('div', 'cm-note', 'Some telemetry endpoints are unavailable; unknown values remain shown as — instead of being converted to zero.'));
  }

  function field(grid, key, value) {
    if (value == null || value === '') return;
    grid.append(make('div', 'cm-detail-k', key), make('div', 'cm-detail-v', value));
  }
  function listBlock(host, title, values) {
    const data = rows(values).filter(v => v != null && String(v).trim());
    if (!data.length) return;
    const block = make('section', 'cm-detail-block');
    block.appendChild(make('div', 'cm-detail-k', title));
    const list = make('ul', 'cm-detail-list');
    data.forEach(v => list.appendChild(make('li', '', typeof v === 'string' ? v : JSON.stringify(v))));
    block.appendChild(list); host.appendChild(block);
  }
  function closeDetail() {
    const target = detailReturnFocus;
    detailReturnFocus = null;
    detailGeneration++;
    detail.hidden = true;
    detail.setAttribute('aria-hidden', 'true');
    detail.replaceChildren();
    if (!panel.hidden) focusIfPossible(target);
  }
  function renderTaskDetail(body, taskId) {
    detail.replaceChildren();
    const head = make('header', 'cm-detail-head');
    const left = make('div');
    left.append(make('div', 'cm-kicker', 'MANAGED TASK · READ ONLY'), make('div', 'cm-detail-title', taskId));
    const close = make('button', 'cm-close', 'ESC · BACK'); close.type = 'button'; close.addEventListener('click', closeDetail);
    head.append(left, close); detail.appendChild(head);
    const history = rows(body && body.history);
    if (!history.length) { detail.appendChild(make('div', 'cm-error', 'No durable history is available for this task.')); focusIfPossible(close); return; }
    const latest = history[0] || {};
    const grid = make('div', 'cm-detail-grid');
    field(grid, 'OBJECTIVE', latest.objective);
    field(grid, 'STATUS', latest.status);
    field(grid, 'STAGE', latest.stage);
    field(grid, 'LEAD', latest.leadAgentId);
    field(grid, 'WORKER', latest.workerAgentId);
    field(grid, 'AUDITOR', latest.auditorAgentId);
    field(grid, 'ATTEMPTS', latest.attempts == null ? '' : String(latest.attempts));
    field(grid, 'SPEND', latest.usd == null ? '' : fmtUsd(latest.usd));
    field(grid, 'DURATION', latest.durationMs == null ? '' : fmtDuration(latest.durationMs));
    field(grid, 'COMPLETED', fmtWhen(latest.completedAt || latest.ts));
    field(grid, 'PARENT TASK', latest.parentTaskId);
    field(grid, 'PARENT RUN', latest.parentRunId);
    detail.appendChild(grid);
    listBlock(detail, 'ACCEPTANCE CRITERIA', latest.acceptanceCriteria);
    listBlock(detail, 'FINDINGS', latest.findings);
    listBlock(detail, 'RISK FLAGS', latest.riskFlags);
    listBlock(detail, 'SOURCES', latest.sources);
    listBlock(detail, 'ARTIFACTS', latest.artifacts);
    if (history.length > 1) {
      const block = make('section', 'cm-detail-block'); block.appendChild(make('div', 'cm-detail-k', 'HISTORY'));
      history.forEach(h => {
        const rev = make('div', 'cm-detail-rev');
        rev.append(make('div', '', [h.status || 'unknown', h.stage || '', h.attempts != null ? ('attempts ' + h.attempts) : ''].filter(Boolean).join(' · ')), make('div', 'cm-meta', fmtWhen(h.completedAt || h.ts)));
        block.appendChild(rev);
      });
      detail.appendChild(block);
    }
    focusIfPossible(close);
  }
  async function openTaskDetail(taskId, returnFocus) {
    if (!taskId) return;
    const fallback = document.activeElement;
    detailReturnFocus = returnFocus && returnFocus.isConnected ? returnFocus : (fallback && fallback.isConnected ? fallback : null);
    const token = ++detailGeneration;
    detail.hidden = false;
    detail.setAttribute('aria-hidden', 'false');
    detail.replaceChildren(make('div', 'cm-empty', 'Loading durable task history…'));
    try {
      const body = await get('/api/managed-tasks/' + encodeURIComponent(taskId));
      if (token !== detailGeneration || detail.hidden) return;
      renderTaskDetail(body, taskId);
    } catch (_) {
      if (token !== detailGeneration || detail.hidden) return;
      detail.replaceChildren();
      const head = make('header', 'cm-detail-head');
      head.append(make('div', 'cm-detail-title', taskId));
      const close = make('button', 'cm-close', 'ESC · BACK'); close.type = 'button'; close.addEventListener('click', closeDetail); head.appendChild(close);
      detail.append(head, make('div', 'cm-error', 'Task history could not be loaded. No missing detail is inferred.'));
      focusIfPossible(close);
    }
  }

  async function get(path) {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(path);
  }

  async function refreshNow() {
    if (refreshing || panel.hidden) return;
    refreshing = true;
    const token = ++generation;
    const results = await Promise.allSettled([get(API.summary), get(API.active), get(API.recent), get(API.runtime), get(API.runs)]);
    if (token !== generation || panel.hidden) { refreshing = false; return; }
    const values = results.map(r => r.status === 'fulfilled' ? r.value : null);
    const errors = results.filter(r => r.status === 'rejected');
    const model = window.ControlModeView.project(values[0], values[1], values[2], values[3], values[4]);
    refreshing = false;
    render(model, errors);
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (!panel.hidden) refreshNow(); }, POLL_MS);
  }
  function openPanel() {
    const active = document.activeElement;
    panelReturnFocus = active && active.isConnected ? active : null;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('control-mode-open');
    schedule();
    refreshNow();
    focusIfPossible(panel);
  }
  function closePanel() {
    const target = panelReturnFocus;
    panelReturnFocus = null;
    detailReturnFocus = null;
    generation++;
    closeDetail();
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('control-mode-open');
    if (timer) { clearInterval(timer); timer = 0; }
    focusIfPossible(target);
  }

  const system = document.querySelector('#bottombar .bb-group[data-group="system"]');
  const menu = system && system.querySelector('.bb-menu');
  if (menu && !document.getElementById('bb-control-mode')) {
    const button = make('button', 'bb', '▦ CONTROL');
    button.id = 'bb-control-mode';
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('data-term', 'CONTROL MODE');
    button.title = 'Control Mode — managed task telemetry';
    button.addEventListener('click', ev => {
      ev.stopPropagation();
      if (system) {
        system.classList.remove('open');
        const trigger = system.querySelector('.bb-grp'); if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
      openPanel();
    });
    menu.appendChild(button);
  }

  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || panel.hidden) return;
    ev.preventDefault();
    if (!detail.hidden) closeDetail(); else closePanel();
  });

  window.ControlModeUI = { open: openPanel, close: closePanel, refresh: refreshNow, inspectTask: openTaskDetail, panel, endpoints: Object.freeze({ ...API }) };
})();
