'use strict';
const A = require('./_assert.js');
const { attachTaskHistory, rowFromManaged, liveEntry, statusFor } = require('../sidecar/orchestration/task-history-adapter.js');

A.eq(statusFor({ accepted: true }), 'accepted', 'accepted result maps to accepted history status');
A.eq(statusFor({ accepted: false, stage: 'contract' }), 'contract_error', 'contract failure is classified');
A.eq(statusFor({ accepted: false, stage: 'audit' }), 'audit_error', 'audit failure is classified');

const row = rowFromManaged(
  { taskId: 't1', parentTaskId: 'p1', agentId: 'worker', auditorAgentId: 'auditor', objective: 'research', acceptanceCriteria: ['2 sources'] },
  { agentId: 'lead', runId: 'r1' },
  { accepted: true, stage: 'accepted', taskId: 't1', workerAgentId: 'worker', auditorAgentId: 'auditor', attempts: 2, usd: 0.4, findings: [], riskFlags: [], result: { artifacts: ['a.md'], sources: ['s1','s2'] } },
  100, 180
);
A.eq(row.leadAgentId, 'lead', 'history row carries lead provenance');
A.eq(row.workerAgentId, 'worker', 'history row carries worker provenance');
A.eq(row.durationMs, 80, 'history row records duration');
A.eq(row.sources.length, 2, 'history row captures result sources');
const live = liveEntry({ taskId: 't1', agentId: 'worker', objective: 'research' }, { agentId: 'lead', runId: 'r1' }, 90);
A.eq(live.stage, 'dispatch', 'live lifecycle starts at dispatch');
A.eq(live.parentRunId, 'r1', 'live lifecycle carries parent run provenance');

(async () => {
  const records = [];
  const checkpoints = [];
  const liveEvents = [];
  let tick = 10;
  const clock = { now() { return tick += 5; } };
  const store = {
    record(x) { records.push(x); },
    recordCheckpoint(x) { checkpoints.push(JSON.parse(JSON.stringify(x))); },
    activeBegin(x) { liveEvents.push({ type: 'begin', row: x }); return 'live-token'; },
    activeUpdate(token, patch) { liveEvents.push({ type: 'update', token, patch }); return true; },
    activeEnd(token) { liveEvents.push({ type: 'end', token }); return true; }
  };
  const base = {
    name: 'team.delegate_managed',
    run: async (_args, ctx) => {
      A.ok(typeof ctx.reportManagedTaskStage === 'function', 'history adapter injects a private stage reporter into managed execution');
      ctx.reportManagedTaskStage('formal-review');
      ctx.reportManagedTaskStage('audit', { auditorAgentId: 'auditor' });
      ctx.reportManagedTaskStage('accepted');
      return { content: JSON.stringify({ accepted: true, stage: 'accepted', taskId: 't2', workerAgentId: 'worker', auditorAgentId: 'auditor', attempts: 1, usd: 0.25, workerUsd: 0.2, auditUsd: 0.05, budgetUsd: 0.5, result: { artifacts: [], sources: ['s1'] } }) };
    }
  };
  const wrapped = attachTaskHistory(base, store, clock);
  const out = await wrapped.run({ taskId: 't2', agentId: 'worker', objective: 'x' }, { agentId: 'lead', runId: 'run' });
  A.ok(out && out.content, 'wrapped tool preserves original result');
  A.eq(records.length, 1, 'one managed call still creates one terminal history row');
  A.eq(records[0].status, 'accepted', 'successful managed call is persisted as accepted');
  A.eq(records[0].stage, 'accepted', 'terminal accepted stage is durable history');
  A.eq(records[0].usd, 0.25, 'history adapter persists total managed spend');
  A.eq(records[0].workerUsd, 0.2, 'history adapter persists cumulative worker spend');
  A.eq(records[0].auditUsd, 0.05, 'history adapter persists audit spend');
  A.eq(records[0].budgetUsd, 0.5, 'history adapter persists the task budget for comparison');
  A.eq(checkpoints.map(x => x.stage), ['dispatch', 'formal-review', 'audit', 'accepted'], 'managed lifecycle stages are durably checkpointed from initial dispatch onward');
  A.eq(checkpoints[2].auditorAgentId, 'auditor', 'durable audit checkpoint preserves authoritative auditor identity');
  A.eq(liveEvents.map(x => x.type), ['begin', 'update', 'update', 'update', 'end'], 'live lifecycle still wraps execution and forwards every stage transition');
  A.eq(liveEvents.filter(x => x.type === 'update').map(x => x.patch.stage), ['formal-review', 'audit', 'accepted'], 'live tracker receives normalized managed lifecycle stages');
  A.eq(liveEvents.at(-1), { type: 'end', token: 'live-token' }, 'successful managed call leaves live state in finally');

  const beforeThrow = liveEvents.length;
  const checkpointCountBeforeThrow = checkpoints.length;
  const throwing = attachTaskHistory({ run: async () => { throw new Error('boom'); } }, store, clock);
  let threw = false;
  try { await throwing.run({ taskId: 't3', agentId: 'worker', objective: 'x' }, { agentId: 'lead' }); } catch (_) { threw = true; }
  A.eq(threw, true, 'wrapper preserves thrown errors');
  A.eq(records[1].status, 'dispatch_error', 'thrown execution is still recorded as dispatch error');
  A.eq(checkpoints.length, checkpointCountBeforeThrow + 1, 'throwing call still leaves a durable initial checkpoint before execution');
  A.eq(liveEvents.slice(beforeThrow).map(x => x.type), ['begin', 'end'], 'throwing managed call still enters and leaves live state in finally');

  const diagnosticBase = {
    run: async () => ({ content: JSON.stringify({
      accepted: false,
      stage: 'dispatch',
      reason: 'timeout',
      error: 'worker exceeded managed wall clock',
      taskId: 't-diagnostic',
      workerAgentId: 'worker',
      attempts: 1,
      usd: 0.12,
      workerUsd: 0.12,
      auditUsd: 0,
      budgetUsd: 0.1,
      budgetExceeded: true
    }) })
  };
  const diagnostic = attachTaskHistory(diagnosticBase, store, clock);
  await diagnostic.run({ taskId: 't-diagnostic', agentId: 'worker', objective: 'x' }, { agentId: 'lead' });
  A.eq(records[2].reason, 'timeout', 'history adapter preserves machine-readable managed failure reason');
  A.eq(records[2].error, 'worker exceeded managed wall clock', 'history adapter preserves bounded diagnostic text');
  A.eq(records[2].usd, 0.12, 'history adapter preserves billed spend on failed managed work');
  A.eq(records[2].workerUsd, 0.12, 'failed managed work keeps worker spend breakdown');
  A.eq(records[2].budgetUsd, 0.1, 'failed managed work keeps the task budget that was exceeded');
  A.eq(records[2].budgetExceeded, true, 'history adapter preserves verified budget-overrun state');

  const failOpenRecords = [];
  const failOpenCheckpoints = [];
  const failOpen = attachTaskHistory({
    run: async (_args, ctx) => {
      ctx.reportManagedTaskStage('audit', { auditorAgentId: 'auditor' });
      return { content: JSON.stringify({ accepted: false, stage: 'audit', taskId: 't4', workerAgentId: 'worker', auditorAgentId: 'auditor', attempts: 1, usd: 0 }) };
    }
  }, {
    record(x) { failOpenRecords.push(x); },
    recordCheckpoint(x) { failOpenCheckpoints.push(x); },
    activeBegin() { return 'bad-live-token'; },
    activeUpdate() { throw new Error('telemetry unavailable'); },
    activeEnd() { return true; }
  }, clock);
  const failOpenOut = await failOpen.run({ taskId: 't4', agentId: 'worker', objective: 'x' }, { agentId: 'lead' });
  A.ok(failOpenOut && failOpenOut.content, 'live telemetry update failure never aborts managed execution');
  A.eq(failOpenRecords.length, 1, 'durable completion history survives live-stage update failure');
  A.eq(failOpenCheckpoints.map(x => x.stage), ['dispatch', 'audit'], 'durable checkpoints do not depend on live telemetry availability');

  const checkpointFailOpenRecords = [];
  const checkpointFailOpen = attachTaskHistory({
    run: async (_args, ctx) => {
      ctx.reportManagedTaskStage('formal-review');
      return { content: JSON.stringify({ accepted: true, stage: 'accepted', taskId: 't5', workerAgentId: 'worker', attempts: 1, usd: 0 }) };
    }
  }, {
    record(x) { checkpointFailOpenRecords.push(x); },
    recordCheckpoint() { throw new Error('checkpoint storage unavailable'); }
  }, clock);
  const checkpointFailOpenOut = await checkpointFailOpen.run({ taskId: 't5', agentId: 'worker', objective: 'x' }, { agentId: 'lead' });
  A.ok(checkpointFailOpenOut && checkpointFailOpenOut.content, 'checkpoint persistence failure remains fail-open for the managed execution itself');
  A.eq(checkpointFailOpenRecords.length, 1, 'terminal history is still attempted when checkpoint persistence is unavailable');

  A.report('managed-task-history-adapter.test');
})().catch(e => { console.error(e); process.exit(1); });
