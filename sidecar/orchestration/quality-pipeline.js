/* sidecar/orchestration/quality-pipeline.js — deterministic gate first, optional independent auditor second. */
'use strict';
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./review-gate.js') : (root.SK && root.SK.reviewGate),
    typeof require === 'function' ? require('./auditor.js') : (root.SK && root.SK.auditor)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).qualityPipeline = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (reviewGate, auditor) {
  'use strict';

  async function evaluate(opts) {
    opts = opts || {};
    const formal = reviewGate.review(opts.contract, opts.envelope, {
      spentUsd: opts.spentUsd,
      completedAt: opts.completedAt,
      requireEvidence: opts.requireEvidence
    });
    if (!formal || formal.accepted !== true) {
      return { accepted: false, stage: 'formal', action: (formal && formal.verdict) || 'revise', formal, audit: null };
    }

    if (!opts.requireAudit) return { accepted: true, stage: 'formal', action: 'accept', formal, audit: null };
    if (typeof opts.runAuditor !== 'function') {
      return { accepted: false, stage: 'audit', action: 'reject', formal, audit: null, reason: 'auditor-unavailable' };
    }

    const request = auditor.buildAuditPrompt(opts.contract, opts.envelope);
    if (!request.ok) return { accepted: false, stage: 'audit', action: 'reject', formal, audit: null, reason: 'audit-request-invalid', errors: request.errors };

    let raw;
    try { raw = await opts.runAuditor({ prompt: request.prompt, resultSchema: request.schema }); }
    catch (e) { return { accepted: false, stage: 'audit', action: 'reject', formal, audit: null, reason: 'auditor-failed', error: String((e && e.message) || e) }; }

    const checked = auditor.validateAudit(raw, opts.contract, opts.envelope);
    if (!checked.ok) return { accepted: false, stage: 'audit', action: 'reject', formal, audit: checked, reason: 'invalid-audit' };
    const d = auditor.decision(checked);
    return { accepted: !!d.accepted, stage: 'audit', action: d.action, formal, audit: checked, score: d.score, findings: d.findings || [], riskFlags: d.riskFlags || [] };
  }

  return { evaluate };
});
