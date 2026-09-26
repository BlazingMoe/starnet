'use strict';
const A = require('./_assert.js');
const R = require('../sidecar/orchestration/result-envelope.js');

const good = R.validate({
  taskId: 't1', agentId: 'researcher-1', status: 'completed', summary: 'Research complete', output: 'Findings',
  sources: ['https://example.test/source'], artifacts: ['report.md'], blockers: [],
  acceptance: [{ criterion: 'Use primary sources', passed: true, evidence: 'Official source cited' }],
  provenance: { runId: 'r1' }
});
A.ok(good.ok, 'valid envelope accepted');
A.eq(good.value.schemaVersion, 1, 'schema version fixed');
A.eq(good.value.provenance.runId, 'r1', 'provenance retained');
const sum = R.acceptanceSummary(good.value);
A.ok(sum.ok && sum.complete, 'completed result with passing criteria is complete');
A.eq(sum.passed, 1, 'passing criterion counted');

const partial = R.acceptanceSummary({
  taskId: 't2', agentId: 'worker', status: 'partial', summary: 'Some work',
  acceptance: [{ criterion: 'Finish all rows', passed: false, evidence: '10 rows remain' }]
});
A.ok(partial.ok && !partial.complete, 'partial work cannot be complete');
A.eq(partial.failed, 1, 'failed criterion counted');
A.ok(!R.validate({ taskId: 'x', agentId: 'a', status: 'invented', summary: 'x' }).ok, 'unknown status rejected');
A.ok(!R.validate({ taskId: 'x', agentId: 'a', status: 'completed', summary: '' }).ok, 'empty summary rejected');
A.report('result-envelope.test');
