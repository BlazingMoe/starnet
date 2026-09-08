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
    recent: '/api/managed-tasks?limit=20'
  };
  const POLL_MS = 3000;
  let timer = 0;
  let refreshing = false;
  let generation = 0;

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

  function installStyle() {
    if (document.getElementById('control-mode-style')) return;
    const style = document.createElement('style');
    style.id = 'control-mode-style';
    style.textContent = `
#control-mode-panel{position:fixed;inset:0;z-index:12000;background:rgba(4,7,10,.96);color:var(--fg,#d9f4df);padding:24px;overflow:auto;font-family:inherit}
#control-mode-panel[hidden]{display:none!important}.cm-shell{width:min(1180px,100%);margin:0 auto}.cm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid currentColor;padding-bottom:12px;margin-bottom:16px}.cm-kicker{opacity:.65;font-size:.9em}.cm-title{font-size:1.55rem;letter-spacing:.08em}.cm-status{display:inline-flex;align-items:center;gap:7px;margin-top:5px;opacity:.8}.cm-dot{width:8px;height:8px;border-radius:50%;background:currentColor}.cm-close{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;padding:6px 10px;cursor:pointer}.cm-close:focus-visible,.cm-refresh:focus-visible{outline:2px solid currentColor;outline-offset:2px}.cm-actions{display:flex;gap:8px}.cm-refresh{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;padding:6px 10px;cursor:pointer}.cm-grid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin:0 0 18px}.cm-card{border:1px solid color-mix(in srgb,currentColor 40%,transparent);padding:10px;min-height:70px;background:rgba(255,255,255,.025)}.cm-card-l{opacity:.65;font-size:.82em;letter-spacing:.08em}.cm-card-v{font-size:1.45rem;margin-top:5px}.cm-section{border-top:1px solid color-mix(in srgb,currentColor 35%,transparent);padding-top:13px;margin-top:17px}.cm-section h3{margin:0 0 10px;font-size:1rem;letter-spacing:.08em}.cm-list{display:grid;gap:8px}.cm-row{display:grid;grid-template-columns:minmax(220px,2fr) minmax(100px,.8fr) minmax(110px,.8fr) minmax(80px,.5fr);gap:12px;align-items:center;border:1px solid color-mix(in srgb,currentColor 28%,transparent);padding:9px 10px}.cm-row-main{min-width:0}.cm-objective{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cm-meta{opacity:.6;font-size:.82em;margin-top:3px}.cm-state{text-transform:uppercase}.cm-empty{opacity:.62;padding:10px 0}.cm-two{display:grid;grid-template-columns:1fr 1fr;gap:18px}.cm-rank{display:grid;grid-template-columns:minmax(120px,1fr) auto auto;gap:12px;padding:7px 0;border-bottom:1px dotted color-mix(in srgb,currentColor 24%,transparent)}.cm-note{opacity:.62;margin-top:10px;font-size:.88em}.cm-error{border:1px solid currentColor;padding:10px;opacity:.8}@media(max-width:800px){#control-mode-panel{padding:14px}.cm-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.cm-row{grid-template-columns:1fr auto}.cm-row .cm-hide-small{display:none}.cm-two{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  const panel = make('section');
  panel.id = 'control-mode-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'cm-title');
  const shell = make('div', 'cm-shell');
  panel.appendChild(shell);
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
      const row = make('div', 'cm-row');
      const main = make('div', 'cm-row-main');
      main.append(make('div', 'cm-objective', t.objective), make('div', 'cm-meta', [t.taskId, t.workerAgentId && ('worker ' + t.workerAgentId)].filter(Boolean).join(' · ')));
      row.appendChild(main);
      row.appendChild(make('div', 'cm-state', t.state || 'unknown'));
      row.appendChild(make('div', 'cm-hide-small', live ? fmtDuration(t.durationMs) : (t.accepted ? 'ACCEPTED' : 'REVIEW')));
      row.appendChild(make('div', 'cm-hide-small', live ? '' : fmtUsd(t.usd)));
      host.appendChild(row);
    });
  }

  function renderRank(host, rows, mode) {
    if (!rows.length) { host.appendChild(make('div', 'cm-empty', 'No verified data yet.')); return; }
    rows.slice(0, 10).forEach(r => {
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
    const knownCount = [model.evidence.historicalKnown, model.evidence.liveKnown, model.evidence.recentKnown].filter(Boolean).length;
    const status = make('div', 'cm-status');
    status.append(make('span', 'cm-dot'), make('span', '', knownCount === 3 ? 'LIVE' : knownCount ? 'PARTIAL TELEMETRY' : 'SIDECAR OFFLINE'));
    left.appendChild(status);
    const actions = make('div', 'cm-actions');
    const refresh = make('button', 'cm-refresh', refreshing ? 'REFRESHING…' : 'REFRESH'); refresh.type = 'button'; refresh.disabled = refreshing; refresh.addEventListener('click', refreshNow);
    const close = make('button', 'cm-close', 'ESC · CLOSE'); close.type = 'button'; close.addEventListener('click', closePanel);
    actions.append(refresh, close); head.append(left, actions); shell.appendChild(head);

    const c = model.cards;
    const cards = make('div', 'cm-grid');
    cards.append(
      renderCard('ACTIVE TASKS', fmtInt(c.active)),
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

    const two = make('div', 'cm-two');
    const workers = make('section', 'cm-section'); workers.appendChild(make('h3', '', 'WORKER QUALITY'));
    const workersList = make('div'); workers.appendChild(workersList); renderRank(workersList, model.workers, 'worker');
    const risks = make('section', 'cm-section'); risks.appendChild(make('h3', '', 'TOP RISK FLAGS'));
    const riskList = make('div'); risks.appendChild(riskList); renderRank(riskList, model.topRiskFlags, 'risk');
    two.append(workers, risks); shell.appendChild(two);

    const recent = make('section', 'cm-section'); recent.appendChild(make('h3', '', 'RECENT COMPLETED WORK'));
    const recentList = make('div', 'cm-list'); recent.appendChild(recentList); renderTaskRows(recentList, model.recentTasks, model.evidence.recentKnown, false); shell.appendChild(recent);

    if (model.topFindings.length) {
      const findings = make('section', 'cm-section'); findings.appendChild(make('h3', '', 'AUDIT FINDINGS'));
      const findingsList = make('div'); findings.appendChild(findingsList); renderRank(findingsList, model.topFindings, 'finding'); shell.appendChild(findings);
    }
    if (model.evidence.historyWindowTruncated) shell.appendChild(make('div', 'cm-note', 'Historical metrics are calculated from the retained telemetry window, not an implied all-time ledger.'));
    if (fetchErrors && fetchErrors.length) shell.appendChild(make('div', 'cm-note', 'Some telemetry endpoints are unavailable; unknown values remain shown as — instead of being converted to zero.'));
  }

  async function get(path) {
    if (!window.Harness || !Harness.api || typeof Harness.api.get !== 'function') throw new Error('sidecar API unavailable');
    return Harness.api.get(path);
  }

  async function refreshNow() {
    if (refreshing || panel.hidden) return;
    refreshing = true;
    const token = ++generation;
    const results = await Promise.allSettled([get(API.summary), get(API.active), get(API.recent)]);
    if (token !== generation || panel.hidden) { refreshing = false; return; }
    const values = results.map(r => r.status === 'fulfilled' ? r.value : null);
    const errors = results.filter(r => r.status === 'rejected');
    const model = window.ControlModeView.project(values[0], values[1], values[2]);
    refreshing = false;
    render(model, errors);
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (!panel.hidden) refreshNow(); }, POLL_MS);
  }
  function openPanel() {
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('control-mode-open');
    schedule();
    refreshNow();
    const close = panel.querySelector('.cm-close'); if (close) { try { close.focus(); } catch (_) {} }
  }
  function closePanel() {
    generation++;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('control-mode-open');
    if (timer) { clearInterval(timer); timer = 0; }
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
    if (ev.key === 'Escape' && !panel.hidden) { ev.preventDefault(); closePanel(); }
  });

  window.ControlModeUI = { open: openPanel, close: closePanel, refresh: refreshNow, panel, endpoints: Object.freeze({ ...API }) };
})();
