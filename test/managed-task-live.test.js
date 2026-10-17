'use strict';
const A = require('./_assert.js');
const { makeTaskLiveTracker } = require('../sidecar/orchestration/task-live.js');

let now = 1000;
const tracker = makeTaskLiveTracker({ clock: { now: () => now }, maxActive: 2 });
const t1 = tracker.begin({ taskId: 't1', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'research', stage: 'dispatch' });
now = 1500;
const t2 = tracker.begin({ taskId: 't2', leadAgentId: 'lead', workerAgentId: 'worker2', objective: 'code', stage: 'dispatch' });
A.eq(tracker.count(), 2, 'tracker counts in-flight tasks');
A.eq(tracker.list({})[0].elapsedMs, 500, 'elapsed time is derived from injected clock');
A.eq(tracker.list({ agentId: 'worker2' }).map(x => x.taskId), ['t2'], 'agent filter includes worker identity');
A.eq(tracker.update(t2, { stage: 'audit', auditorAgentId: 'auditor' }), true, 'live stage can advance');
A.eq(tracker.list({ taskId: 't2' })[0].stage, 'audit', 'updated stage is visible');
A.eq(tracker.summary().byStage.audit, 1, 'summary reports live stage distribution');
A.eq(tracker.summary().byWorker.worker, 1, 'summary reports live worker distribution');
let overflow = false;
try { tracker.begin({ taskId: 't3', leadAgentId: 'lead', workerAgentId: 'worker3' }); } catch (_) { overflow = true; }
A.eq(overflow, true, 'capacity overflow fails closed instead of evicting active work');
A.eq(tracker.end(t1), true, 'active task can be ended by opaque token');
A.eq(tracker.count(), 1, 'ending task removes it from live state');
A.eq(tracker.end('missing'), false, 'unknown token does not mutate live state');

A.report('managed-task-live.test');
