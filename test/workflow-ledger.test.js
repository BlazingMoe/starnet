'use strict';
// Exercise production cron.result -> autonomy ledger projection, bounded storage, and cold reload.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const A = require('./_assert.js');
const { makeAutonomyLedger, projectWorkflowTrace } = require('../sidecar/autonomy-ledger.js');
const { redact } = require('../sidecar/context.js');

const index = fs.readFileSync(path.join(__dirname, '../sidecar/index.js'), 'utf8');
const start = index.indexOf('function ledgerFromCron(name, payload) {');
const end = index.indexOf('\nconst cronEmitNotify', start);
const source = index.slice(start, end);
A.ok(start >= 0 && end > start, 'the production cron ledger adapter was found');

function harness() {
  const io = { rows: [], readAll() { return this.rows.slice(); }, append(row) { this.rows.push(row); } };
  const ledger = makeAutonomyLedger({ io, clock: { now: () => 42 } });
  const ctx = {
    cronJobs: [{ id: 'job-a', agentId: 'agent-a' }],
    recordAutonomy: entry => ledger.record(entry),
    projectWorkflowTrace,
    // The production adapter must project from already-redacted payload data.
    redact,
  };
  vm.runInNewContext(source, ctx);
  return { io, ledger, record: payload => vm.runInNewContext('ledgerFromCron("cron.result", payload)', Object.assign(ctx, { payload })) };
}

{
  const h = harness();
  h.record({ jobId: 'job-a', runId: 'run-1', workflowDecisions: [
    { kind: 'route', outcome: 'route', junction: '2,3', lane: 'N', agent: 'writer sk-or-v1-0123456789abcdef', agents: ['writer', 'reviewer'] },
    { kind: 'filter', outcome: 'selected' },
  ], workflowDecisionsTruncated: false });
  const rows = h.ledger.list({ source: 'cron', limit: 50 });
  A.eq(rows.length, 3, 'two decision rows and one summary are persisted');
  A.eq(rows[0].binding, 'workflow-trace', 'the summary is appended last for visible window completeness');
  A.eq(rows[0].runId, 'run-1', 'the summary is tied to the run identity');
  A.eq(rows[0].detail.observedDecisionCount, 2, 'observed decision count is recorded');
  A.eq(rows[0].detail.retainedDecisionCount, 2, 'retained decision count is recorded');
  A.eq(rows[0].detail.traceTruncated, false, 'complete small trace is not marked truncated');
  const first = rows.find(row => row.binding === 'workflow-decision' && row.detail.index === 0);
  A.eq(first.detail.fanoutCount, 2, 'fan-out targets are reduced to a count');
  A.ok(!('agents' in first.detail), 'individual fan-out identities are not persisted');
  const cold = makeAutonomyLedger({ io: { readAll: () => h.io.rows.slice(), append() {} }, clock: { now: () => 99 } });
  A.eq(cold.list({ source: 'cron', limit: 50 }).length, 3, 'workflow rows survive a cold ledger reload');
}

{
  const h = harness();
  h.record({ jobId: 'job-a', runId: 'run-secret', workflowDecisions: [
    { kind: 'route', outcome: 'route', agent: 'writer private-token-123' },
    ...Array.from({ length: 8 }, (_, i) => ({ kind: 'filter', outcome: 'selected', junction: '1,' + i }))
  ], workflowDecisionsTruncated: false });
  const rows = h.ledger.all();
  const decisions = rows.filter(row => row.binding === 'workflow-decision');
  const summary = rows.find(row => row.binding === 'workflow-trace');
  A.eq(decisions.length, 8, 'at most eight detailed choices are persisted');
  A.eq(summary.detail.observedDecisionCount, 9, 'summary preserves the larger observed count');
  A.eq(summary.detail.retainedDecisionCount, 8, 'summary states the retained detail count');
  A.eq(summary.detail.traceTruncated, true, 'omitted choices are marked truncated');
  A.ok(!JSON.stringify(rows).includes('sk-or-v1-0123456789abcdef'), 'real context redactor scrubs the credential before persistence');
  h.record({ jobId: 'job-a', runId: 'run-2', workflowDecisions: [{ kind: 'route', outcome: 'fallback' }] });
  A.eq(h.ledger.all().filter(row => row.runId === 'run-2').length, 2, 'separate fires retain separate run identities');
  h.record({ jobId: 'job-a', runId: 'invalid-enum', workflowDecisions: [{ kind: 'custom', outcome: 'route' }] });
  const invalid = h.ledger.list({ limit: 1 })[0];
  A.eq(invalid.detail.retainedDecisionCount, 0, 'invalid event enum rows are not persisted as workflow detail');
  A.eq(invalid.detail.traceTruncated, true, 'invalid enum omission is disclosed');
}

{
  const h = harness();
  h.record({ jobId: 'job-a', runId: 'absent' });
  A.eq(h.ledger.count(), 0, 'a result with no workflow trace does not invent an empty trace');
  h.record({ jobId: 'job-a', runId: 'run-flagged', workflowDecisions: [{ kind: 'route', outcome: 'route' }], workflowDecisionsTruncated: true });
  A.eq(h.ledger.list({ limit: 1 })[0].detail.traceTruncated, true, 'upstream truncation is preserved');
  h.record({ jobId: 'job-a', workflowDecisions: [{ kind: 'route', outcome: 'route' }] });
  h.record({ runId: 'run-no-job', workflowDecisions: [{ kind: 'route', outcome: 'route' }] });
  A.eq(h.ledger.count(), 2, 'missing job or run identity prevents ambiguous trace grouping');
}

A.report('workflow-ledger.test');
