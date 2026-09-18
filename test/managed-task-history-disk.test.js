/* node test/managed-task-history-disk.test.js */
'use strict';
const A = require('./_assert.js');
const path = require('path');
const { makeTaskHistoryDiskIo } = require('../sidecar/orchestration/task-history-disk.js');

const calls = [];
const fsFake = { tag: 'fs' };
const built = makeTaskHistoryDiskIo({
  path,
  fs: fsFake,
  workspaces: '/ws',
  readBoundedJsonl(file) { calls.push(['read', file]); return [{ taskId: 't1' }]; },
  appendJsonlDurable(ctx, file, entry) { calls.push(['append', ctx.fs, file, entry]); },
  failNote(tag, e) { calls.push(['note', tag, String(e && e.message || e)]); }
});
A.eq(built.file, path.join('/ws', 'managed-tasks.jsonl'), 'history file is a sibling under the workspace root');
A.eq(built.io.readAll(), [{ taskId: 't1' }], 'bounded reader result is returned unchanged');
built.io.append({ taskId: 't2' });
A.eq(calls[1][0], 'append', 'append delegates to durable JSONL writer');
A.eq(calls[1][1], fsFake, 'host fs capability is injected into durable writer');
A.eq(calls[1][2], built.file, 'append targets the managed task history file');

const failingRead = makeTaskHistoryDiskIo({
  path, fs: fsFake, workspaces: '/ws',
  readBoundedJsonl() { throw new Error('corrupt'); },
  appendJsonlDurable() {},
  failNote(tag) { calls.push(['read-note', tag]); }
});
A.eq(failingRead.io.readAll(), [], 'read corruption fails open to empty boot history');
A.eq(calls.some(x => x[0] === 'read-note' && x[1] === 'managed-task-history.read'), true, 'read failure remains diagnostically visible');

const failingWrite = makeTaskHistoryDiskIo({
  path, fs: fsFake, workspaces: '/ws', readBoundedJsonl() { return []; },
  appendJsonlDurable() { throw new Error('disk full'); }
});
A.throws(() => failingWrite.io.append({ taskId: 'x' }), 'durable append failure propagates instead of pretending persistence succeeded');
A.throws(() => makeTaskHistoryDiskIo({}), 'missing composition dependencies fail closed');
A.report('managed-task-history-disk.test');
