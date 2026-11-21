'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeRunJournal, DISPATCH_BOUNDARY_MODEL, _internals } = require('../sidecar/run-journal.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-journal-boundary-'));
try {
  let tick = 0;
  const first = makeRunJournal({ dir: root, clock: { now: () => ++tick } });
  first.begin({ runId: 'settled', agentId: 'agent' });
  first.checkpoint('settled', { phase: 'assistant', messages: [{ role: 'assistant', tool_calls: [{ id: 'write-1' }] }] });
  first.toolIntent('settled', { callId: 'write-1', name: 'fs.write', mutating: true, boundaryModel: DISPATCH_BOUNDARY_MODEL });
  first.toolDispatch('settled', { callId: 'write-1', name: 'fs.write', mutating: true });
  first.toolResult('settled', { callId: 'write-1', ok: true, content: 'saved' });
  first.checkpoint('settled', { phase: 'tool_results', messages: [{ role: 'tool', tool_call_id: 'write-1', content: 'saved' }] });

  // A fresh journal instance is a process-restart boundary: no in-memory sequence/map state survives.
  const restarted = makeRunJournal({ dir: root, clock: { now: () => ++tick } });
  const settled = restarted.recoverAll().find(row => row.runId === 'settled');
  A.eq(settled.status, 'resumable', 'settled mutation resumes after a real disk/restart round-trip');
  A.eq(settled.uncertain, [], 'durable result prevents false mutation uncertainty');
  A.eq(settled.completed[0].dispatch.callId, 'write-1', 'restart retains the exact dispatch boundary');
  A.eq(settled.checkpoint.phase, 'tool_results', 'restart resumes after the paired tool-result checkpoint');

  const prepared = makeRunJournal({ dir: root, clock: { now: () => ++tick } });
  prepared.begin({ runId: 'prepared', agentId: 'agent' });
  prepared.toolIntent('prepared', { callId: 'write-2', name: 'fs.write', mutating: true, boundaryModel: DISPATCH_BOUNDARY_MODEL });
  const preparedRestart = makeRunJournal({ dir: root, clock: { now: () => ++tick } }).recoverAll().find(row => row.runId === 'prepared');
  A.eq(preparedRestart.status, 'resumable', 'prepared-only mutation is retryable after restart');
  A.eq(preparedRestart.replayablePrepared.map(x => x.callId), ['write-2'], 'prepared retry identity survives fsync/read-back');

  const dispatched = makeRunJournal({ dir: root, clock: { now: () => ++tick } });
  dispatched.begin({ runId: 'dispatched', agentId: 'agent' });
  dispatched.toolIntent('dispatched', { callId: 'write-3', name: 'fs.write', mutating: true, boundaryModel: DISPATCH_BOUNDARY_MODEL });
  dispatched.toolDispatch('dispatched', { callId: 'write-3', name: 'fs.write', mutating: true });
  const dispatchedRestart = makeRunJournal({ dir: root, clock: { now: () => ++tick } }).recoverAll().find(row => row.runId === 'dispatched');
  A.eq(dispatchedRestart.status, 'needs_review', 'dispatched mutation without result fails closed after restart');
  A.eq(dispatchedRestart.uncertain.map(x => x.callId), ['write-3'], 'review names only the may-have-happened mutation');
  // Cold append must work even when no inspect/recoverAll has primed the new instance.
  const journalPath = id => path.join(root, _internals.runFileName(id));
  for (const trailingNewline of [true, false]) {
    const id = trailingNewline ? 'cold' : 'cold-no-newline';
    const writer = makeRunJournal({ dir: root });
    writer.begin({ runId: id, agentId: 'agent' });
    writer.toolIntent(id, { callId: 'effect', name: 'fs.write', mutating: true });
    const file = journalPath(id);
    if (!trailingNewline) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').trimEnd());
    const before = fs.readFileSync(file, 'utf8');
    const cold = makeRunJournal({ dir: root });
    cold.toolResult(id, { callId: 'effect', ok: true, content: 'saved' });
    const after = fs.readFileSync(file, 'utf8');
    const parsed = _internals.parseRecords(after);
    A.ok(after.startsWith(before), 'cold append preserves all existing durable bytes');
    A.ok(!parsed.corrupt, 'cold append retains the validated hash chain with or without a final newline');
    A.eq(parsed.records.map(r => r.seq), [1, 2, 3], 'cold append continues sequence instead of restarting it');
    A.eq(cold.inspect(id).uncertain, [], 'durable result pairs with the pre-restart intent');
  }

  for (const suffix of ['{"v":', '\n{"v":1}\n']) {
    const id = suffix.includes('\n') ? 'invalid-record' : 'torn-tail';
    const writer = makeRunJournal({ dir: root });
    writer.begin({ runId: id });
    const file = journalPath(id);
    fs.appendFileSync(file, suffix);
    const before = fs.readFileSync(file, 'utf8');
    const cold = makeRunJournal({ dir: root });
    A.throws(() => cold.checkpoint(id, { messages: [] }), 'cold writer refuses damaged history');
    A.eq(fs.readFileSync(file, 'utf8'), before, 'rejected adoption neither repairs nor appends to forensic bytes');
  }

  const wrong = makeRunJournal({ dir: root });
  wrong.begin({ runId: 'source-id' });
  fs.copyFileSync(journalPath('source-id'), journalPath('wrong-id'));
  const beforeWrong = fs.readFileSync(journalPath('wrong-id'), 'utf8');
  A.throws(() => makeRunJournal({ dir: root }).checkpoint('wrong-id', {}), 'a valid chain under the wrong run identity is refused');
  A.eq(fs.readFileSync(journalPath('wrong-id'), 'utf8'), beforeWrong, 'identity rejection preserves the original file');

  let writes = 0;
  const unreadable = makeRunJournal({ io: {
    read() { throw Object.assign(new Error('access denied'), { code: 'EACCES' }); },
    append() { writes++; }
  } });
  A.throws(() => unreadable.checkpoint('denied', {}), 'a read failure cannot be mistaken for an absent journal');
  A.eq(writes, 0, 'failed adoption does not write');

  const inspectedId = 'inspected-no-newline';
  makeRunJournal({ dir: root }).begin({ runId: inspectedId });
  fs.writeFileSync(journalPath(inspectedId), fs.readFileSync(journalPath(inspectedId), 'utf8').trimEnd());
  const inspected = makeRunJournal({ dir: root });
  inspected.recoverAll();
  inspected.checkpoint(inspectedId, { messages: [] });
  A.ok(!inspected.inspect(inspectedId).corrupt, 'recovery scan does not bypass newline-safe adoption');
  A.eq(inspected.inspect(inspectedId).records, 2, 'post-scan append preserves both records');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

A.report('run-journal-disk-boundary.test');
