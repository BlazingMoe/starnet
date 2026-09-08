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
    activeEnd(token) { liveEvents.push({ type: 'end', token }); return true; }
  };
  const base = {
    name: 'team.delegate_managed',
    run: async () => ({ content: JSON.stringify({ accepted: true, stage: 'accepted', taskId: 't2', workerAgentId: 'worker', attempts: 1, usd: 0.2, result: { artifacts: [], sources: ['s1'] } }) })
  };
  const wrapped = attachTaskHistory(base, store, clock);
  const out = await wrapped.run({ taskId: 't2', agentId: 'worker', objective: 'x' }, { agentId: 'lead', runId: 'run' });
  A.ok(out && out.content, 'wrapped tool preserves original result');
  A.eq(records.length, 1, 'one managed call creates one history row');
  A.eq(records[0].status, 'accepted', 'successful managed call is persisted as accepted');
  A.eq(liveEvents[0].type, 'begin', 'successful managed call enters live state before execution');
  A.eq(liveEvents[1], { type: 'end', token: 'live-token' }, 'successful managed call leaves live state in finally');

  const throwing = attachTaskHistory({ run: async () => { throw new Error('boom'); } }, store, clock);
  let threw = false;
  try { await throwing.run({ taskId: 't3', agentId: 'worker', objective: 'x' }, { agentId: 'lead' }); } catch (_) { threw = true; }
  A.eq(threw, true, 'wrapper preserves thrown errors');
  A.eq(records[1].status, 'dispatch_error', 'thrown execution is still recorded as dispatch error');
  A.eq(liveEvents[2].type, 'begin', 'throwing managed call still enters live state');
  A.eq(liveEvents[3].type, 'end', 'throwing managed call is removed from live state in finally');

  A.report('managed-task-history-adapter.test');
})().catch(e => { console.error(e); process.exit(1); });
