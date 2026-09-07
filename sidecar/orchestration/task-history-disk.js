/* sidecar/orchestration/task-history-disk.js — composition helper for durable managed-task history.
   No ambient IO: the sidecar host injects path/fs/readBoundedJsonl/appendJsonlDurable/failNote. */
'use strict';

function makeTaskHistoryDiskIo(opts) {
  opts = opts || {};
  const path = opts.path;
  const fs = opts.fs;
  const workspaces = String(opts.workspaces || '');
  const readBoundedJsonl = opts.readBoundedJsonl;
  const appendJsonlDurable = opts.appendJsonlDurable;
  const failNote = typeof opts.failNote === 'function' ? opts.failNote : function () {};
  if (!path || typeof path.join !== 'function') throw new Error('task history disk adapter requires path');
  if (!fs) throw new Error('task history disk adapter requires fs');
  if (!workspaces) throw new Error('task history disk adapter requires workspaces root');
  if (typeof readBoundedJsonl !== 'function') throw new Error('task history disk adapter requires readBoundedJsonl');
  if (typeof appendJsonlDurable !== 'function') throw new Error('task history disk adapter requires appendJsonlDurable');

  const file = path.join(workspaces, 'managed-tasks.jsonl');
  return {
    file,
    io: {
      readAll() {
        try { return readBoundedJsonl(file); }
        catch (e) { failNote('managed-task-history.read', e); return []; }
      },
      append(entry) {
        // Persistence is authoritative. Unlike a diagnostic read, a failed append must surface so
        // the host never tells Control Mode that an audit/task was durably recorded when it was not.
        appendJsonlDurable({ fs, note: failNote }, file, entry);
      }
    }
  };
}

module.exports = { makeTaskHistoryDiskIo };
