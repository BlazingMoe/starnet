/* node test/control-cost-ui-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlcosts.js'), 'utf8');
const mirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlcosts.js'), 'utf8');
const actions = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlactions.js'), 'utf8');
const actionsMirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlactions.js'), 'utf8');

A.ok(src.includes("const ENDPOINT = '/api/control/costs'"), 'cost pane reads the dedicated read-only endpoint');
A.ok(src.includes("body.overview.schemaVersion === 'moe.control-costs.v1'"), 'cost pane requires the expected projection schema');
A.ok(src.includes("'SPEND LEDGER + BUDGET GOVERNOR · READ ONLY'"), 'cost pane identifies its authoritative stores and read-only mode');
A.ok(src.includes('Cost and budget state unavailable — no spend, token, cap, or governor values are inferred.'), 'endpoint outage cannot fabricate spend or governor state');
A.ok(src.includes("['METERED USD', usd(totals.meteredUsd)]"), 'metered spend comes from the cost projection');
A.ok(src.includes("['UNMETERED RUNS', num(totals.unmeteredRuns)]"), 'unmetered work remains visible without treating it as charged USD');
A.ok(src.includes("['PER RUN CAP', usd(budgets.perRun)]"), 'existing per-run cap is rendered');
A.ok(src.includes("['GLOBAL CAP', usd(budgets.globalCap)]"), 'existing global cap is rendered');
A.ok(src.includes("evidence.budgetGovernorKnown ? 'Budget governor status is present.' : 'Budget governor status is unavailable; no governor state is inferred.'"), 'missing governor evidence remains explicitly unknown');
A.ok(src.includes('Control Mode cannot change caps, budgets, billing, or ledger records.'), 'UI states the mutation boundary');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(src), 'cost pane contains no mutating Harness API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(src), 'cost pane contains no raw mutating HTTP fallback');
A.ok(!/addEventListener\s*\([^\n]*(?:budget|cap|billing|ledger|save|apply|reset)/i.test(src), 'cost pane exposes no mutation controls');
A.ok(src.includes('clearInterval(timer)'), 'cost polling stops with Control Mode');
A.eq(mirror, src, 'website cost pane mirrors the desktop source exactly');
A.eq(actionsMirror, actions, 'website action pane stays mirrored after chaining cost pane');
A.ok(actions.includes("script.src = 'app/controlcosts.js'"), 'action pane chains the cost pane');
A.ok(actions.includes("script.id = 'mo-control-mode-costs'"), 'cost pane loader is idempotent');

A.report('control-cost-ui-contract.test');
