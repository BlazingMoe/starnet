/* node test/control-action-ui-contract.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./_assert.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlactions.js'), 'utf8');
const mirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlactions.js'), 'utf8');
const recovery = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlrecoveries.js'), 'utf8');
const recoveryMirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlrecoveries.js'), 'utf8');
const approvals = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'controlapprovals.js'), 'utf8');
const approvalsMirror = fs.readFileSync(path.join(__dirname, '..', 'website', 'app', 'app', 'controlapprovals.js'), 'utf8');

A.ok(src.includes("const ENDPOINT = '/api/control/actions?runs=100&limit=100'"), 'action pane reads the dedicated bounded read-only endpoint');
A.ok(src.includes("trace.schemaVersion === 'moe.control-actions.v1'"), 'action pane requires the expected projection schema');
A.ok(src.includes("'ACTION TRACE'"), 'action pane exposes the action trace surface');
A.ok(src.includes("'RUN JOURNAL · READ ONLY'"), 'action pane identifies the durable truth source and read-only mode');
A.ok(src.includes('Action trace unavailable — no tool calls, phases, or outcomes are inferred.'), 'endpoint outage cannot fabricate an empty action history');
A.ok(src.includes('Tool arguments, raw result content, replay fingerprints, retries, and mutation controls are intentionally absent.'), 'UI states the action trace privacy and mutation boundary');
A.ok(src.includes("item.mutating === true ? 'MUTATING'"), 'real mutation classification is rendered without inference');
A.ok(src.includes("item.ok === true ? 'OK'"), 'real result state is rendered when present');
A.ok(src.includes('fmtWhen(item.startedAt)'), 'only authoritative run start time is rendered');
A.ok(!src.includes('item.durationMs'), 'action duration is not invented');
A.ok(!src.includes('item.argsRaw'), 'tool arguments are not rendered');
A.ok(!src.includes('item.replayFingerprint'), 'replay fingerprints are not rendered');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(src), 'action pane contains no mutating Harness API calls');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(src), 'action pane contains no raw mutating HTTP fallback');
A.ok(src.includes('clearInterval(timer)'), 'action polling stops with Control Mode');
A.eq(mirror, src, 'website action pane mirrors the desktop source exactly');
A.eq(approvalsMirror, approvals, 'website approval pane stays mirrored after chaining action trace');
A.ok(approvals.includes("script.src = 'app/controlactions.js'"), 'approval pane chains the action trace pane');
A.ok(approvals.includes("script.id = 'mo-control-mode-actions'"), 'action trace loader is idempotent');

A.eq(recoveryMirror, recovery, 'website recovery pane mirrors the desktop source exactly');
A.ok(recovery.includes("const ENDPOINT = '/api/managed-task-recoveries?limit=100'"), 'recovery pane reads only the bounded recovery endpoint');
A.ok(recovery.includes("body.recoveries.schemaVersion==='moe.control-recoveries.v1'"), 'recovery pane requires the privacy-safe projection schema');
A.ok(recovery.includes("'RECOVERY STATUS'"), 'recovery pane has an explicit operator-visible title');
A.ok(recovery.includes("label(item.operatorState,'REVIEW')"), 'operator state is rendered from the canonical server projection');
A.ok(recovery.includes("rows.filter(item=>item.operatorState==='SAFE TO RESTART').length"), 'recovery summary counts canonical safe-restart guidance only');
A.ok(recovery.includes("rows.filter(item=>item.operatorState==='DO NOT RETRY').length"), 'recovery summary counts canonical fail-closed guidance only');
A.ok(recovery.includes("'RECOVERY QUEUE · '+rows.length+' TOTAL · '+safe+' SAFE TO RESTART · '+blocked+' DO NOT RETRY · '+review+' REVIEW'"), 'operator gets an at-a-glance recovery queue summary');
A.ok(recovery.includes("setAttribute('aria-label','Recovery queue summary')"), 'recovery summary is explicitly labelled for assistive technology');
A.ok(recovery.includes("'RECONCILIATION '+label(item.reconciliationOutcome)+' · DECISION '+label(item.reconciliationDecision)"), 'operator sees the durable reconciliation decision alongside its outcome');
A.ok(recovery.includes("'WHY · '+label(item.operatorMeaning"), 'plain-language meaning comes from the canonical recovery projection');
A.ok(recovery.includes("'NEXT · '+label(item.nextMove"), 'next move comes from the canonical recovery projection');
A.ok(!recovery.includes('function operatorMeaning('), 'browser does not maintain a second recovery interpretation');
A.ok(!recovery.includes('function nextMove('), 'browser does not maintain a second next-move policy');
A.ok(recovery.includes('Recovery status unavailable — no task outcome or retry safety is inferred.'), 'recovery outage never fabricates safety');
A.ok(recovery.includes('Provider references and task content are intentionally hidden.'), 'recovery UI preserves provider/task privacy boundary');
A.ok(!/Harness\.api\.(post|put|patch|delete)\s*\(/.test(recovery), 'recovery pane cannot mutate task state');
A.ok(!/fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)/is.test(recovery), 'recovery pane has no raw mutating HTTP fallback');

A.report('control-action-ui-contract.test');
