/* node test/managed-orchestration-wiring.test.js — proves the canonical orchestration runtime path
   exposes and registers Moe AI Station's managed delegation layer without replacing inherited dispatch. */
'use strict';
const A = require('./_assert.js');
const { makeOrchestrationTools } = require('../sidecar/tools/builtin/orchestration.js');

const roster = new Map([
  ['lead', { role: 'orchestrator', orgRole: 'commander', system: 'lead' }],
  ['worker', { role: 'specialist', orgRole: 'specialist', system: 'worker' }]
]);

const runOnce = async (o) => ({
  reason: 'done', usd: 0.1,
  messages: [{ role: 'assistant', content: JSON.stringify({
    taskId: 'wire-1', agentId: o.agentId, status: 'completed', summary: 'wired', output: 'ok',
    artifacts: [], sources: [], blockers: [], acceptance: [], provenance: { test: true }
  }) }]
});

(async () => {
  const tools = makeOrchestrationTools({
    runOnce,
    roster: () => roster,
    key: 'test-key',
    model: 'test-model',
    perWorker: 1,
    newId: (() => { let n = 0; return () => 'wire_' + (++n); })()
  });

  A.ok(!!tools.dispatchTool, 'inherited team.dispatch remains exposed');
  A.ok(!!tools.managedDispatchTool, 'canonical runtime factory exposes team.delegate_managed');
  A.eq(tools.dispatchTool.name, 'team.dispatch', 'inherited executor identity is unchanged');
  A.eq(tools.managedDispatchTool.name, 'team.delegate_managed', 'managed delegation has its own runtime tool identity');
  A.eq(tools.managedDispatchTool.capability, 'orchestrator', 'managed delegation retains orchestrator capability gating');
  A.eq(tools.managedDispatchTool.scope, 'execute', 'managed delegation remains execute-scoped');
  A.eq(tools.managedDispatchTool.requiresConsent, true, 'managed delegation remains consent-gated');

  const registered = [];
  const reg = { register(tool) { registered.push(tool); return tool; } };
  const returned = tools.register(reg);
  A.eq(returned, reg, 'runtime register chain returns the same registry');
  const names = registered.map(t => t.name);
  A.ok(names.includes('team.dispatch'), 'runtime registry still receives inherited team.dispatch');
  A.ok(names.includes('team.delegate_managed'), 'runtime registry now receives team.delegate_managed');
  A.eq(names.filter(n => n === 'team.delegate_managed').length, 1, 'managed tool is registered exactly once');

  const out = await tools.managedDispatchTool.run({
    taskId: 'wire-1', agentId: 'worker', objective: 'prove runtime wiring', acceptanceCriteria: []
  }, { agentId: 'lead', runId: 'lead-wire' });
  const parsed = JSON.parse(out.content);
  A.eq(parsed.accepted, true, 'managed runtime path executes through inherited dispatch and accepts a valid envelope');
  A.eq(parsed.workerAgentId, 'worker', 'managed runtime result preserves the delegated worker identity');

  A.report('managed-orchestration-wiring.test');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
