/* node test/moe-feature-evidence.test.js — derivative feature claims must be evidence-backed. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../qa/moe-feature-evidence.json');
const ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
A.eq(ledger.schemaVersion, 'moe.feature-evidence.v1', 'known evidence ledger schema');
A.ok(Array.isArray(ledger.features) && ledger.features.length > 0, 'feature evidence ledger is non-empty');

const validStatus = new Set([
  'planned',
  'partial',
  'implemented',
  'verified',
  'blocked',
  'design-boundary',
  'out-of-scope-private-use'
]);
const seen = new Set();
for (const f of ledger.features) {
  A.ok(f && typeof f === 'object', 'feature row is an object');
  A.ok(typeof f.id === 'string' && f.id.trim(), 'feature has id');
  A.ok(!seen.has(f.id), 'feature ids are unique: ' + f.id);
  seen.add(f.id);
  A.ok(validStatus.has(f.status), 'feature status is known: ' + f.id);
  A.ok(Array.isArray(f.code) && Array.isArray(f.tests) && Array.isArray(f.integrationEvidence), 'evidence arrays exist: ' + f.id);

  for (const p of f.code.concat(f.tests)) {
    A.ok(typeof p === 'string' && p.trim(), 'evidence path is non-empty: ' + f.id);
    A.ok(fs.existsSync(path.join(__dirname, '..', p)), 'evidence path exists: ' + f.id + ' -> ' + p);
  }

  if (f.status === 'implemented' || f.status === 'verified') {
    A.ok(f.code.length > 0, f.status + ' feature has production code: ' + f.id);
    A.ok(f.tests.length > 0, f.status + ' feature has focused tests: ' + f.id);
  }
  if (f.status === 'verified') {
    A.ok(f.integrationEvidence.length > 0, 'verified feature has integration evidence: ' + f.id);
  }

  if (f.status === 'design-boundary') {
    A.ok(f.integrationEvidence.length > 0, 'design boundary records the architectural evidence it preserves: ' + f.id);
  }

  if (f.status === 'out-of-scope-private-use') {
    A.ok(ledger.usageTarget === 'private-starnet-fork', 'private-use exclusions are only valid for the private fork target: ' + f.id);
  }
}

A.report('moe-feature-evidence.test');
