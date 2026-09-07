/* sidecar/orchestration/review-gate.js — deterministic acceptance gate for delegated results.
   This layer decides whether a worker result is formally acceptable BEFORE an optional LLM reviewer.
   It never grants permissions, executes tools, or mutates runtime state. */
'use strict';
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./role-policy.js') : (root.SK && root.SK.rolePolicy),
    typeof require === 'function' ? require('./result-envelope.js') : (root.SK && root.SK.resultEnvelope)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).reviewGate = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rolePolicy, resultEnvelope) {
  'use strict';

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

  function review(contractInput, envelopeInput, opts) {
    opts = opts || {};
    const c = rolePolicy.validateTaskContract(contractInput);
    if (!c.ok) return { ok: false, accepted: false, stage: 'contract', errors: c.errors.slice() };
    const e = resultEnvelope.validate(envelopeInput);
    if (!e.ok) return { ok: false, accepted: false, stage: 'envelope', errors: e.errors.slice() };

    const contract = c.value;
    const envelope = e.value;
    const failures = [];
    const warnings = [];

    if (envelope.taskId !== contract.id) failures.push('taskId mismatch');
    if (envelope.agentId !== contract.assignedTo) failures.push('agentId mismatch');
    if (envelope.status !== 'completed') failures.push('status is not completed');
    if (envelope.blockers.length) failures.push('result still has blockers');

    const reported = new Map();
    for (const item of envelope.acceptance) reported.set(norm(item.criterion), item);

    for (const criterion of contract.acceptanceCriteria) {
      const item = reported.get(norm(criterion));
      if (!item) { failures.push('missing acceptance criterion: ' + criterion); continue; }
      if (!item.passed) failures.push('failed acceptance criterion: ' + criterion);
      if (item.passed && opts.requireEvidence !== false && !String(item.evidence || '').trim()) {
        failures.push('missing acceptance evidence: ' + criterion);
      }
    }

    for (const item of envelope.acceptance) {
      if (!contract.acceptanceCriteria.some(c0 => norm(c0) === norm(item.criterion))) {
        warnings.push('unrequested acceptance item: ' + item.criterion);
      }
    }

    if (contract.deadlineAt != null && opts.completedAt != null) {
      const completedAt = Number(opts.completedAt);
      if (Number.isFinite(completedAt) && completedAt > contract.deadlineAt) warnings.push('completed after deadline');
    }
    if (contract.budgetUsd != null && opts.spentUsd != null) {
      const spentUsd = Number(opts.spentUsd);
      if (Number.isFinite(spentUsd) && spentUsd > contract.budgetUsd) failures.push('task budget exceeded');
    }

    return {
      ok: true,
      accepted: failures.length === 0,
      stage: 'review',
      taskId: contract.id,
      agentId: envelope.agentId,
      failures: failures,
      warnings: warnings,
      acceptance: { required: contract.acceptanceCriteria.length, reported: envelope.acceptance.length },
      verdict: failures.length ? 'revise' : 'accept'
    };
  }

  function revisionBrief(reviewResult) {
    if (!reviewResult || reviewResult.accepted) return '';
    const failures = Array.isArray(reviewResult.failures) ? reviewResult.failures : [];
    if (!failures.length) return 'Revise the delegated result so it satisfies the task contract.';
    return 'REVISION REQUIRED. Fix every item below and return a new result envelope:\n- ' + failures.join('\n- ');
  }

  return { review: review, revisionBrief: revisionBrief };
});
