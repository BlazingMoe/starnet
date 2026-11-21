/* node test/control-mode-lifecycle-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const root = path.join(__dirname, '..');
const files = [
  'controlagents.js',
  'controlmemory.js',
  'controlapprovals.js',
  'controlactions.js',
  'controlcosts.js',
  'controlproviders.js'
];

for (const file of files) {
  const desktop = fs.readFileSync(path.join(root, 'frontend', 'app', file), 'utf8');
  const website = fs.readFileSync(path.join(root, 'website', 'app', 'app', file), 'utf8');
  A.eq(website, desktop, `${file} website mirror matches desktop`);
  A.ok(/let[\s\S]{0,120}generation\s*=\s*0/.test(desktop), `${file} owns a generation token`);
  A.ok(desktop.includes('const token = ++generation'), `${file} versions every refresh`);
  A.ok(desktop.includes('token === generation && isOpen()'), `${file} ignores stale responses and closed-panel results`);
  A.ok(desktop.includes('generation++'), `${file} invalidates in-flight refreshes on stop`);
  A.ok(desktop.includes('clearInterval(timer)'), `${file} clears polling when stopped or restarted`);
  A.ok(desktop.includes('setInterval(() => { if (isOpen()) refresh(); }, POLL_MS)'), `${file} polls only while Control Mode is open`);
  A.ok(desktop.includes("attributeFilter:['hidden']") || desktop.includes("attributeFilter: ['hidden']"), `${file} lifecycle follows the panel hidden attribute`);
  A.ok(/catch\s*\(_\)\s*\{[\s\S]{0,180}renderUnavailable\(/.test(desktop), `${file} renders an explicit unavailable state after endpoint failure`);
  A.ok(!/catch\s*\(_\)\s*\{\s*\}/.test(desktop), `${file} does not silently swallow endpoint failure`);
}

A.report('control-mode-lifecycle-contract.test');
