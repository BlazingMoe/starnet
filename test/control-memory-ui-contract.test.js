/* Source contract for the content-free, read-only Control Mode memory pane. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../frontend/app/controlmemory.js'), 'utf8');
const nav = fs.readFileSync(path.join(__dirname, '../frontend/app/navdock.js'), 'utf8');
const mirror = fs.readFileSync(path.join(__dirname, '../website/app/app/controlmemory.js'), 'utf8');

A.ok(src.includes("'/api/control/memory?perAgent=12'"), 'memory pane reads the content-free Control Mode endpoint');
A.ok(src.includes('MEMORY / PROVENANCE'), 'memory pane exposes a dedicated provenance surface');
A.ok(src.includes('CONTENT HIDDEN'), 'UI explicitly states that memory content is hidden');
A.ok(src.includes('SOURCE-RUN LINKED'), 'summary surfaces source-run provenance coverage');
A.ok(src.includes('AVG EFFECTIVE TRUST'), 'per-agent memory trust is visible');
A.ok(src.includes('SOURCE RUN '), 'bounded record metadata can show explicit sourceRunId');
A.ok(src.includes('Store unavailable — record count, trust and provenance remain unknown.'), 'partial per-agent store failure remains unknown instead of zero');
A.ok(src.includes('Memory provenance unavailable — no record counts'), 'endpoint failure does not fabricate an empty memory system');
A.ok(src.includes("attributeFilter:['hidden']"), 'memory polling follows Control Mode open/closed state');
A.ok(src.includes('clearInterval(timer)'), 'memory polling stops when Control Mode closes');
A.ok(!/record\.(?:title|body|content)\b/.test(src), 'memory pane never reads memory text fields');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(src), 'memory pane performs no mutating Harness API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(src), 'memory pane has no raw mutating HTTP fallback');
A.ok(!/\b(pin|edit|forget|keep|discard)\b[^\n]{0,50}addEventListener\s*\(/i.test(src), 'Control Mode memory v1 exposes no memory mutation controls');
A.ok(nav.includes("loadOnce('app/controlmemory.js', 'mo-control-mode-memory')"), 'navigation loader boots the memory pane after organization');
A.eq(mirror, src, 'website app mirror carries the exact same memory provenance pane');

A.report('control-memory-ui-contract.test');
