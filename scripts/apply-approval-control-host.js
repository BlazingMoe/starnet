'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error('approval host patch: missing ' + label + ' anchor');
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('approval host patch: ambiguous ' + label + ' anchor');
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function patchSource(source) {
  if (typeof source !== 'string' || !source) throw new Error('approval host patch: source required');
  if (source.includes("require('./control/approval-http.js')") || source.includes("exact: '/api/control/approvals'")) {
    throw new Error('approval host patch: wiring already present');
  }

  source = replaceOnce(
    source,
    "const { makeCostControlHttp } = require('./control/cost-http.js');   // Moe AI Station: read-only ledger + budget governor overview",
    "const { makeCostControlHttp } = require('./control/cost-http.js');   // Moe AI Station: read-only ledger + budget governor overview\nconst { makeApprovalControlHttp } = require('./control/approval-http.js');   // Moe AI Station: read-only permission/approval overview",
    'control import'
  );

  const agentBlock = [
    'const agentControlHttp = makeAgentControlHttp({',
    '  roster: () => agentRoster,',
    '  statusByAgent: agentRuntimeStatus,',
    '  respondJson',
    '});',
    'const costControlHttp = makeCostControlHttp({'
  ].join('\n');

  const wiredBlock = [
    'const agentControlHttp = makeAgentControlHttp({',
    '  roster: () => agentRoster,',
    '  statusByAgent: agentRuntimeStatus,',
    '  respondJson',
    '});',
    '// Snapshot-only broker: shares the authoritative permission grant stores but never evaluates or grants an action.',
    '// Reusing permissions.snapshot() here avoids a second session-grant projection in Control Mode.',
    'const approvalConsentSnapshot = makeConsentBroker({ grantsSession, grantsPermanent });',
    'const approvalControlHttp = makeApprovalControlHttp({',
    '  grantSnapshot: () => grantManager.snapshot(),',
    '  consentSnapshot: () => approvalConsentSnapshot.snapshot(),',
    '  pending: () => pendingByRun,',
    '  respondJson',
    '});',
    'const costControlHttp = makeCostControlHttp({'
  ].join('\n');

  source = replaceOnce(source, agentBlock, wiredBlock, 'handler construction');

  const agentRoute = "  { m: 'GET', exact: '/api/control/agents', h: agentControlHttp.serve },   // Control Mode: sanitized authoritative roster projection";
  source = replaceOnce(
    source,
    agentRoute,
    agentRoute + "\n  { m: 'GET', exact: '/api/control/approvals', h: approvalControlHttp.serve },   // Control Mode: read-only authoritative permission/approval projection",
    'route'
  );

  return source;
}

function main() {
  const target = path.join(__dirname, '..', 'sidecar', 'index.js');
  const before = fs.readFileSync(target, 'utf8');
  const after = patchSource(before);
  fs.writeFileSync(target, after);
  process.stdout.write('approval control host wiring applied\n');
}

if (require.main === module) main();
module.exports = { patchSource };
