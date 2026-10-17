/* sidecar/orchestration/auditor.js — independent qualitative audit contract for delegated work.
   This module is policy/data shaping only. It does not execute tools or grant permissions. */
'use strict';
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./role-policy.js') : (root.SK && root.SK.rolePolicy),
    typeof require === 'function' ? require('./result-envelope.js') : (root.SK && root.SK.resultEnvelope)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).auditor = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rolePolicy, resultEnvelope) {
  'use strict';

  const VERDICTS = Object.freeze(['accept', 'revise', 'reject']);
  const MAX_FINDINGS = 48;

  function clean(v, max) {
    const s = typeof v === 'string' ? v.trim() : '';
    return s && s.length <= (max || 4000) ? s : '';
  }

  function list(v, maxItems, maxChars) {
    if (v == null) return { ok: true, value: [] };
    if (!Array.isArray(v) || v.length > maxItems) return { ok: false, value: [] };
    const out = [];
    for (const item of v) {
      const s = clean(item, maxChars);
      if (!s) return { ok: false, value: [] };
      out.push(s);
    }
    return { ok: true, value: out };
  }

  function auditResultSchema() {
    return {
      type: 'object', additionalProperties: false,
      required: ['taskId', 'workerAgentId', 'verdict', 'score', 'rationale', 'findings', 'failedCriteria', 'riskFlags'],
      properties: {
        taskId: { type: 'string' },
        workerAgentId: { type: 'string' },
        verdict: { type: 'string', enum: VERDICTS.slice() },
        score: { type: 'number' },
        rationale: { type: 'string' },
        findings: { type: 'array', items: { type: 'string' } },
        failedCriteria: { type: 'array', items: { type: 'string' } },
        riskFlags: { type: 'array', items: { type: 'string' } }
      }
    };
  }

  function buildAuditPrompt(contract, envelope) {
    const c = rolePolicy.validateTaskContract(contract);
    const e = resultEnvelope.validate(envelope);
    if (!c.ok) return { ok: false, errors: ['contract'].concat(c.errors || []) };
    if (!e.ok) return { ok: false, errors: ['resultEnvelope'].concat(e.errors || []) };
    const task = c.value, result = e.value;
    const lines = [
      'You are an INDEPENDENT AUDITOR. Review the worker result against the original task. Do not improve or rewrite the work; judge it.',
      'Return ONLY strict JSON matching the supplied result schema.',
      '',
      'TASK ID: ' + task.id,
      'OBJECTIVE: ' + task.objective,
      'WORKER: ' + result.agentId,
      'WORKER STATUS: ' + result.status,
      '',
      'ACCEPTANCE CRITERIA:',
      task.acceptanceCriteria.length ? task.acceptanceCriteria.map(x => '- ' + x).join('\n') : '- none explicitly supplied',
      '',
      'WORKER SUMMARY:',
      result.summary,
      '',
      'WORKER OUTPUT:',
      result.output || '(no separate output)',
      '',
      'WORKER SOURCES:',
      result.sources.length ? result.sources.map(x => '- ' + x).join('\n') : '- none',
      '',
      'WORKER ARTIFACTS:',
      result.artifacts.length ? result.artifacts.map(x => '- ' + x).join('\n') : '- none',
      '',
      'WORKER CLAIMED ACCEPTANCE:',
      result.acceptance.length ? result.acceptance.map(x => '- [' + (x.passed ? 'PASS' : 'FAIL') + '] ' + x.criterion + ' | evidence: ' + (x.evidence || '(none)')).join('\n') : '- none',
      '',
      'AUDIT RULES:',
      '- accept only when the objective and every acceptance criterion are actually satisfied;',
      '- use revise for fixable gaps;',
      '- use reject for fundamental mismatch, fabricated evidence, unsafe output, or an unusable result;',
      '- flag unsupported claims, weak provenance, contradictory evidence, missing verification, and hallucination risk;',
      '- score from 0 to 100.'
    ];
    return { ok: true, prompt: lines.join('\n'), schema: auditResultSchema() };
  }

  function validateAudit(input, contract, envelope) {
    const c = rolePolicy.validateTaskContract(contract);
    const e = resultEnvelope.validate(envelope);
    const errors = [];
    if (!c.ok) errors.push('contract');
    if (!e.ok) errors.push('resultEnvelope');
    const a = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const taskId = clean(a.taskId, 200);
    const workerAgentId = clean(a.workerAgentId, 200);
    const verdict = clean(a.verdict, 20).toLowerCase();
    const rationale = clean(a.rationale, 8000);
    const score = Number(a.score);
    if (!taskId) errors.push('taskId');
    if (!workerAgentId) errors.push('workerAgentId');
    if (VERDICTS.indexOf(verdict) < 0) errors.push('verdict');
    if (!Number.isFinite(score) || score < 0 || score > 100) errors.push('score');
    if (!rationale) errors.push('rationale');
    const findings = list(a.findings, MAX_FINDINGS, 2000); if (!findings.ok) errors.push('findings');
    const failedCriteria = list(a.failedCriteria, MAX_FINDINGS, 2000); if (!failedCriteria.ok) errors.push('failedCriteria');
    const riskFlags = list(a.riskFlags, MAX_FINDINGS, 1000); if (!riskFlags.ok) errors.push('riskFlags');
    if (c.ok && taskId && taskId !== c.value.id) errors.push('taskIdMismatch');
    if (e.ok && workerAgentId && workerAgentId !== e.value.agentId) errors.push('workerAgentMismatch');
    if (errors.length) return { ok: false, errors };
    return { ok: true, value: {
      schemaVersion: 1, taskId, workerAgentId, verdict, score, rationale,
      findings: findings.value, failedCriteria: failedCriteria.value, riskFlags: riskFlags.value
    }};
  }

  function decision(audit) {
    if (!audit || audit.ok !== true || !audit.value) return { accepted: false, action: 'reject', reason: 'invalid-audit' };
    const a = audit.value;
    return { accepted: a.verdict === 'accept', action: a.verdict, score: a.score, findings: a.findings.slice(), riskFlags: a.riskFlags.slice() };
  }

  return { VERDICTS, auditResultSchema, buildAuditPrompt, validateAudit, decision };
});
