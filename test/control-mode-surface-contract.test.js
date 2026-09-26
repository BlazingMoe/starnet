/* node test/control-mode-surface-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'sidecar', 'index.js'), 'utf8');
const surfaces = [
  ['agents', 'controlagents.js', '/api/control/agents'],
  ['memory', 'controlmemory.js', '/api/control/memory'],
  ['approvals', 'controlapprovals.js', '/api/control/approvals'],
  ['actions', 'controlactions.js', '/api/control/actions'],
  ['costs', 'controlcosts.js', '/api/control/costs'],
  ['providers', 'controlproviders.js', '/api/control/providers']
];

for (const [name, file, endpoint] of surfaces) {
  const desktop = fs.readFileSync(path.join(root, 'frontend', 'app', file), 'utf8');
  const website = fs.readFileSync(path.join(root, 'website', 'app', 'app', file), 'utf8');
  A.eq(website, desktop, `${name} Control Mode surface mirrors desktop exactly`);
  A.ok(desktop.includes(`const ENDPOINT = '${endpoint}`), `${name} surface reads its dedicated Control Mode endpoint`);
  A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(desktop), `${name} surface has no mutating Harness API call`);
  A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(desktop), `${name} surface has no raw mutating HTTP fallback`);
}

for (const endpoint of ['/api/control/agents', '/api/control/memory', '/api/control/approvals', '/api/control/actions', '/api/control/costs', '/api/control/providers']) {
  const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = index.match(new RegExp(`(?:exact|prefix): '${escaped}'`, 'g')) || [];
  A.eq(matches.length, 1, `${endpoint} has exactly one host route`);
}

A.ok(index.includes("{ m: 'GET', exact: '/api/control/agents'"), 'agent projection is GET-only at the host route');
A.ok(index.includes("{ m: 'GET', exact: '/api/control/approvals'"), 'approval projection is GET-only at the host route');
A.ok(index.includes("{ m: 'GET', exact: '/api/control/actions'"), 'action projection is GET-only at the host route');
A.ok(index.includes("{ m: 'GET', exact: '/api/control/memory'"), 'memory projection is GET-only at the host route');
A.ok(index.includes("{ m: 'GET', exact: '/api/control/costs'"), 'cost projection is GET-only at the host route');
A.ok(index.includes("{ m: 'GET', exact: '/api/control/providers'"), 'provider projection is GET-only at the host route');

A.ok(index.includes('recoverPage: (options) => runJournal.recoverPage(options)'), 'action surface keeps durable runJournal as its only host source');
A.ok(!/actionTrace\s*=\s*new (?:Map|Set)/.test(index), 'host does not introduce a parallel action trace store');
A.ok(!/controlActions\s*=\s*new (?:Map|Set)/.test(index), 'host does not introduce a parallel Control Mode action store');
A.ok(index.includes("profiles: () => require('./providers/registry.js').listProviderProfiles()"), 'provider surface reads registry profiles directly');
A.ok(index.includes('rateLimits: () => rateLimits.snapshot()'), 'provider surface reads the existing rate-limit store directly');
A.ok(!/providerHealth\s*=\s*new (?:Map|Set)/.test(index), 'host does not introduce a parallel provider health store');
A.ok(!/controlProviders\s*=\s*new (?:Map|Set)/.test(index), 'host does not introduce a parallel Control Mode provider store');

const memory = fs.readFileSync(path.join(root, 'frontend', 'app', 'controlmemory.js'), 'utf8');
const approvals = fs.readFileSync(path.join(root, 'frontend', 'app', 'controlapprovals.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'frontend', 'app', 'controlactions.js'), 'utf8');
const costs = fs.readFileSync(path.join(root, 'frontend', 'app', 'controlcosts.js'), 'utf8');
const providers = fs.readFileSync(path.join(root, 'frontend', 'app', 'controlproviders.js'), 'utf8');
A.ok(memory.includes("script.src = 'app/controlapprovals.js'"), 'loader chain continues memory → approvals');
A.ok(approvals.includes("script.src = 'app/controlactions.js'"), 'loader chain continues approvals → actions');
A.ok(actions.includes("script.src = 'app/controlcosts.js'"), 'loader chain continues actions → costs');
A.ok(costs.includes("script.src = 'app/controlproviders.js'"), 'loader chain continues costs → providers');
A.ok(!/script\.src\s*=\s*['\"]app\/control(?:memory|approvals|actions|costs)\.js['\"]/.test(providers), 'provider surface is the terminal loader and cannot create a cycle');

A.report('control-mode-surface-contract.test');
