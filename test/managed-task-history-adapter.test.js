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
  const liveEvents = [];
  let tick = 10;
  const clock = { now() { return tick += 5; } };
  const store = {
    record(x) { records.push(x); },
    activeBegin(x) { liveEvents.push({ type: 'begin', row: x }); return 'live-token'; },
    activeUpdate(token, patch) { liveEvents.push({ type: 'update', token, patch }); return true; },
    activeEnd(token) { liveEvents.push({ type: 'end', token }); return true; }
  };
  const base = {
    name: 'team.delegate_managed',
    run: async (_args, ctx) => {
      A.ok(typeof ctx.reportManagedTaskStage === 'function', 'history adapter injects a private live-stage reporter into managed execution');
      ctx.reportManagedTaskStage('formal-review');
      ctx.reportManagedTaskStage('audit', { auditorAgentId: 'auditor' });
      ctx.reportManagedTaskStage('accepted');
      return { content: JSON.stringify({ accepted: true, stage: 'accepted', taskId: 't2', workerAgentId: 'worker', auditorAgentId: 'auditor', attempts: 1, usd: 0.2, result: { artifacts: [], sources: ['s1'] } }) };
    }
  };
  const wrapped = attachTaskHistory(base, store, clock);
  const out = await wrapped.run({ taskId: 't2', agentId: 'worker', objective: 'x' }, { agentId: 'lead', runId: 'run' });
  A.ok(out && out.content, 'wrapped tool preserves original result');
  A.eq(records.length, 1, 'one managed call creates one history row');
  A.eq(records[0].status, 'accepted', 'successful managed call is persisted as accepted');
  A.eq(records[0].stage, 'accepted', 'terminal accepted stage is durable history');
  A.eq(liveEvents.map(x => x.type), ['begin', 'update', 'update', 'update', 'end'], 'live lifecycle wraps execution and forwards every stage transition');
  A.eq(liveEvents.filter(x => x.type === 'update').map(x => x.patch.stage), ['formal-review', 'audit', 'accepted'], 'live tracker receives normalized managed lifecycle stages');
  A.eq(liveEvents.find(x => x.type === 'update' && x.patch.stage === 'audit').patch.auditorAgentId, 'auditor', 'audit stage forwards authoritative auditor identity');
  A.eq(liveEvents.at(-1), { type: 'end', token: 'live-token' }, 'successful managed call leaves live state in finally');

  const beforeThrow = liveEvents.length;
  const throwing = attachTaskHistory({ run: async () => { throw new Error('boom'); } }, store, clock);
  let threw = false;
  try { await throwing.run({ taskId: 't3', agentId: 'worker', objective: 'x' }, { agentId: 'lead' }); } catch (_) { threw = true; }
  A.eq(threw, true, 'wrapper preserves thrown errors');
  A.eq(records[1].status, 'dispatch_error', 'thrown execution is still recorded as dispatch error');
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
      usd: 0.12
    }) })
  };
  const diagnostic = attachTaskHistory(diagnosticBase, store, clock);
  await diagnostic.run({ taskId: 't-diagnostic', agentId: 'worker', objective: 'x' }, { agentId: 'lead' });
  A.eq(records[2].reason, 'timeout', 'history adapter preserves machine-readable managed failure reason');
  A.eq(records[2].error, 'worker exceeded managed wall clock', 'history adapter preserves bounded diagnostic text');
  A.eq(records[2].usd, 0.12, 'history adapter preserves billed spend on failed managed work');

  const failOpenRecords = [];
  const failOpen = attachTaskHistory({
    run: async (_args, ctx) => {
      ctx.reportManagedTaskStage('audit', { auditorAgentId: 'auditor' });
      return { content: JSON.stringify({ accepted: false, stage: 'audit', taskId: 't4', workerAgentId: 'worker', auditorAgentId: 'auditor', attempts: 1, usd: 0 }) };
    }
  }, {
    record(x) { failOpenRecords.push(x); },
    activeBegin() { return 'bad-live-token'; },
    activeUpdate() { throw new Error('telemetry unavailable'); },
    activeEnd() { return true; }
  }, clock);
  const failOpenOut = await failOpen.run({ taskId: 't4', agentId: 'worker', objective: 'x' }, { agentId: 'lead' });
  A.ok(failOpenOut && failOpenOut.content, 'live telemetry update failure never aborts managed execution');
  A.eq(failOpenRecords.length, 1, 'durable completion history survives live-stage update failure');

  A.report('managed-task-history-adapter.test');
})().catch(e => { console.error(e); process.exit(1); });
