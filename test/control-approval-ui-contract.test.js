/* node test/control-approval-ui-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlapprovals.js'), 'utf8');
const mirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlapprovals.js'), 'utf8');
const memory = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlmemory.js'), 'utf8');

A.ok(src.includes("const ENDPOINT = '/api/control/approvals'"), 'approval pane reads the dedicated read-only endpoint');
A.ok(src.includes("body.schemaVersion === 'moe.control-approvals.v1'"), 'approval pane requires the expected projection schema');
A.ok(src.includes("body.mode === 'read-only'"), 'approval pane refuses to treat non-read-only payloads as authoritative');
A.ok(src.includes('PERMANENT GRANTS'), 'approval pane renders permanent grants');
A.ok(src.includes('SESSION GRANTS'), 'approval pane renders session grants');
A.ok(src.includes('WAITING FOR CONSENT'), 'approval pane renders live pending prompt IDs');
A.ok(src.includes('Agent, tool, and action details are unavailable from the authoritative pending store.'), 'missing pending metadata is explicitly unknown instead of inferred');
A.ok(src.includes('Pending prompt details are not inferred beyond their real prompt IDs.'), 'UI states the pending-prompt truth boundary');
A.ok(src.includes('no grants, sessions, or waiting prompts are inferred'), 'endpoint outage cannot fabricate an empty approval state');
A.ok(src.includes('clearInterval(timer)'), 'approval polling stops with Control Mode');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(src), 'approval pane contains no mutating Harness API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(src), 'approval pane contains no raw mutating HTTP fallback');
A.ok(!/addEventListener\s*\([^\n]*(?:approve|reject|grant|revoke|bypass)/i.test(src), 'approval pane exposes no approval mutation controls');
A.eq(mirror, src, 'website approval pane mirrors the desktop source exactly');
A.ok(memory.includes("script.src = 'app/controlapprovals.js'"), 'Control Mode memory pane chains the approval pane');
A.ok(memory.includes("script.id = 'mo-control-mode-approvals'"), 'approval pane loader is idempotent');

A.report('control-approval-ui-contract.test');
