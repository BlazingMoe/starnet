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

function unwiredSource() {
  let source = currentSource();
  const actionImport = "\nconst { makeActionControlHttp } = require('./control/action-http.js');   // Moe AI Station: read-only durable action trace";
  const actionBlock = [
    '// Durable run-journal remains the only action-history source; this adapter only pages and projects it.',
    'const actionControlHttp = makeActionControlHttp({',
    '  recoverPage: (options) => runJournal.recoverPage(options),',
    '  respondJson',
    '});',
    ''
  ].join('\n');
  const actionRoute = "\n  { m: 'GET', exact: '/api/control/actions', h: actionControlHttp.serve },   // Control Mode: read-only durable run-journal action trace";
  assert.equal(source.includes(actionImport), true, 'current host contains action import');
  assert.equal(source.includes(actionBlock), true, 'current host contains action handler');
  assert.equal(source.includes(actionRoute), true, 'current host contains action route');
  source = source.replace(actionImport, '').replace(actionBlock, '').replace(actionRoute, '');
  return source;
}

test('current host is wired only to the durable run journal source', () => {
  const source = currentSource();
  assert.match(source, /makeActionControlHttp/);
  assert.match(source, /recoverPage: \(options\) => runJournal\.recoverPage\(options\)/);
  assert.match(source, /exact: '\/api\/control\/actions', h: actionControlHttp\.serve/);
  assert.doesNotMatch(source, /actionTrace\s*=\s*new (?:Map|Set)/);
  assert.doesNotMatch(source, /actionHistory\s*=\s*new (?:Map|Set)/);
  assert.doesNotMatch(source, /controlActions\s*=\s*new (?:Map|Set)/);
  assert.doesNotMatch(source, /runStore\.all\(\).*action/i);
  assert.throws(() => patchSource(source), /wiring already present/);
});

test('action host patch reproduces the committed wiring from an unwired host', () => {
  const before = unwiredSource();
  const after = patchSource(before);
  assert.equal(after, currentSource());
});

test('action host patch fails closed when expected host anchors drift', () => {
  const before = unwiredSource();
  const drifted = before.replace(
    "const { makeApprovalControlHttp } = require('./control/approval-http.js');   // Moe AI Station: read-only permission/approval overview",
    "const { makeApprovalControlHttp } = require('./control/approval-http.js');"
  );
  assert.throws(() => patchSource(drifted), /missing control import anchor/);
});

test('action host patch refuses a host without the authoritative run journal', () => {
  const before = unwiredSource();
  const withoutJournal = before.replace(/runJournal\./g, 'legacyJournal.');
  assert.throws(() => patchSource(withoutJournal), /authoritative runJournal source not found/);
});
