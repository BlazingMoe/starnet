/* Source-level composition contract for the sanitized Control Mode organization endpoint. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../sidecar/index.js'), 'utf8');

A.ok(/makeAgentControlHttp\s*}\s*=\s*require\('\.\/control\/agent-http\.js'\)/.test(src),
  'sidecar imports the sanitized agent control HTTP composer');
A.ok(/agentControlHttp\s*=\s*makeAgentControlHttp\(\{[\s\S]{0,180}roster:\s*\(\)\s*=>\s*agentRoster[\s\S]{0,180}respondJson/.test(src),
  'Control Mode reads the authoritative live agentRoster through a thunk');
A.ok(/\{\s*m:\s*'GET',\s*exact:\s*'\/api\/control\/agents',\s*h:\s*agentControlHttp\.serve\s*}/.test(src),
  'sidecar exposes exactly the read-only Control Mode agent endpoint');
A.ok(!/\{\s*m:\s*'(?:POST|PUT|PATCH|DELETE)',\s*(?:prefix|exact|qsplit):\s*'\/api\/control\/agents/.test(src),
  'agent organization telemetry has no mutation route');
A.ok(!/projectAgentOrganization\([^)]*managedTaskHistory/.test(src),
  'host never derives agent organization from managed-task history');

A.report('control-agent-host-wiring.test');
