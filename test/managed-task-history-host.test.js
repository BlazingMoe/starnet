/* node test/managed-task-history-host.test.js */
'use strict';
const A = require('./_assert.js');
const path = require('path');
const { makeTaskHistoryHost } = require('../sidecar/orchestration/task-history-host.js');

const diskRows = [];
const responses = [];
const host = makeTaskHistoryHost({
  path,
  fs: {},
  workspaces: '/ws',
  clock: { now: () => 1234 },
  readBoundedJsonl() { return diskRows.slice(); },
  appendJsonlDurable(ctx, file, row) { diskRows.push(row); },
  failNote() {},
  respondJson(res, code, body) { responses.push({ code, body }); return body; }
});
A.eq(host.file, path.join('/ws', 'managed-tasks.jsonl'), 'host composes canonical managed history path');
const row = host.store.record({ taskId: 't1', leadAgentId: 'lead', workerAgentId: 'worker', status: 'accepted', stage: 'accepted', accepted: true, objective: 'x' });
A.eq(row.ts, 1234, 'host injects its clock into store');
A.eq(diskRows.length, 1, 'record reaches durable adapter');
const liveToken = host.store.activeBegin({ taskId: 'live1', leadAgentId: 'lead', workerAgentId: 'worker', objective: 'y', startedAt: 1200 });
A.eq(host.live.count(), 1, 'same host composes bounded live tracker');
responses.length = 0;
host.serve({ url: '/api/managed-tasks/active' }, {});
A.eq(responses[0].code, 200, 'live tracker is visible through read-only HTTP');
A.eq(responses[0].body.tasks[0].taskId, 'live1', 'HTTP active view reads the composed live tracker');
A.eq(host.store.activeEnd(liveToken), true, 'runtime store seam can close live task');
responses.length = 0;
host.serve({ url: '/api/managed-tasks/t1' }, {});
A.eq(responses[0].code, 200, 'same composed store is visible through HTTP drilldown');
A.eq(responses[0].body.history[0].taskId, 't1', 'HTTP handler reads the just-recorded durable task');
responses.length = 0;
host.serve({ url: '/api/managed-tasks/summary' }, {});
A.eq(responses[0].body.summary.total, 1, 'HTTP summary uses same authoritative store');
A.eq(responses[0].body.live.active, 0, 'summary reports current in-flight count independently from history');
A.eq(Object.isFrozen(host), true, 'host service bundle is immutable');
A.report('managed-task-history-host.test');
