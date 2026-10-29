/* sidecar/orchestration/task-history-host.js — one composition seam for the sidecar host.
   Builds durable history + bounded in-flight telemetry + read-only HTTP handler from injected host primitives. */
'use strict';

const { makeTaskHistoryStore } = require('./task-history.js');
const { makeTaskHistoryDiskIo } = require('./task-history-disk.js');
const { makeTaskHistoryHttp } = require('./task-history-http.js');
const { makeTaskLiveTracker } = require('./task-live.js');

function makeTaskHistoryHost(opts) {
  opts = opts || {};
  const clock = opts.clock;
  if (!clock || typeof clock.now !== 'function') throw new Error('task history host requires injected clock');
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
    clock,
    ramMax: opts.ramMax,
    limit: opts.limit
  });
  const live = makeTaskLiveTracker({ clock, maxActive: opts.maxActive });

  // One injected runtime seam: managed delegation receives this same store. Durable completion
  // history and transient in-flight state remain separate internally, but callers cannot drift
  // into two unrelated telemetry registries.
  store.activeBegin = live.begin;
  store.activeEnd = live.end;
  store.activeUpdate = live.update;
  store.activeList = live.list;
  store.activeSummary = live.summary;

  const http = makeTaskHistoryHttp({ store, respondJson: opts.respondJson });
  return Object.freeze({ file: disk.file, store, live, serve: http.serve });
}

module.exports = { makeTaskHistoryHost };
