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
responses.length = 0;
host.serve({ url: '/api/managed-tasks/t1' }, {});
A.eq(responses[0].code, 200, 'same composed store is visible through HTTP drilldown');
A.eq(responses[0].body.history[0].taskId, 't1', 'HTTP handler reads the just-recorded durable task');
responses.length = 0;
host.serve({ url: '/api/managed-tasks/summary' }, {});
A.eq(responses[0].body.summary.total, 1, 'HTTP summary uses same authoritative store');
A.eq(Object.isFrozen(host), true, 'host service bundle is immutable');
A.report('managed-task-history-host.test');
