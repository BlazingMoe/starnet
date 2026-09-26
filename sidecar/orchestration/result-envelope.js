/* sidecar/orchestration/result-envelope.js — deterministic result envelope for delegated work. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).resultEnvelope = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS = Object.freeze(['completed', 'partial', 'blocked', 'failed']);
  const MAX_TEXT = 50000;
  const MAX_ITEMS = 64;

  function text(v, max) {
    const s = typeof v === 'string' ? v.trim() : '';
    return s && s.length <= (max || MAX_TEXT) ? s : '';
  }

  function strList(v, max) {
    if (v == null) return { ok: true, value: [] };
    if (!Array.isArray(v) || v.length > (max || MAX_ITEMS)) return { ok: false, value: [] };
    const out = [];
    for (const x of v) {
      const s = text(x, 2000);
      if (!s) return { ok: false, value: [] };
      out.push(s);
    }
    return { ok: true, value: out };
  }

  function validate(input) {
    const r = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const errors = [];
    const taskId = text(r.taskId, 200);
    const agentId = text(r.agentId, 200);
    const status = text(r.status, 20).toLowerCase();
    const summary = text(r.summary, 8000);
    const output = typeof r.output === 'string' ? r.output : '';
    if (!taskId) errors.push('taskId');
    if (!agentId) errors.push('agentId');
    if (STATUS.indexOf(status) < 0) errors.push('status');
    if (!summary) errors.push('summary');
    if (output.length > MAX_TEXT) errors.push('output');
    const artifacts = strList(r.artifacts, MAX_ITEMS); if (!artifacts.ok) errors.push('artifacts');
    const sources = strList(r.sources, MAX_ITEMS); if (!sources.ok) errors.push('sources');
    const blockers = strList(r.blockers, MAX_ITEMS); if (!blockers.ok) errors.push('blockers');
    const acceptance = Array.isArray(r.acceptance) ? r.acceptance : [];
    if (acceptance.length > MAX_ITEMS) errors.push('acceptance');
    const checkedAcceptance = [];
    if (!errors.includes('acceptance')) {
      for (const item of acceptance) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push('acceptance'); break; }
        const criterion = text(item.criterion, 2000);
        if (!criterion || typeof item.passed !== 'boolean') { errors.push('acceptance'); break; }
        checkedAcceptance.push({ criterion, passed: item.passed, evidence: text(item.evidence || '', 4000) });
      }
    }
    if (errors.length) return { ok: false, errors };
    return { ok: true, value: {
      schemaVersion: 1, taskId, agentId, status, summary, output,
      artifacts: artifacts.value, sources: sources.value, blockers: blockers.value,
      acceptance: checkedAcceptance,
      provenance: (r.provenance && typeof r.provenance === 'object' && !Array.isArray(r.provenance)) ? Object.assign({}, r.provenance) : {}
    }};
  }

  function acceptanceSummary(envelope) {
    const r = validate(envelope);
    if (!r.ok) return { ok: false, errors: r.errors };
    const items = r.value.acceptance;
    const passed = items.filter(x => x.passed).length;
    const failed = items.length - passed;
    return { ok: true, total: items.length, passed, failed, complete: failed === 0 && r.value.status === 'completed' };
  }

  return { STATUS, validate, acceptanceSummary };
});
