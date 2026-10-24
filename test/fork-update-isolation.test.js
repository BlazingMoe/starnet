'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const endpoints = (((conf || {}).plugins || {}).updater || {}).endpoints || [];
const updatesSrc = fs.readFileSync(path.join(root, 'frontend', 'app', 'updates.js'), 'utf8');
const releasesMatch = updatesSrc.match(/RELEASES_PAGE = '([^']+)'/);

assert.equal(conf.bundle && conf.bundle.createUpdaterArtifacts, false,
  'derivative must not generate updater artifacts before its own signed release pipeline exists');
assert.ok(Array.isArray(endpoints) && endpoints.length === 1,
  'derivative keeps exactly one reserved update endpoint so inherited update state machinery remains testable');
assert.ok(endpoints.every(u => !/androoAGI\/starnet-releases|starnetos\.com/i.test(String(u))),
  'derivative must never point at StarNet upstream release/update infrastructure');
assert.match(String(endpoints[0]), /^https:\/\/github\.com\/BlazingMoe\/starnet\/releases\/latest\/download\/latest\.json$/i,
  'reserved updater endpoint belongs only to the derivative repository');
assert.ok(releasesMatch, 'frontend declares a manual releases fallback');
assert.match(releasesMatch[1], /^https:\/\/github\.com\/BlazingMoe\/starnet\/releases\/latest$/i,
  'manual releases fallback belongs only to the derivative repository');
assert.ok(!/androoAGI\/starnet-releases|starnetos\.com/i.test(updatesSrc),
  'frontend update center contains no upstream StarNet release URL');

console.log('fork-update-isolation.test: OK');
