'use strict';

function text(v, max) { const s = v == null ? '' : String(v).trim(); return s ? s.slice(0, max || 160) : ''; }
function bool(v) { return v === true ? true : (v === false ? false : null); }

function operatorGuidance(recovery) {
  recovery = recovery && typeof recovery === 'object' ? recovery : {};
  if (recovery.disposition === 'SAFE_RESTART') return {
    operatorState: 'SAFE TO RESTART',
    operatorMeaning: 'The durable task record confirms execution did not happen. Moe may safely start this work again.',
    nextMove: 'Moe can resume this task through the normal capability, consent, budget, and execution gates.'
  };
  if (recovery.executionMayHaveStarted === true) return {
    operatorState: 'DO NOT RETRY',
    operatorMeaning: 'Execution may already have happened. Moe will not repeat this action until authoritative evidence resolves it.',
    nextMove: 'Moe must obtain authoritative outcome evidence before any retry is allowed.'
  };
  if (recovery.state === 'RESUME_REQUIRED') return {
    operatorState: 'REVIEW',
    operatorMeaning: 'The durable record does not prove a safe retry. Moe keeps this task paused for review.',
    nextMove: 'Moe keeps the task in recovery and waits for enough durable evidence to choose a safe path.'
  };
  return {
    operatorState: 'REVIEW',
    operatorMeaning: 'The durable record does not prove a safe retry. Moe keeps this task paused for review.',
    nextMove: 'No automatic retry is authorized from the evidence currently shown.'
  };
}

/* Read-only operator projection for managed recovery. The task-history store remains authoritative.
   This deliberately excludes objective/context/provider references and other user/provider payloads.
   Human guidance is derived here from the same durable recovery evidence, so every UI consumes one
   interpretation instead of independently translating safety-critical state. */
function projectManagedRecovery(recovery) {
  recovery = recovery && typeof recovery === 'object' ? recovery : {};
  const cp = recovery.checkpoint && typeof recovery.checkpoint === 'object' ? recovery.checkpoint : {};
  const guidance = operatorGuidance(recovery);
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
    safeToRestart: recovery.disposition === 'SAFE_RESTART',
    operatorState: guidance.operatorState,
    operatorMeaning: guidance.operatorMeaning,
    nextMove: guidance.nextMove
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

module.exports = { projectManagedRecovery, projectManagedRecoveryList, operatorGuidance };
