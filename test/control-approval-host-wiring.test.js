'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchSource } = require('../scripts/apply-approval-control-host.js');

const indexPath = path.join(__dirname, '..', 'sidecar', 'index.js');

function currentSource() {
  return fs.readFileSync(indexPath, 'utf8');
}

test('approval host patch wires only existing authoritative approval sources', () => {
  const before = currentSource();
  const after = patchSource(before);

  assert.match(after, /makeApprovalControlHttp/);
  assert.match(after, /grantSnapshot: \(\) => grantManager\.snapshot\(\)/);
  assert.match(after, /consentSnapshot: \(\) => approvalConsentSnapshot\.snapshot\(\)/);
  assert.match(after, /pending: \(\) => pendingByRun/);
  assert.match(after, /makeConsentBroker\(\{ grantsSession, grantsPermanent \}\)/);
  assert.match(after, /exact: '\/api\/control\/approvals', h: approvalControlHttp\.serve/);

  assert.doesNotMatch(after, /approvalPending\s*=\s*new Map/);
  assert.doesNotMatch(after, /approvalGrants\s*=\s*new (?:Map|Set)/);
  assert.throws(() => patchSource(after), /wiring already present/);
});

test('approval host patch fails closed when an expected host anchor drifts', () => {
  const before = currentSource();
  const drifted = before.replace(
    "const { makeCostControlHttp } = require('./control/cost-http.js');   // Moe AI Station: read-only ledger + budget governor overview",
    "const { makeCostControlHttp } = require('./control/cost-http.js');"
  );
  assert.throws(() => patchSource(drifted), /missing control import anchor/);
});
