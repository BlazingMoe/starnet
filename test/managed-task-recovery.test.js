'use strict';
const A = require('./_assert.js');
const { makeTaskHistoryStore } = require('../sidecar/orchestration/task-history.js');
const { buildManagedResumeRequest, buildManagedResumeContext, claimManagedSafeRestart, executeClaimedManagedRestart } = require('../sidecar/orchestration/task-recovery.js');

const disk = [];
const io = {
  readAll() { return disk.slice(); },
  append(row) { disk.push(JSON.parse(JSON.stringify(row))); }
};
let now = 5000;
const clock = { now() { return now++; } };
const store = makeTaskHistoryStore({ io, clock });

store.recordCheckpoint({
  taskId: 'safe-1', parentTaskId: 'root-1', parentRunId: 'run-1', leadAgentId: 'lead', workerAgentId: 'worker',
  auditorAgentId: 'auditor', objective: 'resume this exact contract', acceptanceCriteria: ['artifact exists', 'two sources'],
  tags: ['research', 'daily-driver'], deadlineAt: 9000, budgetUsd: 1.25, requireAudit: true, maxRevisions: 2,
  stage: 'contract', startedAt: 4900
});

const recovery = store.recovery('safe-1');
const built = buildManagedResumeRequest(recovery);
A.eq(built.ok, true, 'pre-dispatch durable checkpoint can produce a resume request');
A.eq(built.disposition, 'SAFE_RESTART', 'resume request preserves the conservative recovery disposition');
A.eq(built.executionMayHaveStarted, false, 'safe resume request proves execution had not crossed the dispatch fence');
A.eq(built.taskId, 'safe-1', 'resume request preserves task identity');
A.eq(built.leadAgentId, 'lead', 'resume request preserves the original lead identity separately from tool args');
A.eq(built.originalParentRunId, 'run-1', 'resume request preserves original run provenance for a later executor');
A.eq(built.args, {
  taskId: 'safe-1', parentTaskId: 'root-1', agentId: 'worker', objective: 'resume this exact contract',
  acceptanceCriteria: ['artifact exists', 'two sources'], tags: ['research', 'daily-driver'], requireAudit: true,
  maxRevisions: 2, deadlineAt: 9000, budgetUsd: 1.25, auditorAgentId: 'auditor'
}, 'resume request reconstructs the original managed contract without widening it');
A.eq(built.derivedFrom, 'moe.managed-task-checkpoint.v1', 'resume request declares its authoritative derivation source');

const resumeCtx = buildManagedResumeContext(built, { agentId: 'recovery-runner', runId: 'new-run', consent: 'ambient', traceId: 'trace-1' });
A.eq(resumeCtx.ok, true, 'safe resume request can reconstruct the managed execution context');
A.eq(resumeCtx.ctx.agentId, 'lead', 'resume context restores the original lead identity');
A.eq(resumeCtx.ctx.runId, 'run-1', 'resume context restores the original parent run provenance');
A.eq(resumeCtx.ctx.consent, 'ambient', 'resume context preserves ambient host services instead of inventing a second execution host');
A.eq(resumeCtx.ctx.traceId, 'trace-1', 'resume context preserves unrelated ambient context');
A.eq(resumeCtx.ctx.managedRecovery.taskId, 'safe-1', 'resume context carries explicit recovery provenance');
A.eq(resumeCtx.provenance, { leadAgentId: 'lead', parentRunId: 'run-1', source: 'moe.managed-task-checkpoint.v1' }, 'resume provenance is machine-readable');

const missingRun = buildManagedResumeContext(Object.assign({}, built, { originalParentRunId: '' }), {});
A.eq(missingRun.ok, false, 'resume cannot silently mint a new run when original run provenance is missing');
A.eq(missingRun.reason, 'incomplete-resume-provenance', 'missing original run provenance is an explicit blocker');

const missingLead = buildManagedResumeContext(Object.assign({}, built, { leadAgentId: '' }), {});
A.eq(missingLead.ok, false, 'resume cannot infer a replacement lead identity');
A.eq(missingLead.reason, 'incomplete-resume-provenance', 'missing lead provenance is an explicit blocker');

store.recordCheckpoint({
  taskId: 'unsafe-1', parentRunId: 'run-2', leadAgentId: 'lead', workerAgentId: 'worker',
  objective: 'may already have run', stage: 'dispatch', startedAt: 4950
});
const unsafe = buildManagedResumeRequest(store.recovery('unsafe-1'));
A.eq(unsafe.ok, false, 'post-dispatch recovery cannot produce a replay request');
A.eq(unsafe.reason, 'reconciliation-required', 'unsafe recovery is blocked on reconciliation rather than guessed');
A.eq(unsafe.disposition, 'RECONCILE_BEFORE_RETRY', 'unsafe recovery keeps the authoritative disposition');
A.eq(unsafe.executionMayHaveStarted, true, 'unsafe recovery preserves possible prior execution');
A.eq(buildManagedResumeContext(unsafe, {}).ok, false, 'unsafe recovery result cannot be promoted into an execution context');

store.record({ taskId: 'done-1', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'finished', status: 'accepted', stage: 'accepted', accepted: true });
const terminal = buildManagedResumeRequest(store.recovery('done-1'));
A.eq(terminal.ok, false, 'terminal task never produces a resume request');
A.eq(terminal.reason, 'terminal-task', 'terminal replay refusal is machine-readable');

const unknown = buildManagedResumeRequest(store.recovery('missing'));
A.eq(unknown.ok, false, 'unknown task never becomes resumable by inference');
A.eq(unknown.reason, 'no-resumable-checkpoint', 'missing durable evidence is explicit');

const forged = buildManagedResumeRequest({
  state: 'RESUME_REQUIRED',
  disposition: 'SAFE_RESTART',
  checkpoint: { schemaVersion: 'moe.managed-task-checkpoint.v1', taskId: 'forged', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'x', stage: 'dispatch' }
});
A.eq(forged.ok, false, 'caller-supplied SAFE_RESTART cannot override the checkpoint stage');
A.eq(forged.reason, 'reconciliation-required', 'resume safety is recomputed from authoritative checkpoint evidence');

store.recordCheckpoint({
  taskId: 'claim-plan-1', parentTaskId: 'root-2', parentRunId: 'run-claim', leadAgentId: 'lead-claim', workerAgentId: 'worker-claim',
  objective: 'prepare exactly once', acceptanceCriteria: ['same contract'], tags: ['recovery'], budgetUsd: 2,
  requireAudit: false, maxRevisions: 1, stage: 'contract', startedAt: 4990
});
const plan = claimManagedSafeRestart(store, 'claim-plan-1', 'claim-token-1', { agentId: 'ambient-lead', runId: 'ambient-run', consent: 'ambient-consent' });
A.eq(plan.ok, true, 'safe restart preparation atomically claims the durable task');
A.eq(plan.claimId, 'claim-token-1', 'prepared plan preserves caller claim identity');
A.eq(plan.args.taskId, 'claim-plan-1', 'prepared plan preserves original task identity');
A.eq(plan.args.agentId, 'worker-claim', 'prepared plan preserves original worker identity');
A.eq(plan.ctx.agentId, 'lead-claim', 'prepared plan restores original lead provenance');
A.eq(plan.ctx.runId, 'run-claim', 'prepared plan restores original parent run provenance');
A.eq(plan.ctx.consent, 'ambient-consent', 'prepared plan carries ambient host consent service through unchanged');
A.eq(plan.ctx.managedRecovery.claimId, 'claim-token-1', 'prepared plan carries the durable claim identity into execution context');
A.eq(plan.claimedCheckpoint.stage, 'resume-claimed', 'prepared plan is backed by a durable active claim');
A.eq(plan.claimedCheckpoint.recoveryClaimId, 'claim-token-1', 'durable checkpoint records the same claim token');
A.eq(plan.executionMayHaveStarted, false, 'claim preparation itself does not pretend worker execution began');
A.eq(plan.next, 'dispatch-through-authoritative-managed-tool', 'prepared plan names the existing managed tool as the only execution path');

const duplicatePlan = claimManagedSafeRestart(store, 'claim-plan-1', 'claim-token-2', {});
A.eq(duplicatePlan.ok, false, 'a second recovery runner cannot prepare the already claimed task');
A.eq(duplicatePlan.reason, 'reconciliation-required', 'active durable claim blocks a second replay instead of racing it');

store.recordCheckpoint({
  taskId: 'claim-race-1', parentRunId: 'race-run', leadAgentId: 'race-lead', workerAgentId: 'race-worker',
  objective: 'detect authority change', stage: 'contract', startedAt: 4995
});
const racingStore = {
  recovery(id) { return store.recovery(id); },
  claimSafeRestart(id) {
    store.recordCheckpoint({ taskId: id, parentRunId: 'race-run', leadAgentId: 'race-lead', workerAgentId: 'race-worker', objective: 'detect authority change', stage: 'dispatch', startedAt: 4995 });
    return store.claimSafeRestart(id, 'claim-never-wins');
  }
};
const raced = claimManagedSafeRestart(racingStore, 'claim-race-1', 'claim-token-race', {});
A.eq(raced.ok, false, 'authority change between recovery read and claim cannot produce an executable plan');
A.eq(raced.reason, 'not-safe-to-claim', 'atomic claim rechecks the authoritative state at the write boundary');
A.eq(store.recovery('claim-race-1').executionMayHaveStarted, true, 'race loser preserves the newer post-dispatch truth');

const noAuthority = claimManagedSafeRestart(null, 'x', 'y', {});
A.eq(noAuthority.ok, false, 'restart preparation requires an authoritative recovery store');
A.eq(noAuthority.reason, 'recovery-authority-unavailable', 'missing recovery authority is explicit');

function seedRestart(taskId) {
  store.recordCheckpoint({
    taskId, parentRunId: 'run-' + taskId, leadAgentId: 'lead-' + taskId, workerAgentId: 'worker-' + taskId,
    objective: 'resume ' + taskId, stage: 'contract', startedAt: 5000
  });
  return claimManagedSafeRestart(store, taskId, 'claim-' + taskId, {});
}

const deniedPlan = seedRestart('exec-denied');
let deniedRan = false;
const deniedRegistry = {
  async dispatch() {
    deniedRan = true;
    return { ok: false, isError: true, summary: 'capdenied', content: 'capability denied' };
  }
};

const crossedPlan = seedRestart('exec-crossed');
let crossedRan = false;
const crossedRegistry = {
  async dispatch(call, ctx) {
    const boundary = await ctx.beforeToolExecute(call, { name: call.name });
    if (boundary && boundary.ok === false) return boundary;
    crossedRan = true;
    return { ok: true, isError: false, summary: 'ok', content: 'ran' };
  }
};

const inheritedPlan = seedRestart('exec-inherited-stop');
let inheritedToolRan = false;
inheritedPlan.ctx.beforeToolExecute = async () => ({ ok: false, isError: true, summary: 'journal-stop', content: 'journal refused' });
const inheritedRegistry = {
  async dispatch(call, ctx) {
    const boundary = await ctx.beforeToolExecute(call, { name: call.name });
    if (boundary && boundary.ok === false) return boundary;
    inheritedToolRan = true;
    return { ok: true, isError: false, summary: 'ok', content: 'ran' };
  }
};

(async () => {
  const denied = await executeClaimedManagedRestart(deniedRegistry, store, deniedPlan);
  A.eq(deniedRan, true, 'recovery executor uses the supplied authoritative registry instead of bypassing it');
  A.eq(denied.ok, false, 'pre-boundary registry refusal remains a failed execution attempt');
  A.eq(denied.boundaryCrossed, false, 'pre-boundary registry refusal does not invent worker execution');
  A.eq(denied.claimReleased, true, 'claim is released when registry proves the tool boundary was never reached');
  A.eq(store.recovery('exec-denied').disposition, 'SAFE_RESTART', 'early refusal returns durable recovery to the original safe contract state');

  const crossed = await executeClaimedManagedRestart(crossedRegistry, store, crossedPlan);
  A.eq(crossedRan, true, 'managed tool may run only after the durable recovery fence succeeds');
  A.eq(crossed.ok, true, 'successful authoritative dispatch is returned to the caller');
  A.eq(crossed.boundaryCrossed, true, 'executor records that the durable side-effect boundary was crossed');
  A.eq(crossed.claimReleased, false, 'claim is never rolled back after crossing the durable dispatch boundary');
  A.eq(store.recovery('exec-crossed').disposition, 'RECONCILE_BEFORE_RETRY', 'post-boundary recovery becomes conservative instead of replayable');
  A.eq(store.recovery('exec-crossed').executionMayHaveStarted, true, 'durable dispatch fence is the authority for possible execution');

  const inherited = await executeClaimedManagedRestart(inheritedRegistry, store, inheritedPlan);
  A.eq(inheritedToolRan, false, 'an inherited host dispatch callback can still stop execution');
  A.eq(inherited.ok, false, 'inherited host boundary refusal is propagated');
  A.eq(inherited.boundaryCrossed, true, 'recovery fence remains crossed when a later host boundary refuses');
  A.eq(inherited.claimReleased, false, 'executor never rewinds durable state after any later-boundary uncertainty');
  A.eq(store.recovery('exec-inherited-stop').disposition, 'RECONCILE_BEFORE_RETRY', 'later host refusal stays conservative rather than becoming an unsafe auto-retry');

  A.report('managed-task-recovery.test');
})().catch(error => { console.error(error); process.exitCode = 1; });