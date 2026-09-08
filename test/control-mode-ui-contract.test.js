/* node test/control-mode-ui-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlmode.js'), 'utf8');
const nav = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'navdock.js'), 'utf8');

A.ok(src.includes("'/api/managed-tasks/summary'"), 'Control Mode reads managed summary telemetry');
A.ok(src.includes("'/api/managed-tasks/active?limit=100'"), 'Control Mode reads in-flight telemetry');
A.ok(src.includes("'/api/managed-tasks?limit=20'"), 'Control Mode reads recent managed history');
A.ok(src.includes('ControlModeView.project'), 'Control Mode renders through the tested pure projection layer');
A.ok(src.includes('Promise.allSettled'), 'partial endpoint failure cannot erase the whole dashboard');
A.ok(src.includes('unknown values remain shown as —'), 'unknown telemetry stays distinct from zero');
A.ok(src.includes("button.id = 'bb-control-mode'"), 'Control Mode owns a deterministic SYSTEM-dock entry');
A.ok(src.includes("button.setAttribute('role', 'menuitem')"), 'SYSTEM-dock entry remains keyboard semantics compatible');
A.ok(src.includes("ev.key === 'Escape'"), 'Control Mode has an explicit keyboard close path');
A.ok(src.includes('clearInterval(timer)'), 'polling is stopped when Control Mode closes');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(src), 'Control Mode performs no mutating API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(src), 'Control Mode contains no raw mutating HTTP fallback');
A.ok(!/\b(cancel|approve|reject|dispatch|spawn|steer)\b[^\n]{0,40}addEventListener\s*\(/i.test(src), 'v1 exposes no task mutation controls');
A.ok(nav.includes("loadOnce('app/controlmodeview.js', 'mo-control-mode-view', loadUi)"), 'nav dock loads the tested projection layer before the UI');
A.ok(nav.includes("loadOnce('app/controlmode.js', 'mo-control-mode-ui')"), 'nav dock bootstraps the read-only Control Mode UI');
A.ok(nav.includes('if (window.ControlModeUI) return;'), 'Control Mode bootstrap is idempotent');

A.report('control-mode-ui-contract.test');
