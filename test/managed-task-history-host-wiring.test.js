/* Source-level host wiring contract for managed task history.
   The runtime modules are unit-tested separately; this test proves the composition root actually
   connects durable history, managed delegation and the read-only Control Mode API. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../sidecar/index.js'), 'utf8');

A.ok(/makeTaskHistoryHost\s*}\s*=\s*require\('\.\/orchestration\/task-history-host\.js'\)/.test(src),
  'sidecar imports the managed task history host composer');
A.ok(/managedTaskHistoryHost\s*=\s*makeTaskHistoryHost\(\{[\s\S]{0,400}workspaces:\s*WORKSPACES[\s\S]{0,400}readBoundedJsonl[\s\S]{0,400}appendJsonlDurable[\s\S]{0,400}respondJson/.test(src),
  'managed history is composed from the canonical workspace, bounded JSONL reader, durable append and responder');
A.ok(/managedTaskHistory:\s*managedTaskHistoryHost\.store/.test(src),
  'team.delegate_managed receives the singleton durable managed task store');
A.ok(/\{\s*m:\s*'GET',\s*prefix:\s*'\/api\/managed-tasks',\s*h:\s*managedTaskHistoryHost\.serve\s*}/.test(src),
  'the host exposes exactly a GET-only managed-task telemetry route');
A.ok(!/\{\s*m:\s*'(?:POST|PUT|PATCH|DELETE)',\s*(?:prefix|exact|qsplit):\s*'\/api\/managed-tasks/.test(src),
  'managed task telemetry has no mutation route');

console.log('managed-task-history-host-wiring: ok');
