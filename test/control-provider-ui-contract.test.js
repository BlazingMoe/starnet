/* node test/control-provider-ui-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlproviders.js'), 'utf8');
const mirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlproviders.js'), 'utf8');
const costs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlcosts.js'), 'utf8');
const costsMirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlcosts.js'), 'utf8');

A.ok(src.includes("const ENDPOINT = '/api/control/providers'"), 'provider pane reads only the dedicated provider endpoint');
A.ok(src.includes("body.overview.schemaVersion === 'moe.control-providers.v1'"), 'provider pane requires the expected projection schema');
A.ok(src.includes("'REGISTRY + OBSERVED QUOTA · READ ONLY'"), 'provider pane identifies its two evidence sources and read-only mode');
A.ok(src.includes('QUOTA · NOT OBSERVED'), 'missing quota evidence is explicitly unobserved instead of zero/unlimited');
A.ok(src.includes('Provider signals unavailable — health, credentials, availability, and quota state are not inferred.'), 'endpoint outage cannot fabricate provider state');
A.ok(src.includes('Registry metadata is not a liveness probe.'), 'registry facts are not presented as provider liveness');
A.ok(src.includes('does not infer health, availability, credential validity, uptime, latency, success rate, or a health score.'), 'UI states the non-inference boundary');
A.ok(src.includes("value === true ? 'YES' : (value === false ? 'NO' : 'UNKNOWN')"), 'unknown capabilities remain explicitly unknown');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(src), 'provider pane contains no mutating Harness API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(src), 'provider pane contains no raw mutating HTTP fallback');
A.ok(!/addEventListener\s*\(/.test(src), 'provider pane exposes no mutation controls');
A.ok(!/healthScore\s*[=:]/.test(src), 'provider pane does not calculate or store a health score');
A.ok(!/credentialValid\s*[=:]/.test(src), 'provider pane does not calculate or store credential validity');
A.eq(mirror, src, 'website provider pane mirrors the desktop source exactly');
A.eq(costsMirror, costs, 'website cost pane stays mirrored after chaining provider pane');
A.ok(costs.includes("script.src = 'app/controlproviders.js'"), 'cost pane chains the provider pane');
A.ok(costs.includes("script.id = 'mo-control-mode-providers'"), 'provider pane loader is idempotent');
A.ok(!src.includes('controlcosts.js') && !src.includes('controlactions.js') && !src.includes('controlapprovals.js') && !src.includes('controlmemory.js'), 'provider pane is terminal and does not create a loader cycle');

A.report('control-provider-ui-contract.test');
