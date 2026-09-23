'use strict';

function text(v, max) { const s = v == null ? '' : String(v).trim(); return s ? s.slice(0, max || 160) : ''; }
function bool(v) { return v === true ? true : (v === false ? false : null); }

/* Read-only operator projection for managed recovery. The task-history store remains authoritative.
   This deliberately excludes objective/context/provider references and other user/provider payloads. */
function projectManagedRecovery(recovery) {
  recovery = recovery && typeof recovery === 'object' ? recovery : {};
  const cp = recovery.checkpoint && typeof recovery.checkpoint === 'object' ? recovery.checkpoint : {};
  const row = {
    taskId: text(recovery.taskId || cp.taskId, 120),
    state: text(recovery.state, 40),
    disposition: text(recovery.disposition, 48),
    stage: text(cp.stage, 40),
    executionMayHaveStarted: bool(recovery.executionMayHaveStarted),
    reason: text(recovery.reason, 160),
    reconciliationOutcome: text(cp.reconciliationOutcome, 40),
    reconciliationDecision: text(cp.reconciliationDecision, 40),
    recoverable: recovery.state === 'RESUME_REQUIRED',
    safeToRestart: recovery.disposition === 'SAFE_RESTART'
  };
  return row;
}

function projectManagedRecoveryList(page, options) {
  page = page && typeof page === 'object' ? page : {};
  options = options || {};
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  const items = Array.isArray(page.items) ? page.items : [];
  const rows = items.slice(0, limit).map(projectManagedRecovery).filter(x => x.taskId);
  return {
    schemaVersion: 'moe.control-recoveries.v1',
    rows,
    evidence: {
      source: 'managed-task-history',
      authoritative: true,
      returnedRows: rows.length,
      bounded: items.length > rows.length || page.truncated === true,
      providerReferencesExposed: false,
      taskContentExposed: false
    }
  };
}

module.exports = { projectManagedRecovery, projectManagedRecoveryList };
