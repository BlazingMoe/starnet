'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error('action host patch: missing ' + label + ' anchor');
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('action host patch: ambiguous ' + label + ' anchor');
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function patchSource(source) {
  if (typeof source !== 'string' || !source) throw new Error('action host patch: source required');
  if (source.includes("require('./control/action-http.js')") || source.includes("exact: '/api/control/actions'")) {
    throw new Error('action host patch: wiring already present');
  }
  if (!source.includes('runJournal.')) throw new Error('action host patch: authoritative runJournal source not found');

  const approvalImport = "const { makeApprovalControlHttp } = require('./control/approval-http.js');   // Moe AI Station: read-only permission/approval overview";
  source = replaceOnce(
    source,
    approvalImport,
    approvalImport + "\nconst { makeActionControlHttp } = require('./control/action-http.js');   // Moe AI Station: read-only durable action trace",
    'control import'
  );

  const approvalBlock = [
    'const approvalControlHttp = makeApprovalControlHttp({',
    '  grantSnapshot: () => grantManager.snapshot(),',
    '  consentSnapshot: () => approvalConsentSnapshot.snapshot(),',
    '  pending: () => pendingByRun,',
    '  respondJson',
    '});',
    'const costControlHttp = makeCostControlHttp({'
  ].join('\n');

  const wiredBlock = [
    'const approvalControlHttp = makeApprovalControlHttp({',
    '  grantSnapshot: () => grantManager.snapshot(),',
    '  consentSnapshot: () => approvalConsentSnapshot.snapshot(),',
    '  pending: () => pendingByRun,',
    '  respondJson',
    '});',
    '// Durable run-journal remains the only action-history source; this adapter only pages and projects it.',
    'const actionControlHttp = makeActionControlHttp({',
    '  recoverPage: (options) => runJournal.recoverPage(options),',
    '  respondJson',
    '});',
    'const costControlHttp = makeCostControlHttp({'
  ].join('\n');

  source = replaceOnce(source, approvalBlock, wiredBlock, 'handler construction');

  const approvalRoute = "  { m: 'GET', exact: '/api/control/approvals', h: approvalControlHttp.serve },   // Control Mode: read-only authoritative permission/approval projection";
  source = replaceOnce(
    source,
    approvalRoute,
    approvalRoute + "\n  { m: 'GET', exact: '/api/control/actions', h: actionControlHttp.serve },   // Control Mode: read-only durable run-journal action trace",
    'route'
  );

  return source;
}

function main() {
  const target = path.join(__dirname, '..', 'sidecar', 'index.js');
  const before = fs.readFileSync(target, 'utf8');
  const after = patchSource(before);
  fs.writeFileSync(target, after);
  process.stdout.write('action control host wiring applied\n');
}

if (require.main === module) main();
module.exports = { patchSource };
