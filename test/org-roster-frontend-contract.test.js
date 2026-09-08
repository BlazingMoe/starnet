/* node test/org-roster-frontend-contract.test.js — browser persistence/push contract for org metadata. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../frontend/app/app.js'), 'utf8');
const mirror = fs.readFileSync(path.join(__dirname, '../website/app/app/app.js'), 'utf8');

A.ok(/function orgRoleOf\(a\)[\s\S]{0,500}runtime === 'orchestrator'[\s\S]{0,180}'commander'[\s\S]{0,250}runtime === 'specialist'[\s\S]{0,180}'specialist'/.test(src),
  'browser has a legacy-runtime-to-org-role compatibility boundary');
A.ok(/function parentAgentIdOf\(a\)[\s\S]{0,220}a && a\.parentAgentId/.test(src),
  'parent migration reads only explicit parentAgentId');
A.ok(/liveAgents\(\)\.map\(a => \(\{[\s\S]{0,500}orgRole:\s*orgRoleOf\(a\),\s*parentAgentId:\s*parentAgentIdOf\(a\)/.test(src),
  'roster push separates org metadata from descriptive role');
A.ok(/function serializeAgentLite\(a\)[\s\S]{0,700}orgRole:\s*orgRoleOf\(a\),\s*parentAgentId:\s*parentAgentIdOf\(a\)/.test(src),
  'saved crew persist organizational metadata');
A.ok(/function rehydrateRoster\(savedAgents\)[\s\S]{0,1400}orgRole:\s*orgRoleOf\(s\),\s*parentAgentId:\s*parentAgentIdOf\(s\)/.test(src),
  'rehydration restores explicit metadata without reconstructing parents');
A.ok(/agent = \{ id: 'agent', name, role: 'orchestrator', orgRole: 'commander', parentAgentId: null/.test(src),
  'new founding agent is explicit commander');
A.ok(/id, name: nm, role: 'specialist'[\s\S]{0,300}orgRole:\s*orgRoleOf\(\{ orgRole: spec && spec\.orgRole, role: 'specialist' \}\)[\s\S]{0,220}parentAgentId:\s*summonParentAgentId\(opts\)/.test(src),
  'summoned crew receive explicit org role and creation parent');
A.eq(mirror, src, 'website mirror carries identical org metadata logic');
A.ok(/summonAgent\(spec, \{ activate: false, desk: true, parentAgentId: ev\.agentId \}\)/.test(src),
  'backend-initiated summon preserves the requesting agent as the explicit parent edge');
A.report('org-roster-frontend-contract.test');
