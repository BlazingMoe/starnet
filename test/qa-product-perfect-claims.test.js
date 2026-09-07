/* Moe AI Station derivative claims authority bridge.
   The inherited StarNet W0 ledger source-locks exact marketed frontend bytes. A derivative
   must intentionally change those bytes (branding, updater URLs, product copy), so treating
   that ledger as terminal authority would either block all legitimate fork work or tempt us
   to falsify the upstream manifest. We do neither: upstream drift must remain visibly BLOCKED,
   while the derivative has its own explicit claims ledger and release blockers. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const A = require('./_assert.js');

(async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const modePath = path.join(repoRoot, 'qa', 'product-perfect', 'derivative-mode.json');
  const claimsPath = path.join(repoRoot, 'qa', 'product-perfect', 'moe-claims.json');

  A.ok(fs.existsSync(modePath), 'derivative mode declaration is tracked');
  A.ok(fs.existsSync(claimsPath), 'derivative claims ledger is tracked');

  const mode = JSON.parse(fs.readFileSync(modePath, 'utf8'));
  const claims = JSON.parse(fs.readFileSync(claimsPath, 'utf8'));
  A.eq(mode.schema, 'moe-ai-station.derivative-claims-mode.v1', 'derivative mode schema is explicit');
  A.eq(mode.enabled, true, 'derivative mode is enabled');
  A.eq(mode.upstreamClaimsAuthority, 'non-authoritative', 'upstream marketing ledger is not derivative authority');
  A.eq(mode.rules && mode.rules.neverTreatUpstreamSurfaceDriftAsGreen, true, 'surface drift may never be silently green');
  A.eq(mode.rules && mode.rules.neverReuseUpstreamReleaseInfrastructure, true, 'upstream release infrastructure reuse is forbidden');
  A.eq(mode.rules && mode.rules.requireDerivativeClaimsLedgerBeforePublicRelease, true, 'own claims authority is required before release');

  A.eq(claims.schema, 'moe-ai-station.product-claims.v1', 'derivative claims schema is explicit');
  A.eq(claims.product, 'Moe AI Station', 'claims ledger belongs to the derivative');
  A.eq(claims.publicReleaseReady, false, 'development branch cannot claim public-release readiness yet');
  A.ok(Array.isArray(claims.claims) && claims.claims.length >= 8, 'initial derivative material-claim inventory exists');
  const ids = claims.claims.map(row => String(row && row.id || ''));
  A.eq(new Set(ids).size, ids.length, 'derivative claim IDs are unique');
  A.ok(ids.every(Boolean), 'derivative claim IDs are nonblank');

  const blockers = Array.isArray(claims.releaseBlockers) ? claims.releaseBlockers : [];
  A.ok(blockers.length >= 3, 'public release is explicitly blocked on unfinished derivative work');
  for (const id of blockers) {
    const row = claims.claims.find(item => item.id === id);
    A.ok(!!row, 'release blocker names a real claim: ' + id);
    A.eq(row && row.status, 'blocked', 'release blocker remains blocked: ' + id);
  }

  // Preserve the upstream ledger as historical evidence, but prove that it FAILS CLOSED once
  // derivative marketed bytes differ. We never rewrite it to pretend Moe AI Station is StarNet.
  const { inspectClaimsAuthority } = await import('../scripts/qa/product-perfect/claims.mjs');
  const upstream = inspectClaimsAuthority({ repoRoot });
  A.eq(upstream.planning.ok, false, 'StarNet exact-byte claims authority remains blocked by derivative surface drift');
  A.eq(upstream.planning.status, 'BLOCKED', 'upstream planning status is explicitly BLOCKED');
  A.eq(upstream.terminal.ok, false, 'upstream ledger can never authorize a derivative public release');
  A.ok(Array.isArray(upstream.planning.reasons) && upstream.planning.reasons.length > 0, 'upstream block has auditable reasons');
  A.ok(upstream.planning.reasons.some(reason => /release surface|locator|absence|bytes changed/i.test(String(reason))),
    'upstream block is grounded in an actual changed/invalid marketed surface');
  A.ok(/^[0-9a-f]{40}$/.test(String(upstream.candidateCommit || '')), 'candidate commit remains auditable');

  // The two release channels that previously escaped the fork boundary are independently locked
  // by fork-update-isolation.test.js. This claims bridge makes the policy visible to the product QA lane.
  const conf = fs.readFileSync(path.join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8');
  const updates = fs.readFileSync(path.join(repoRoot, 'frontend', 'app', 'updates.js'), 'utf8');
  A.ok(!/androoAGI\/starnet-releases|starnetos\.com/i.test(conf + '\n' + updates),
    'derivative product surface contains no upstream release/update destination');
  A.ok(/github\.com\/BlazingMoe\/starnet\/releases/i.test(conf + '\n' + updates),
    'reserved update/manual destinations are derivative-owned');

  A.report('qa-product-perfect-claims.test');
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
