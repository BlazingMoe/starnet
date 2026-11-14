/* sidecar/orchestration/role-policy.js — derivative hierarchy and task-contract policy.
   Pure policy only: this module does not grant tools, bypass consent, spawn processes, or mutate runtime state.
   It answers two questions for the host orchestration layer:
     1) may role A delegate to role B?
     2) is a delegation task contract structurally valid?

   The existing capability/permission broker remains authoritative for every concrete tool call. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).rolePolicy = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROLE_ORDER = Object.freeze(['commander', 'manager', 'specialist', 'worker']);
  const ROLE_RANK = Object.freeze({ commander: 4, manager: 3, specialist: 2, worker: 1 });
  const DELEGATES_TO = Object.freeze({
    commander: Object.freeze(['manager', 'specialist', 'worker']),
    manager: Object.freeze(['specialist', 'worker']),
    specialist: Object.freeze(['worker']),
    worker: Object.freeze([])
  });

  const MAX_CONTRACT_TEXT = 12000;
  const MAX_ACCEPTANCE = 32;
  const MAX_TAGS = 32;

  function normalizeRole(value) {
    const role = String(value == null ? '' : value).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(ROLE_RANK, role) ? role : null;
  }

  function canDelegate(fromRole, toRole) {
    const from = normalizeRole(fromRole);
    const to = normalizeRole(toRole);
    if (!from || !to) return false;
    return DELEGATES_TO[from].indexOf(to) >= 0;
  }

  function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function stringArray(value, max) {
    if (value == null) return { ok: true, value: [] };
    if (!Array.isArray(value) || value.length > max) return { ok: false, value: [] };
    const out = [];
    for (const item of value) {
      const text = cleanText(item);
      if (!text || text.length > 1000) return { ok: false, value: [] };
      out.push(text);
    }
    return { ok: true, value: out };
  }

  function validateTaskContract(input) {
    const c = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const errors = [];

    const id = cleanText(c.id);
    const objective = cleanText(c.objective);
    const requestedBy = cleanText(c.requestedBy);
    const assignedTo = cleanText(c.assignedTo);
    const fromRole = normalizeRole(c.fromRole);
    const toRole = normalizeRole(c.toRole);

    if (!id || id.length > 200) errors.push('id');
    if (!objective || objective.length > MAX_CONTRACT_TEXT) errors.push('objective');
    if (!requestedBy || requestedBy.length > 200) errors.push('requestedBy');
    if (!assignedTo || assignedTo.length > 200) errors.push('assignedTo');
    if (!fromRole) errors.push('fromRole');
    if (!toRole) errors.push('toRole');
    if (fromRole && toRole && !canDelegate(fromRole, toRole)) errors.push('delegation');

    const acceptance = stringArray(c.acceptanceCriteria, MAX_ACCEPTANCE);
    if (!acceptance.ok) errors.push('acceptanceCriteria');
    const tags = stringArray(c.tags, MAX_TAGS);
    if (!tags.ok) errors.push('tags');

    let deadlineAt = null;
    if (c.deadlineAt != null) {
      deadlineAt = Number(c.deadlineAt);
      if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) errors.push('deadlineAt');
    }

    let budgetUsd = null;
    if (c.budgetUsd != null) {
      budgetUsd = Number(c.budgetUsd);
      if (!Number.isFinite(budgetUsd) || budgetUsd < 0) errors.push('budgetUsd');
    }

    const parentTaskId = c.parentTaskId == null ? null : cleanText(c.parentTaskId);
    if (c.parentTaskId != null && (!parentTaskId || parentTaskId.length > 200)) errors.push('parentTaskId');

    const provenance = c.provenance == null ? {} : c.provenance;
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) errors.push('provenance');

    if (errors.length) return { ok: false, errors: errors };

    return {
      ok: true,
      value: {
        schemaVersion: 1,
        id: id,
        parentTaskId: parentTaskId,
        objective: objective,
        requestedBy: requestedBy,
        assignedTo: assignedTo,
        fromRole: fromRole,
        toRole: toRole,
        acceptanceCriteria: acceptance.value,
        tags: tags.value,
        deadlineAt: deadlineAt,
        budgetUsd: budgetUsd,
        provenance: Object.assign({}, provenance)
      }
    };
  }

  function roleSnapshot() {
    return ROLE_ORDER.map(function (role) {
      return { role: role, rank: ROLE_RANK[role], delegatesTo: DELEGATES_TO[role].slice() };
    });
  }

  return {
    ROLE_ORDER: ROLE_ORDER,
    ROLE_RANK: ROLE_RANK,
    DELEGATES_TO: DELEGATES_TO,
    normalizeRole: normalizeRole,
    canDelegate: canDelegate,
    validateTaskContract: validateTaskContract,
    roleSnapshot: roleSnapshot
  };
});
