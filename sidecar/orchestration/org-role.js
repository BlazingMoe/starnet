/* sidecar/orchestration/org-role.js — compatibility bridge between inherited runtime roles and derivative org roles. */
'use strict';
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./role-policy.js') : (root.SK && root.SK.rolePolicy)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).orgRole = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rolePolicy) {
  'use strict';

  const LEGACY_TO_ORG = Object.freeze({ orchestrator: 'commander', specialist: 'specialist' });
  const ORG_TO_LEGACY = Object.freeze({ commander: 'orchestrator', manager: 'specialist', specialist: 'specialist', worker: 'specialist' });

  function normalizeLegacyRole(value) {
    const v = String(value == null ? '' : value).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(LEGACY_TO_ORG, v) ? v : null;
  }

  function resolveOrgRole(agent) {
    agent = agent && typeof agent === 'object' ? agent : {};
    const explicit = rolePolicy && typeof rolePolicy.normalizeRole === 'function' ? rolePolicy.normalizeRole(agent.orgRole) : null;
    if (explicit) return explicit;
    const legacy = normalizeLegacyRole(agent.role);
    return legacy ? LEGACY_TO_ORG[legacy] : null;
  }

  function withOrgRole(agent, requested) {
    if (!agent || typeof agent !== 'object' || Array.isArray(agent)) return { ok: false, error: 'agent' };
    const orgRole = rolePolicy && typeof rolePolicy.normalizeRole === 'function' ? rolePolicy.normalizeRole(requested) : null;
    if (!orgRole) return { ok: false, error: 'orgRole' };
    const out = Object.assign({}, agent, { orgRole: orgRole });
    // Preserve an existing inherited role exactly. New records receive the narrowest compatible legacy role.
    if (!normalizeLegacyRole(out.role)) out.role = ORG_TO_LEGACY[orgRole];
    return { ok: true, value: out };
  }

  function migrateAgent(agent) {
    if (!agent || typeof agent !== 'object' || Array.isArray(agent)) return agent;
    if (rolePolicy && typeof rolePolicy.normalizeRole === 'function' && rolePolicy.normalizeRole(agent.orgRole)) return agent;
    const derived = resolveOrgRole(agent);
    if (!derived) return agent;
    return Object.assign({}, agent, { orgRole: derived });
  }

  return { LEGACY_TO_ORG, ORG_TO_LEGACY, normalizeLegacyRole, resolveOrgRole, withOrgRole, migrateAgent };
});
