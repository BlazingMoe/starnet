'use strict';
const A = require('./_assert.js');
const D = require('../sidecar/orchestration/delegation-adapter.js');

const commander = { id: 'cmd', role: 'orchestrator' };
const manager = { id: 'mgr', role: 'specialist', orgRole: 'manager' };
const worker = { id: 'wrk', role: 'specialist', orgRole: 'worker' };

const good = D.prepareWorker({
  fromAgent: commander,
  toAgent: manager,
  contract: {
    id: 't1', objective: 'Plan the research work', acceptanceCriteria: ['Return a ranked plan'], budgetUsd: 2, deadlineAt: 2000000000000
  }
});
A.ok(good.ok, 'commander may delegate to manager');
A.eq(good.value.agentId, 'mgr', 'dispatch worker targets assigned agent');
A.eq(good.value.prompt, 'Plan the research work', 'objective becomes inherited dispatcher prompt');
A.ok(/TASK CONTRACT v1/.test(good.value.context), 'contract metadata rides as handoff context');
A.ok(/Return a ranked plan/.test(good.value.context), 'acceptance criteria ride as handoff context');

const down = D.prepareWorker({
  fromAgent: manager,
  toAgent: worker,
  contract: { id: 't2', objective: 'Collect primary sources' }
});
A.ok(down.ok, 'manager may delegate to worker');

const up = D.prepareWorker({
  fromAgent: worker,
  toAgent: manager,
  contract: { id: 't3', objective: 'Take over this task' }
});
A.ok(!up.ok, 'worker may not delegate upward');
A.ok(up.errors.indexOf('delegation') >= 0, 'upward refusal is classified as delegation');

const missing = D.prepareWorker({ fromAgent: commander, toAgent: worker, contract: { id: 't4' } });
A.ok(!missing.ok && missing.errors.indexOf('objective') >= 0, 'missing objective rejected before dispatch');
A.report('delegation-adapter.test');
