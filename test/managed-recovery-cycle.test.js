'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');
const { runManagedRecoveryCycle } = require('../sidecar/orchestration/managed-recovery-cycle.js');

function makeStore() {
  const disk = []; let now = 12000;
  return makeTaskHistoryStore({ io: { readAll() { return disk.slice(); }, append(row) { disk.push(JSON.parse(JSON.stringify(row))); } }, clock: { now() { return now++; } } });
}
function seed(store, taskId, stage) {
  store.recordCheckpoint({ taskId, parentRunId: 'run-' + taskId, leadAgentId: 'lead', workerAgentId: 'worker-' + taskId, objective: 'recover ' + taskId, stage });
}

(async () => {
  const store = makeStore();
  seed(store, 'not-applied', 'dispatch');
  seed(store, 'applied', 'dispatch');
  seed(store, 'unknown', 'dispatch');
  const dispatched = [];
  const registry = {
    async dispatch(call, ctx) {
      dispatched.push(call.args.taskId);
      const boundary = await ctx.beforeToolExecute(call, { name: call.name });
      if (boundary && boundary.ok === false) return boundary;
      return { ok: true, isError: false, summary: 'ok', content: 'ran' };
    }
  };
  const verdicts = { 'not-applied': 'NOT_APPLIED_CONFIRMED', applied: 'APPLIED_CONFIRMED', unknown: 'PENDING' };
  const cycle = await runManagedRecoveryCycle({
    store, registry, leadAgentId: 'lead', limit: 3,
    claimIdFor(candidate) { return 'claim-' + candidate.taskId; },
    async verifyOutcome(request) {
      return { taskId: request.taskId, actionId: request.actionId, authoritative: true, verdict: verdicts[request.taskId], providerRef: 'provider:' + request.taskId };
    }
  });

  A.eq(cycle.phase, 'cycle', 'verifier-enabled lifecycle uses reconciliation cycle');
  A.eq(cycle.reconciliation.discovered, 3, 'bounded uncertain candidates are reconciled');
  A.eq(store.recovery('applied').disposition, 'RECONCILED_APPLIED', 'applied confirmation is durable and not replayable');
  A.eq(store.recovery('unknown').reason, 'authoritative-outcome-unknown', 'unknown provider outcome remains durably frozen');
  A.eq(dispatched, ['not-applied'], 'only confirmed not-applied task reaches existing safe restart executor');
  A.eq(store.recovery('not-applied').disposition, 'RECONCILE_BEFORE_RETRY', 'executed retry crosses the durable dispatch fence again');

  let verifyCalls = 0;
  const safeOnly = makeStore();
  seed(safeOnly, 'safe', 'contract');
  const safeDispatch = [];
  const safe = await runManagedRecoveryCycle({
    store: safeOnly,
    registry: { async dispatch(call, ctx) { safeDispatch.push(call.args.taskId); await ctx.beforeToolExecute(call, { name: call.name }); return { ok: true }; } },
    leadAgentId: 'lead', claimIdFor() { return 'claim-safe'; }
  });
  A.eq(safe.phase, 'batch', 'missing verifier preserves legacy safe-only scheduler path');
  A.eq(safeDispatch, ['safe'], 'safe pre-dispatch recovery still executes without provider reconciliation');
  A.eq(verifyCalls, 0, 'safe-only path invents no provider verification');

  A.report('managed-recovery-cycle.test');
})().catch(error => { console.error(error); process.exitCode = 1; });
