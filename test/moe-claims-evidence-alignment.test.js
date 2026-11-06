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
  ['starnet-subsystem-reuse', 'architecture.starnet-reuse'],
  ['hierarchical-agent-organization', 'orchestration.org-roles'],
  ['managed-delegation', 'orchestration.managed-delegation'],
  ['control-mode-read-only-observability', 'control-mode.read-only-surfaces'],
  ['own-signed-update-channel', 'release.derivative-signing'],
  ['independent-branding', 'branding.derivative-assets'],
  ['data-path-migration', 'migration.derivative-app-id']
];

const statusByFeature = new Map([
  ['verified', 'verified-by-ci'],
  ['blocked', 'blocked'],
  ['design-boundary', 'design-boundary'],
  ['out-of-scope-private-use', 'out-of-scope-private-use']
]);

for (const [claimId, featureId] of mappings) {
  const claim = claimById.get(claimId);
  const feature = featureById.get(featureId);
  A.ok(!!claim, `mapped product claim exists: ${claimId}`);
  A.ok(!!feature, `mapped feature evidence exists: ${featureId}`);
  if (!claim || !feature) continue;
  const expected = statusByFeature.get(feature.status);
  if (expected) A.eq(claim.status, expected, `${claimId} status matches authoritative feature evidence`);
}

const blockers = Array.isArray(claims.releaseBlockers) ? claims.releaseBlockers : [];
const privateUse = claims.usageTarget === 'private-starnet-fork';

if (privateUse) {
  A.eq(evidence.usageTarget, 'private-starnet-fork', 'claims and evidence share the private fork target');
  A.eq(blockers.length, 0, 'public distribution blockers are not active work items for the private-use target');
  A.eq(claims.publicReleaseReady, false, 'private-use scope never implies public release readiness');

  for (const claimId of ['own-signed-update-channel', 'independent-branding', 'data-path-migration']) {
    const claim = claimById.get(claimId);
    A.eq(claim && claim.status, 'out-of-scope-private-use', `${claimId} remains explicitly outside private-use scope`);
  }
  A.ok(/public redistribution is not a project goal/i.test(String(claims.distributionNote || '')), 'private-use claims keep redistribution outside current scope');
} else {
  let blockedCount = 0;
  for (const claimId of blockers) {
    const claim = claimById.get(claimId);
    A.ok(!!claim, `release blocker resolves to a product claim: ${claimId}`);
    if (claim && claim.status === 'blocked') blockedCount++;
  }
  A.eq(claims.publicReleaseReady, blockedCount === 0, 'publicReleaseReady follows active public-distribution blockers');
}

const controlClaim = claimById.get('control-mode-read-only-observability');
A.ok(/read-only/i.test(String(controlClaim && controlClaim.claim)), 'Control Mode claim remains explicitly read-only');
A.ok(/without inventing unavailable runtime state/i.test(String(controlClaim && controlClaim.claim)), 'Control Mode claim preserves the no-synthetic-state boundary');

A.report('moe-claims-evidence-alignment.test');
