/* sidecar/orchestration/delegation-adapter.js — validates derivative task contracts before inherited dispatch. */
'use strict';
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./role-policy.js') : (root.SK && root.SK.rolePolicy),
    typeof require === 'function' ? require('./org-role.js') : (root.SK && root.SK.orgRole)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { (root.SK = root.SK || {}).delegationAdapter = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rolePolicy, orgRole) {
  'use strict';

  function buildContract(opts) {
    opts = opts || {};
    const from = opts.fromAgent || {};
    const to = opts.toAgent || {};
    const input = Object.assign({}, opts.contract || {}, {
      requestedBy: String(from.id || from.agentId || ''),
      assignedTo: String(to.id || to.agentId || ''),
      fromRole: orgRole.resolveOrgRole(from),
      toRole: orgRole.resolveOrgRole(to)
    });
    return rolePolicy.validateTaskContract(input);
  }

  function prepareWorker(opts) {
    opts = opts || {};
    const checked = buildContract(opts);
    if (!checked.ok) return checked;
    const c = checked.value;
    return {
      ok: true,
      value: {
        agentId: c.assignedTo,
        prompt: c.objective,
        context: [
          'TASK CONTRACT v' + c.schemaVersion,
          'taskId: ' + c.id,
          c.parentTaskId ? ('parentTaskId: ' + c.parentTaskId) : '',
          c.acceptanceCriteria.length ? ('acceptanceCriteria:\n- ' + c.acceptanceCriteria.join('\n- ')) : '',
          c.deadlineAt != null ? ('deadlineAt: ' + c.deadlineAt) : '',
          c.budgetUsd != null ? ('budgetUsd: ' + c.budgetUsd) : '',
          c.tags.length ? ('tags: ' + c.tags.join(', ')) : ''
        ].filter(Boolean).join('\n'),
        taskContract: c
      }
    };
  }

  return { buildContract, prepareWorker };
});
