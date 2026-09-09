/* node test/moe-claims-evidence-alignment.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const root = path.join(__dirname, '..');
const claims = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'product-perfect', 'moe-claims.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'moe-feature-evidence.json'), 'utf8'));
const featureById = new Map((evidence.features || []).map(row => [row.id, row]));
const claimById = new Map((claims.claims || []).map(row => [row.id, row]));

const mappings = [
  ['upstream-update-isolation', 'fork.update-isolation'],
  ['hierarchical-agent-organization', 'orchestration.org-roles'],
  ['managed-delegation', 'orchestration.managed-delegation'],
  ['control-mode-read-only-observability', 'control-mode.read-only-surfaces'],
  ['own-signed-update-channel', 'release.derivative-signing'],
  ['independent-branding', 'branding.derivative-assets'],
  ['data-path-migration', 'migration.derivative-app-id']
];

for (const [claimId, featureId] of mappings) {
  const claim = claimById.get(claimId);
  const feature = featureById.get(featureId);
  A.ok(!!claim, `mapped product claim exists: ${claimId}`);
  A.ok(!!feature, `mapped feature evidence exists: ${featureId}`);
  if (!claim || !feature) continue;
  if (feature.status === 'verified') A.eq(claim.status, 'verified-by-ci', `${claimId} cannot lag verified feature evidence`);
  if (feature.status === 'blocked') A.eq(claim.status, 'blocked', `${claimId} cannot claim readiness while feature evidence is blocked`);
}

const blockers = Array.isArray(claims.releaseBlockers) ? claims.releaseBlockers : [];
A.ok(blockers.length > 0, 'public release blockers remain explicit until distribution prerequisites are verified');
let blockedCount = 0;
for (const claimId of blockers) {
  const claim = claimById.get(claimId);
  A.ok(!!claim, `release blocker resolves to a product claim: ${claimId}`);
  if (claim && claim.status === 'blocked') blockedCount++;
}
A.ok(blockedCount > 0, 'at least one explicit distribution blocker remains');
A.eq(claims.publicReleaseReady, blockedCount === 0, 'publicReleaseReady is derived consistently from explicit blockers');

const controlClaim = claimById.get('control-mode-read-only-observability');
A.ok(/read-only/i.test(String(controlClaim && controlClaim.claim)), 'Control Mode claim remains explicitly read-only');
A.ok(/without inventing unavailable runtime state/i.test(String(controlClaim && controlClaim.claim)), 'Control Mode claim preserves the no-synthetic-state boundary');

A.report('moe-claims-evidence-alignment.test');
