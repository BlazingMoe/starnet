/* sidecar/orchestration/task-history-host.js — one composition seam for the sidecar host.
   Builds durable store + read-only HTTP handler from injected host primitives. */
'use strict';

const { makeTaskHistoryStore } = require('./task-history.js');
const { makeTaskHistoryDiskIo } = require('./task-history-disk.js');
const { makeTaskHistoryHttp } = require('./task-history-http.js');

function makeTaskHistoryHost(opts) {
  opts = opts || {};
  const disk = makeTaskHistoryDiskIo({
    path: opts.path,
    fs: opts.fs,
    workspaces: opts.workspaces,
    readBoundedJsonl: opts.readBoundedJsonl,
    appendJsonlDurable: opts.appendJsonlDurable,
    failNote: opts.failNote
  });
  const store = makeTaskHistoryStore({
    io: disk.io,
    clock: opts.clock || { now: () => Date.now() },
    ramMax: opts.ramMax,
    limit: opts.limit
  });
  const http = makeTaskHistoryHttp({ store, respondJson: opts.respondJson });
  return Object.freeze({ file: disk.file, store, serve: http.serve });
}

module.exports = { makeTaskHistoryHost };
