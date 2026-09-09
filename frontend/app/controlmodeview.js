/* Moe AI Station — pure projection for the professional Control Mode task dashboard.
   No DOM, timers, fetches, stores, or inferred truth. It only projects API evidence already
   returned by the sidecar into a stable render model, so presentation can be tested separately. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ControlModeView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const rows = v => Array.isArray(v) ? v : [];
  const finite = v => typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const text = v => v == null ? '' : String(v);
  const pct = v => Math.round(Math.max(0, Math.min(1, finite(v))) * 100);
  const money = v => Math.max(0, finite(v));

  function taskRow(row, live) {
    row = row && typeof row === 'object' ? row : {};
    const state = live ? text(row.stage || 'dispatch') : text(row.status || 'unknown');
    return {
      taskId: text(row.taskId),
      objective: text(row.objective) || 'Untitled managed task',
      leadAgentId: text(row.leadAgentId),
      workerAgentId: text(row.workerAgentId),
      auditorAgentId: text(row.auditorAgentId),
      state,
      accepted: live ? null : row.accepted === true,
      attempts: live ? null : Math.max(0, Math.floor(finite(row.attempts))),
      usd: live ? null : money(row.usd),
      durationMs: live ? Math.max(0, finite(row.elapsedMs)) : Math.max(0, finite(row.durationMs)),
      completedAt: live ? 0 : Math.max(0, finite(row.completedAt || row.ts)),
      live: live === true
    };
  }

  function runtimeRun(row, snapshotTs) {
    row = row && typeof row === 'object' ? row : {};
    const startedAt = Math.max(0, finite(row.startedAt));
    const at = Math.max(0, finite(snapshotTs));
    return {
      runId: text(row.runId),
      agentId: text(row.agentId),
      source: text(row.source) || 'unknown',
      startedAt,
      durationMs: startedAt && at >= startedAt ? at - startedAt : null
    };
  }

  function queueRow(row) {
    row = row && typeof row === 'object' ? row : {};
    return {
      agentId: text(row.agentId),
      depth: Math.max(0, Math.floor(finite(row.depth)))
    };
  }

  function project(summaryResponse, activeResponse, recentResponse, runtimeResponse) {
    const sr = summaryResponse && summaryResponse.ok === true ? summaryResponse : null;
    const ar = activeResponse && activeResponse.ok === true ? activeResponse : null;
    const rr = recentResponse && recentResponse.ok === true ? recentResponse : null;
    const summary = sr && sr.summary && typeof sr.summary === 'object' ? sr.summary : {};
    const liveSummary = ar && ar.summary && typeof ar.summary === 'object'
      ? ar.summary
      : (sr && sr.live && typeof sr.live === 'object' ? sr.live : {});

    const historicalKnown = !!sr;
    const liveKnown = !!(ar || (sr && sr.live));
    const runtimeKnown = !!(runtimeResponse && typeof runtimeResponse === 'object'
      && Array.isArray(runtimeResponse.runs) && Array.isArray(runtimeResponse.queues));
    const runtimeRuns = runtimeKnown ? rows(runtimeResponse.runs).map(r => runtimeRun(r, runtimeResponse.ts)).filter(r => r.runId) : [];
    const queues = runtimeKnown ? rows(runtimeResponse.queues).map(queueRow).filter(r => r.agentId && r.depth > 0) : [];
    return {
      evidence: {
        historicalKnown,
        liveKnown,
        recentKnown: !!rr,
        runtimeKnown,
        historyWindowTruncated: !!(summary.window && summary.window.truncated)
      },
      cards: {
        active: liveKnown ? Math.max(0, Math.floor(finite(liveSummary.active))) : null,
        liveRuns: runtimeKnown ? runtimeRuns.length : null,
        queuedWork: runtimeKnown ? queues.reduce((sum, row) => sum + row.depth, 0) : null,
        completed: historicalKnown ? Math.max(0, Math.floor(finite(summary.total))) : null,
        acceptancePct: historicalKnown ? pct(summary.acceptanceRate) : null,
        revisionPct: historicalKnown ? pct(summary.revisionRate) : null,
        auditCoveragePct: historicalKnown ? pct(summary.auditCoverageRate) : null,
        auditRejectPct: historicalKnown ? pct(summary.auditedRejectRate) : null,
        errorPct: historicalKnown ? pct(summary.errorRate) : null,
        usd: historicalKnown ? money(summary.usd) : null,
        averageDurationMs: historicalKnown ? Math.max(0, finite(summary.averageDurationMs)) : null
      },
      activeTasks: ar ? rows(ar.tasks).map(r => taskRow(r, true)) : [],
      runtimeRuns,
      queues,
      recentTasks: rr ? rows(rr.tasks).map(r => taskRow(r, false)) : [],
      workers: historicalKnown ? rows(summary.workers).map(w => ({
        workerAgentId: text(w && w.workerAgentId),
        tasks: Math.max(0, Math.floor(finite(w && w.tasks))),
        acceptancePct: pct(w && w.acceptanceRate),
        usd: money(w && w.usd),
        averageDurationMs: Math.max(0, finite(w && w.averageDurationMs))
      })).filter(w => w.workerAgentId) : [],
      topRiskFlags: historicalKnown ? rows(summary.topRiskFlags).map(x => ({ value: text(x && x.value), count: Math.max(0, Math.floor(finite(x && x.count))) })).filter(x => x.value) : [],
      topFindings: historicalKnown ? rows(summary.topFindings).map(x => ({ value: text(x && x.value), count: Math.max(0, Math.floor(finite(x && x.count))) })).filter(x => x.value) : []
    };
  }

  return { project, taskRow, runtimeRun, queueRow, pct };
});
