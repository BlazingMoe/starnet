'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const endpoints = (((conf || {}).plugins || {}).updater || {}).endpoints || [];

assert.equal(conf.bundle && conf.bundle.createUpdaterArtifacts, false,
  'derivative must not generate updater artifacts before its own signed release pipeline exists');
assert.ok(Array.isArray(endpoints), 'updater endpoints must be an array when configured');
assert.ok(endpoints.every(u => !/androoAGI\/starnet-releases|starnetos\.com/i.test(String(u))),
  'derivative must never point at StarNet upstream release/update infrastructure');
assert.ok(endpoints.every(u => /^https:\/\/example\.invalid\//i.test(String(u))),
  'temporary updater endpoint must stay inert until derivative release infrastructure is configured');

console.log('fork-update-isolation.test: OK');
