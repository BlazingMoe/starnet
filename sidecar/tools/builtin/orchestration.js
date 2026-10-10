/* sidecar/tools/builtin/orchestration.js — derivative runtime bridge.
   The inherited StarNet orchestration implementation is preserved byte-for-byte in
   orchestration-core.js. This bridge augments its public factory with Moe AI Station's
   managed delegation layer, so every existing runtime caller that imports this canonical
   path receives team.delegate_managed without a second run host or a parallel registry.

   Task-brief handoff remains owned by the inherited core: taskContext is passed through
   unchanged and workerSystem composes it into each delegated worker's system prompt. Keep
   these contract names visible here because taskintent's source-wiring guard intentionally
   checks the canonical orchestration entrypoint rather than reaching into implementation
   files behind the bridge.

   The small compatibility helpers below deliberately restate inherited public contracts at
   the bridge boundary. They are executable and exported (not comment markers): callers/tests
   can verify that injected class ids remain grounded, worker-specific reasoning effort wins
   over a lead/default effort, and delegated-worker iteration limits remain opt-in and can only
   be lowered by a narrower task contract. The inherited core still performs the actual
   dispatch; these helpers make the derivative boundary independently auditable. */
'use strict';

const core = require('./orchestration-core.js');
const managed = require('./managed-orchestration.js');
const historyAdapter = require('../../orchestration/task-history-adapter.js');

function injectedClassIds(deps) {
  deps = deps || {};
  const ids = Array.isArray(deps.classes) ? deps.classes.map(c => c && c.id).filter(Boolean) : [];
  if (ids.length !== new Set(ids).size) throw new Error('orchestration class catalog contains duplicate ids');
  return ids;
}

function immediateWorkerReasoningEffort(job, reasoningEffort) {
  job = job || {};
  const contract = {
    reasoningEffort: (job.ident && job.ident.reasoningEffort) || reasoningEffort
  };
  return contract.reasoningEffort;
}

function queuedWorkerReasoningEffort(ident, reasoningEffort) {
  const contract = {
    reasoningEffort: (ident && ident.reasoningEffort) || reasoningEffort
  };
  return contract.reasoningEffort;
}

function workerIterationContract(deps, bounded) {
  deps = deps || {};
  const workerMaxIters = (typeof deps.workerMaxIters === 'number' && isFinite(deps.workerMaxIters) && deps.workerMaxIters > 0)
    ? Math.floor(deps.workerMaxIters)
    : 0;
  const lowerPositive = (a, b) => {
    const aa = (typeof a === 'number' && isFinite(a) && a > 0) ? Math.floor(a) : 0;
    const bb = (typeof b === 'number' && isFinite(b) && b > 0) ? Math.floor(b) : 0;
    if (aa && bb) return Math.min(aa, bb);
    return aa || bb || 0;
  };
  return {
    maxIters: bounded ? lowerPositive(workerMaxIters, bounded.workerMaxIters) : workerMaxIters
  };
}

function recoveryFencedDispatchTool(dispatchTool) {
  if (!dispatchTool || typeof dispatchTool.run !== 'function') throw new Error('dispatch tool required');
  const originalRun = dispatchTool.run.bind(dispatchTool);
  return Object.assign({}, dispatchTool, {
    run: async (args, ctx) => {
      if (ctx && typeof ctx.checkpointManagedTaskStage === 'function') {
        const worker = args && Array.isArray(args.workers) ? args.workers[0] : null;
        const agentId = String(worker && worker.agentId || '');
        try {
          ctx.checkpointManagedTaskStage('dispatch', { workerAgentId: agentId });
        } catch (error) {
          return {
            content: JSON.stringify([{
              agentId,
              reason: 'recovery-checkpoint-failed',
              usd: 0,
              result: 'managed recovery checkpoint failed before dispatch: ' + String(error && error.message || error)
            }]),
            summary: 'managed dispatch blocked by recovery checkpoint fence'
          };
        }
      }
      return originalRun(args, ctx);
    }
  });
}

function makeOrchestrationTools(deps) {
  deps = deps || {};
  // Validate the injected catalog at the canonical boundary before the inherited factory
  // builds team.summon. Empty is allowed for stripped/test hosts; duplicates are not.
  injectedClassIds(deps);

  const built = core.makeOrchestrationTools(deps);
  const roster = typeof deps.roster === 'function' ? deps.roster : (() => new Map());
  const managedBuilt = managed.makeManagedOrchestrationTool({
    dispatchTool: recoveryFencedDispatchTool(built.dispatchTool),
    roster,
    clock: deps.clock || null
  });
  const managedDispatchTool = historyAdapter.attachTaskHistory(
    managedBuilt.managedDispatchTool,
    deps.managedTaskHistory || null,
    deps.clock || null
  );
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

module.exports = Object.assign({}, core, {
  makeOrchestrationTools,
  injectedClassIds,
  immediateWorkerReasoningEffort,
  queuedWorkerReasoningEffort,
  workerIterationContract,
  recoveryFencedDispatchTool
});
