/* node test/orchestration-bridge-contract.test.js — derivative bridge/core cross-check. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const bridge = require('../sidecar/tools/builtin/orchestration.js');

const bridgeSrc = fs.readFileSync(path.join(__dirname, '../sidecar/tools/builtin/orchestration.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(__dirname, '../sidecar/tools/builtin/orchestration-core.js'), 'utf8');

A.ok(/require\(['"]\.\/orchestration-core\.js['"]\)/.test(bridgeSrc), 'canonical bridge imports inherited orchestration core');
A.ok(/core\.makeOrchestrationTools\(deps\)/.test(bridgeSrc), 'canonical bridge delegates factory construction to inherited core');

A.eq(bridge.injectedClassIds({ classes: [{ id: 'researcher' }, { id: 'engineer' }] }), ['researcher', 'engineer'], 'bridge preserves injected class ids');
A.throws(() => bridge.injectedClassIds({ classes: [{ id: 'researcher' }, { id: 'researcher' }] }), 'bridge fails closed on duplicate injected class ids');
A.eq(bridge.immediateWorkerReasoningEffort({ ident: { reasoningEffort: 'high' } }, 'low'), 'high', 'immediate worker effort overrides lead/default');
A.eq(bridge.queuedWorkerReasoningEffort({ reasoningEffort: 'medium' }, 'low'), 'medium', 'queued worker effort overrides lead/default');
A.eq(bridge.immediateWorkerReasoningEffort({}, 'low'), 'low', 'immediate worker effort falls back when worker has none');
A.eq(bridge.queuedWorkerReasoningEffort(null, 'low'), 'low', 'queued worker effort falls back when worker has none');

A.eq(bridge.workerIterationContract({}, null), { maxIters: 0 }, 'worker iteration ceiling defaults off/unlimited');
A.eq(bridge.workerIterationContract({ workerMaxIters: 12 }, null), { maxIters: 12 }, 'ordinary delegated worker inherits configured worker ceiling');
A.eq(bridge.workerIterationContract({ workerMaxIters: 12 }, { workerMaxIters: 5 }), { maxIters: 5 }, 'narrow task contract lowers the worker ceiling');
A.eq(bridge.workerIterationContract({ workerMaxIters: 5 }, { workerMaxIters: 12 }), { maxIters: 5 }, 'task contract can never raise the configured worker ceiling');
A.eq(bridge.workerIterationContract({}, { workerMaxIters: 4 }), { maxIters: 4 }, 'bounded task receives its local ceiling when ordinary ceiling is unlimited');

// Independent source cross-check: the inherited executor must implement the same public contracts,
// otherwise the bridge helpers would merely document a promise the real dispatcher does not keep.
A.ok(/deps\.classes[\s\S]{0,120}\.map\(c => c && c\.id\)/.test(coreSrc), 'core team.summon composes ids from injected class catalog');
A.ok(/reasoningEffort:\s*\(job\.ident && job\.ident\.reasoningEffort\)\s*\|\|\s*reasoningEffort/.test(coreSrc), 'core immediate dispatch honors worker-specific reasoning effort');
A.ok(/reasoningEffort:\s*\(ident && ident\.reasoningEffort\)\s*\|\|\s*reasoningEffort/.test(coreSrc), 'core queued dispatch honors worker-specific reasoning effort');
A.ok(/const\s+workerMaxIters[\s\S]{0,220}:\s*0;/.test(coreSrc), 'core delegated-worker ceiling defaults off');
A.ok(/maxIters:\s*bounded\s*\?\s*lowerPositive\(workerMaxIters,\s*bounded\.workerMaxIters\)\s*:\s*workerMaxIters/.test(coreSrc), 'core passes ordinary worker ceiling and only lowers it for a task-specific bound');

A.report('orchestration-bridge-contract.test');
