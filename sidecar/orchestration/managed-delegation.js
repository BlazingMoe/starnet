/* sidecar/orchestration/managed-delegation.js — bounded dispatch/review/revision coordinator.
   The host injects dispatch(); this module never bypasses the inherited tool registry or consent broker. */
'use strict';
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./delegation-adapter.js') : (root.SK && root.SK.delegationAdapter),
    typeof require === 'function' ? require('./result-envelope.js') : (root.SK && root.SK.resultEnvelope),
    typeof require === 'function' ? require('./review-gate.js') : (root.SK && root.SK.reviewGate)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).managedDelegation = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (adapter, resultEnvelope, reviewGate) {
  'use strict';

  function parseEnvelope(raw, fallback) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    const text = String(raw == null ? '' : raw).trim();
    if (text) {
      try { const parsed = JSON.parse(text); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed; }
      catch (_) {}
    }
    return {
      taskId: fallback.taskId,
      agentId: fallback.agentId,
      status: 'failed',
      summary: 'Worker did not return a valid result envelope.',
      output: text,
      artifacts: [], sources: [], blockers: ['invalid result envelope'], acceptance: [], provenance: {}
    };
  }

  async function run(opts) {
    opts = opts || {};
    if (typeof opts.dispatch !== 'function') return { ok: false, error: 'dispatch is required' };
    const prepared = adapter.prepareWorker(opts);
    if (!prepared.ok) return { ok: false, stage: 'prepare', errors: prepared.errors || ['invalid task contract'] };

    const worker = prepared.value;
    const contract = worker.taskContract;
    const maxRevisions = Number.isFinite(Number(opts.maxRevisions)) ? Math.max(0, Math.min(3, Math.floor(Number(opts.maxRevisions)))) : 1;
    const attempts = [];
    let context = worker.context;
    let prompt = worker.prompt;

    for (let attempt = 0; attempt <= maxRevisions; attempt++) {
      let raw;
      try {
        raw = await opts.dispatch({ agentId: worker.agentId, prompt: prompt, context: context, taskContract: contract, attempt: attempt });
      } catch (e) {
        return { ok: false, stage: 'dispatch', error: String((e && e.message) || e), attempts: attempts };
      }

      const candidate = parseEnvelope(raw && Object.prototype.hasOwnProperty.call(raw, 'envelope') ? raw.envelope : raw, {
        taskId: contract.id, agentId: contract.assignedTo
      });
      const envelopeCheck = resultEnvelope.validate(candidate);
      const review = reviewGate.review(contract, candidate, {
        completedAt: raw && raw.completedAt,
        spentUsd: raw && raw.spentUsd,
        requireEvidence: opts.requireEvidence !== false
      });
      attempts.push({ attempt: attempt, envelopeValid: envelopeCheck.ok, review: review });

      if (review.ok && review.accepted) {
        return { ok: true, accepted: true, contract: contract, envelope: envelopeCheck.value, review: review, attempts: attempts };
      }
      if (attempt >= maxRevisions) {
        return { ok: true, accepted: false, contract: contract, envelope: envelopeCheck.ok ? envelopeCheck.value : candidate, review: review, attempts: attempts };
      }

      const brief = reviewGate.revisionBrief(review);
      prompt = contract.objective + '\n\n' + brief;
      context = worker.context + '\n\n[PREVIOUS ATTEMPT]\n' + JSON.stringify(candidate).slice(0, 12000);
    }
    return { ok: false, error: 'unreachable' };
  }

  return { run: run, parseEnvelope: parseEnvelope };
});
