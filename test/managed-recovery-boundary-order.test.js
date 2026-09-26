'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');
const { restartManagedTask } = require('../sidecar/orchestration/managed-recovery-runner.js');

function makeStore() {
  const disk = [];
  let now = 12000;
  return makeTaskHistoryStore({
    io: {
      readAll() { return disk.slice(); },
      append(row) { disk.push(JSON.parse(JSON.stringify(row))); }
    },
    clock: { now() { return now++; } }
  });
}

(async () => {
  const authority = makeStore();
  authority.recordCheckpoint({
    taskId: 'boundary-order',
    parentRunId: 'run-boundary-order',
    leadAgentId: 'lead-boundary-order',
    workerAgentId: 'worker-boundary-order',
    objective: 'preserve host pre-tool refusal before recovery fence',
    acceptanceCriteria: ['tool must not run after inherited boundary refusal'],
    stage: 'contract',
    startedAt: 11990
  });

  let fenceCalls = 0;
  const store = {
    recovery(taskId) { return authority.recovery(taskId); },
    claimSafeRestart(taskId, claimId) { return authority.claimSafeRestart(taskId, claimId); },
    fenceSafeRestartClaim(taskId, claimId) {
      fenceCalls++;
      return authority.fenceSafeRestartClaim(taskId, claimId);
    },
    releaseSafeRestartClaim(taskId, claimId) { return authority.releaseSafeRestartClaim(taskId, claimId); }
  };

  let inheritedCalls = 0;
  let toolRan = false;
  const inheritedRefusal = {
    ok: false,
    isError: true,
    summary: 'host-boundary-refused',
    content: 'blocked before tool execution'
  };
  const registry = {
    async dispatch(call, ctx) {
      const boundary = await ctx.beforeToolExecute(call, { name: call.name });
      if (boundary && boundary.ok === false) return boundary;
      toolRan = true;
      return { ok: true, isError: false, summary: 'unexpected', content: 'ran' };
    }
  };

  const result = await restartManagedTask({
    registry,
    store,
    taskId: 'boundary-order',
    claimId: 'claim-boundary-order',
    ambientCtx: {
      beforeToolExecute: async () => {
        inheritedCalls++;
        return inheritedRefusal;
      }
    }
  });

  A.eq(result.ok, false, 'inherited host boundary refusal blocks managed recovery dispatch');
  A.eq(result.result.summary, 'host-boundary-refused', 'original host boundary result is preserved');
  A.eq(inheritedCalls, 1, 'existing host boundary runs exactly once');
  A.eq(fenceCalls, 0, 'recovery fence is never crossed after an inherited pre-tool refusal');
  A.eq(toolRan, false, 'managed tool never runs after inherited pre-tool refusal');
  A.eq(result.boundaryCrossed, false, 'recovery reports that its durable execution boundary was not crossed');
  A.eq(result.claimReleased, true, 'provably pre-execution refusal releases the authoritative recovery claim');
  A.eq(result.executionMayHaveStarted, false, 'pre-tool refusal never invents possible execution');
  A.eq(authority.recovery('boundary-order').disposition, 'SAFE_RESTART', 'authoritative task history remains safely replayable');

  A.report('managed-recovery-boundary-order.test');
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
