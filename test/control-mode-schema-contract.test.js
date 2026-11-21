/* node test/control-mode-schema-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const root = path.join(__dirname, '..');
const surfaces = [
  ['agents', 'agent-view.js', 'controlagents.js'],
  ['memory', 'memory-view.js', 'controlmemory.js'],
  ['approvals', 'approval-view.js', 'controlapprovals.js'],
  ['actions', 'action-view.js', 'controlactions.js'],
  ['costs', 'cost-view.js', 'controlcosts.js'],
  ['providers', 'provider-view.js', 'controlproviders.js']
];

function backendSchema(src, name) {
  const matches = [...src.matchAll(/schemaVersion\s*:\s*['\"]([^'\"]+)['\"]/g)].map(m => m[1]);
  A.eq(matches.length, 1, `${name} backend exposes exactly one schemaVersion literal`);
  return matches[0];
}
function uiSchema(src, name) {
  const matches = [...src.matchAll(/schemaVersion\s*===\s*['\"]([^'\"]+)['\"]/g)].map(m => m[1]);
  A.eq(matches.length, 1, `${name} UI accepts exactly one schemaVersion literal`);
  return matches[0];
}

for (const [name, viewFile, uiFile] of surfaces) {
  const backend = fs.readFileSync(path.join(root, 'sidecar', 'control', viewFile), 'utf8');
  const desktop = fs.readFileSync(path.join(root, 'frontend', 'app', uiFile), 'utf8');
  const website = fs.readFileSync(path.join(root, 'website', 'app', 'app', uiFile), 'utf8');
  const emitted = backendSchema(backend, name);
  const accepted = uiSchema(desktop, name);
  A.eq(accepted, emitted, `${name} UI schema matches the authoritative backend projection`);
  A.eq(website, desktop, `${name} website mirror keeps the same schema contract`);
}

A.report('control-mode-schema-contract.test');
