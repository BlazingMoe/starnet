/* shared/org-specialties.js — derivative organizational role templates layered on top of inherited classes.
   These are declarative identities/loadout intents, not capability grants. Runtime permission/capability gates remain authoritative. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).orgSpecialties = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEMPLATES = Object.freeze([
    Object.freeze({
      id: 'research-manager', name: 'Research Manager', orgRole: 'manager', runtimeRole: 'specialist',
      mission: 'Decompose research goals, assign independent evidence-gathering subtasks, reconcile conflicts, and escalate uncertainty.',
      preferredCapabilities: Object.freeze(['web', 'files', 'memory', 'orchestrator']),
      quality: Object.freeze(['source diversity', 'claim-to-source traceability', 'counterevidence', 'uncertainty disclosure'])
    }),
    Object.freeze({
      id: 'engineering-manager', name: 'Engineering Manager', orgRole: 'manager', runtimeRole: 'specialist',
      mission: 'Break engineering work into bounded implementation, verification, and review tasks while preserving rollback and testability.',
      preferredCapabilities: Object.freeze(['files', 'terminal', 'memory', 'orchestrator']),
      quality: Object.freeze(['tests', 'regression risk', 'rollback path', 'security boundary preservation'])
    }),
    Object.freeze({
      id: 'independent-auditor', name: 'Independent Auditor', orgRole: 'specialist', runtimeRole: 'specialist',
      mission: 'Independently judge completed work against the original contract, evidence, provenance, and risk without rewriting the result.',
      preferredCapabilities: Object.freeze(['web', 'files', 'memory']),
      quality: Object.freeze(['unsupported claims', 'hallucination risk', 'missing verification', 'weak provenance', 'criteria coverage']),
      constraints: Object.freeze(['must not audit own work', 'must not silently change task objective', 'must return structured verdict'])
    }),
    Object.freeze({
      id: 'fact-checker', name: 'Evidence Checker', orgRole: 'specialist', runtimeRole: 'specialist',
      mission: 'Verify factual claims against primary or high-quality independent sources and report contradictions explicitly.',
      preferredCapabilities: Object.freeze(['web', 'files', 'memory']),
      quality: Object.freeze(['primary-source preference', 'date sensitivity', 'contradiction detection', 'citation integrity'])
    }),
    Object.freeze({
      id: 'research-worker', name: 'Research Worker', orgRole: 'worker', runtimeRole: 'specialist',
      mission: 'Execute one narrow evidence-gathering subtask and return a structured result with sources and acceptance evidence.',
      preferredCapabilities: Object.freeze(['web', 'files', 'memory']),
      quality: Object.freeze(['scope discipline', 'evidence capture', 'explicit blockers'])
    }),
    Object.freeze({
      id: 'engineering-worker', name: 'Engineering Worker', orgRole: 'worker', runtimeRole: 'specialist',
      mission: 'Implement one bounded engineering subtask and return artifacts, tests, limitations, and acceptance evidence.',
      preferredCapabilities: Object.freeze(['files', 'terminal', 'memory']),
      quality: Object.freeze(['minimal change', 'test evidence', 'failure disclosure', 'artifact provenance'])
    })
  ]);

  const BY_ID = Object.freeze(TEMPLATES.reduce(function (m, t) { m[t.id] = t; return m; }, {}));

  function get(id) { return BY_ID[String(id || '').trim()] || null; }
  function list() { return TEMPLATES.slice(); }
  function forOrgRole(role) { const r = String(role || '').trim().toLowerCase(); return TEMPLATES.filter(t => t.orgRole === r); }

  return { TEMPLATES, get, list, forOrgRole };
});
