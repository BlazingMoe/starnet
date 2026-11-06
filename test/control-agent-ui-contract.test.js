/* Source contract for the live, read-only Control Mode organization pane. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../frontend/app/controlagents.js'), 'utf8');
const nav = fs.readFileSync(path.join(__dirname, '../frontend/app/navdock.js'), 'utf8');

A.ok(src.includes("'/api/control/agents'"), 'organization pane reads the sanitized live agent endpoint');
A.ok(src.includes('Agent roster unavailable — no hierarchy'), 'unavailable roster never becomes an inferred hierarchy');
A.ok(src.includes("'unknown'"), 'unknown live state remains visibly unknown');
A.ok(src.includes('hierarchyEdgesExplicit'), 'UI surfaces explicit hierarchy evidence');
A.ok(src.includes('0 INFERRED'), 'UI states that no hierarchy edges are inferred');
A.ok(src.includes("agent.parentAgentId"), 'explicit parent evidence can be rendered');
A.ok(src.includes("attributeFilter: ['hidden']"), 'polling follows Control Mode open/closed state');
A.ok(src.includes('clearInterval(timer)'), 'organization polling stops when Control Mode closes');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(src), 'organization pane performs no mutating Harness API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(src), 'organization pane has no raw mutating HTTP fallback');
A.ok(nav.includes("loadOnce('app/controlagents.js', 'mo-control-mode-agents', loadMemory)"), 'navigation loader boots organization pane after Control Mode and then chains memory provenance');
A.ok(nav.includes("if (window.ControlModeUI) { loadAgents(); return; }"), 'already-loaded Control Mode still receives organization pane');

A.report('control-agent-ui-contract.test');
