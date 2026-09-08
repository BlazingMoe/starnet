/* Idempotent source patch for wiring Moe AI Station managed-task history into sidecar/index.js.
   This deliberately uses exact, single-occurrence anchors. If upstream/source drift changes an
   anchor, the script aborts instead of guessing at a new insertion point. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'sidecar', 'index.js');
let src = fs.readFileSync(file, 'utf8');

const DONE = [
  "const { makeTaskHistoryHost } = require('./orchestration/task-history-host.js');",
  'const managedTaskHistoryHost = makeTaskHistoryHost({',
  'managedTaskHistory: managedTaskHistoryHost.store,',
  "{ m: 'GET', prefix: '/api/managed-tasks', h: managedTaskHistoryHost.serve },"
];
if (DONE.every(marker => src.includes(marker))) {
  console.log('managed-task host wiring already present; no-op');
  process.exit(0);
}
if (DONE.some(marker => src.includes(marker))) {
  throw new Error('partial managed-task host wiring detected; refusing a mixed-state patch');
}

function replaceOnce(anchor, replacement, label) {
  const first = src.indexOf(anchor);
  if (first < 0) throw new Error('missing patch anchor: ' + label);
  if (src.indexOf(anchor, first + anchor.length) >= 0) throw new Error('non-unique patch anchor: ' + label);
  src = src.slice(0, first) + replacement + src.slice(first + anchor.length);
}

const orchestrationImport = "const { makeOrchestrationTools } = require('./tools/builtin/orchestration.js');   // Stage 2: team.dispatch (lead->worker delegation)";
replaceOnce(
  orchestrationImport,
  orchestrationImport + "\nconst { makeTaskHistoryHost } = require('./orchestration/task-history-host.js');   // Moe AI Station: durable managed-delegation telemetry",
  'orchestration import'
);

const workspaceAnchor = "const WORKSPACES = ENV('WORKSPACES') ? path.resolve(ENV('WORKSPACES')) : defaultWorkspaces();\nconst outputArtifacts = makeOutputArtifacts({ fsp, fs, pathMod: path, root: WORKSPACES, crypto });";
replaceOnce(
  workspaceAnchor,
  "const WORKSPACES = ENV('WORKSPACES') ? path.resolve(ENV('WORKSPACES')) : defaultWorkspaces();\n" +
  "const outputArtifacts = makeOutputArtifacts({ fsp, fs, pathMod: path, root: WORKSPACES, crypto });\n" +
  "const managedTaskHistoryHost = makeTaskHistoryHost({\n" +
  "  path, fs, workspaces: WORKSPACES, readBoundedJsonl, appendJsonlDurable, failNote, respondJson,\n" +
  "  clock: { now: () => Date.now() }\n" +
  "});",
  'workspace composition'
);

const classAnchor = "    classes: SPECIALIST_CLASSES,   // Class Loadouts S1: the summon-tool class list, composed from the shared catalog (no hardcoded prose)";
replaceOnce(
  classAnchor,
  "    managedTaskHistory: managedTaskHistoryHost.store,   // shared durable history for team.delegate_managed\n" + classAnchor,
  'orchestration history injection'
);

const routeAnchor = "  { m: 'GET', prefix: '/api/runs', h: serveRuns },";
replaceOnce(
  routeAnchor,
  "  { m: 'GET', prefix: '/api/managed-tasks', h: managedTaskHistoryHost.serve },   // Control Mode: read-only managed delegation telemetry\n" + routeAnchor,
  'managed task API route'
);

for (const marker of DONE) {
  if (!src.includes(marker)) throw new Error('post-patch marker missing: ' + marker);
}
fs.writeFileSync(file, src, 'utf8');
console.log('wired managed-task history into sidecar/index.js');
