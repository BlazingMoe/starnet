'use strict';
const A = require('./_assert.js');
const managed = require('../sidecar/orchestration/managed-delegation.js');

const fromAgent = { id: 'boss', role: 'orchestrator', orgRole: 'manager' };
const toAgent = { id: 'worker1', role: 'specialist', orgRole: 'specialist' };
const contract = {
  id: 't1', objective: 'Research X', acceptanceCriteria: ['Cite two sources'], budgetUsd: 1,
  provenance: {}
};

function env(passed) {
  return {
    taskId: 't1', agentId: 'worker1', status: 'completed', summary: 'done', output: 'answer',
    artifacts: [], sources: ['a', 'b'], blockers: [], provenance: {},
    acceptance: [{ criterion: 'Cite two sources', passed: !!passed, evidence: passed ? 'a + b' : 'only a' }]
  };
}

(async () => {
  let calls = 0;
  let r = await managed.run({
    fromAgent, toAgent, contract,
    dispatch: async () => { calls++; return env(true); }
  });
  A.ok(r.ok && r.accepted, 'valid first result is accepted');
  A.eq(calls, 1, 'accepted result does not retry');

  calls = 0;
  r = await managed.run({
    fromAgent, toAgent, contract, maxRevisions: 1,
    dispatch: async (job) => { calls++; return calls === 1 ? env(false) : env(true); }
  });
  A.ok(r.ok && r.accepted, 'failed acceptance can be repaired once');
  A.eq(calls, 2, 'one bounded revision occurs');
  A.eq(r.attempts.length, 2, 'both attempts are auditable');

  calls = 0;
  r = await managed.run({
    fromAgent, toAgent, contract, maxRevisions: 1,
    dispatch: async () => { calls++; return env(false); }
  });
  A.ok(r.ok && !r.accepted, 'still-bad second result returns unaccepted');
  A.eq(calls, 2, 'revision cap prevents an infinite loop');

  r = await managed.run({
    fromAgent: { id: 'low', orgRole: 'worker', role: 'specialist' },
    toAgent: { id: 'high', orgRole: 'manager', role: 'specialist' },
    contract,
    dispatch: async () => { throw new Error('must not run'); }
  });
  A.ok(!r.ok && r.stage === 'prepare', 'invalid hierarchy is rejected before dispatch');

  r = await managed.run({ fromAgent, toAgent, contract });
  A.ok(!r.ok && /dispatch/.test(r.error), 'missing dispatch fails closed');

  const parsed = managed.parseEnvelope('not json', { taskId: 'x', agentId: 'y' });
  A.eq(parsed.status, 'failed', 'invalid text becomes explicit failed envelope');
  A.ok(parsed.blockers.length === 1, 'invalid text records a blocker');

  A.report('managed-delegation.test');
})().catch(e => { console.error(e); process.exit(1); });
