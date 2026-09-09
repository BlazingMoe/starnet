'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchSource } = require('../scripts/apply-action-control-host.js');

const indexPath = path.join(__dirname, '..', 'sidecar', 'index.js');

function currentSource() {
  return fs.readFileSync(indexPath, 'utf8');
}

test('action host patch wires only the durable run journal source', () => {
  const before = currentSource();
  const after = patchSource(before);

  assert.match(after, /makeActionControlHttp/);
  assert.match(after, /recoverPage: \(options\) => runJournal\.recoverPage\(options\)/);
  assert.match(after, /exact: '\/api\/control\/actions', h: actionControlHttp\.serve/);

  assert.doesNotMatch(after, /actionTrace\s*=\s*new (?:Map|Set)/);
  assert.doesNotMatch(after, /actionHistory\s*=\s*new (?:Map|Set)/);
  assert.doesNotMatch(after, /controlActions\s*=\s*new (?:Map|Set)/);
  assert.doesNotMatch(after, /runStore\.all\(\).*action/i);
  assert.throws(() => patchSource(after), /wiring already present/);
});

test('action host patch fails closed when expected host anchors drift', () => {
  const before = currentSource();
  const drifted = before.replace(
    "const { makeApprovalControlHttp } = require('./control/approval-http.js');   // Moe AI Station: read-only permission/approval overview",
    "const { makeApprovalControlHttp } = require('./control/approval-http.js');"
  );
  assert.throws(() => patchSource(drifted), /missing control import anchor/);
});

test('action host patch refuses a host without the authoritative run journal', () => {
  const before = currentSource();
  const withoutJournal = before.replace(/runJournal\./g, 'legacyJournal.');
  assert.throws(() => patchSource(withoutJournal), /authoritative runJournal source not found/);
});
