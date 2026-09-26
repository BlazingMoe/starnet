'use strict';
const A = require('./_assert.js');
const { makeOrchestrationTools } = require('../sidecar/tools/builtin/orchestration.js');

(async () => {
  const roster = new Map([
    ['lead', { role: 'orchestrator', orgRole: 'commander', system: 'lead' }],
    ['worker', { role: 'specialist', orgRole: 'specialist', system: 'worker' }]
  ]);

  let runOnceCalls = 0;
  let checkpointCalls = 0;
  const durableStages = [];
  const terminal = [];
  const history = {
    record(row) { terminal.push(JSON.parse(JSON.stringify(row))); },
    recordCheckpoint(row) {
      checkpointCalls++;
      if (checkpointCalls >= 3) throw new Error('durable history unavailable');
      durableStages.push(String(row && row.stage || ''));
      return row;
    }
  };

  const tools = makeOrchestrationTools({
    runOnce: async () => {
      runOnceCalls++;
      return { reason: 'done', usd: 0, messages: [] };
    },
    roster: () => roster,
    managedTaskHistory: history,
    key: 'test-key',
    model: 'test-model',
    clock: { now: () => 1700000000000 },
    perWorker: 1,
    newId: (() => { let n = 0; return () => 'fence_' + (++n); })()
  });

  const out = await tools.managedDispatchTool.run(
    { taskId: 'resume-fence-1', agentId: 'worker', objective: 'must not dispatch without durable fence' },
    { agentId: 'lead', runId: 'resume-fence-run' }
  );
  const parsed = JSON.parse(out.content);

  A.eq(runOnceCalls, 0, 'managed worker is never started when the durable pre-dispatch checkpoint cannot be written');
  A.eq(parsed.accepted, false, 'failed recovery fence returns a rejected managed result');
  A.eq(parsed.stage, 'dispatch', 'failed recovery fence remains attributable to dispatch');
  A.eq(parsed.reason, 'recovery-checkpoint-failed', 'failed recovery fence has a machine-readable reason');
  A.eq(parsed.usd, 0, 'blocked pre-dispatch fence cannot invent spend');
  A.eq(durableStages, ['dispatch', 'contract'], 'last durable stage remains pre-side-effect when the dispatch fence fails');
  A.eq(terminal.length, 1, 'failed recovery fence is still terminally recorded through the existing history store');
  A.eq(terminal[0].status, 'dispatch_error', 'terminal history records the real fenced dispatch failure');
  A.eq(terminal[0].reason, 'recovery-checkpoint-failed', 'terminal history preserves the recovery fence reason');

  A.report('managed-recovery-fence.test');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
