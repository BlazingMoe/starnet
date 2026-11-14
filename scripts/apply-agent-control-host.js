/* Idempotent source patch for wiring Moe AI Station's sanitized agent organization view into sidecar/index.js.
   Uses exact single-occurrence anchors. Any host drift or partial prior wiring aborts instead of guessing. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'sidecar', 'index.js');
let src = fs.readFileSync(file, 'utf8');

const DONE = [
  "const { makeAgentControlHttp } = require('./control/agent-http.js');",
  'const agentControlHttp = makeAgentControlHttp({',
  "{ m: 'GET', exact: '/api/control/agents', h: agentControlHttp.serve },"
];
if (DONE.every(marker => src.includes(marker))) {
  console.log('agent control host wiring already present; no-op');
  process.exit(0);
}
if (DONE.some(marker => src.includes(marker))) throw new Error('partial agent control host wiring detected; refusing mixed-state patch');

function replaceOnce(anchor, replacement, label) {
  const first = src.indexOf(anchor);
  if (first < 0) throw new Error('missing patch anchor: ' + label);
  if (src.indexOf(anchor, first + anchor.length) >= 0) throw new Error('non-unique patch anchor: ' + label);
  src = src.slice(0, first) + replacement + src.slice(first + anchor.length);
}

const historyImport = "const { makeTaskHistoryHost } = require('./orchestration/task-history-host.js');   // Moe AI Station: durable managed-delegation telemetry";
replaceOnce(
  historyImport,
  historyImport + "\nconst { makeAgentControlHttp } = require('./control/agent-http.js');   // Moe AI Station: sanitized read-only live organization view",
  'managed history import'
);

const routesAnchor = 'const ROUTES = [';
replaceOnce(
  routesAnchor,
  "const agentControlHttp = makeAgentControlHttp({\n" +
  "  roster: () => agentRoster,\n" +
  "  respondJson\n" +
  "});\n\n" + routesAnchor,
  'route table composition'
);

const managedRoute = "  { m: 'GET', prefix: '/api/managed-tasks', h: managedTaskHistoryHost.serve },   // Control Mode: read-only managed delegation telemetry";
replaceOnce(
  managedRoute,
  managedRoute + "\n  { m: 'GET', exact: '/api/control/agents', h: agentControlHttp.serve },   // Control Mode: sanitized authoritative roster projection",
  'managed telemetry route'
);

for (const marker of DONE) if (!src.includes(marker)) throw new Error('post-patch marker missing: ' + marker);
fs.writeFileSync(file, src, 'utf8');
console.log('wired sanitized agent organization endpoint into sidecar/index.js');
