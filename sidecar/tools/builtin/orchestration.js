/* sidecar/tools/builtin/orchestration.js — derivative runtime bridge.
   The inherited StarNet orchestration implementation is preserved byte-for-byte in
   orchestration-core.js. This bridge augments its public factory with Moe AI Station's
   managed delegation layer, so every existing runtime caller that imports this canonical
   path receives team.delegate_managed without a second run host or a parallel registry. */
'use strict';

const core = require('./orchestration-core.js');
const managed = require('./managed-orchestration.js');

function makeOrchestrationTools(deps) {
  deps = deps || {};
  const built = core.makeOrchestrationTools(deps);
  const roster = typeof deps.roster === 'function' ? deps.roster : (() => new Map());
  const managedBuilt = managed.makeManagedOrchestrationTool({
    dispatchTool: built.dispatchTool,
    roster
  });
  const managedDispatchTool = managedBuilt.managedDispatchTool;
  const inheritedRegister = built.register;

  return Object.assign({}, built, {
    managedDispatchTool,
    register(reg) {
      if (typeof inheritedRegister === 'function') inheritedRegister(reg);
      reg.register(managedDispatchTool);
      return reg;
    }
  });
}

module.exports = Object.assign({}, core, { makeOrchestrationTools });
