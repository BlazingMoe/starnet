'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'sidecar', 'index.js'), 'utf8');

assert.match(src, /makeManagedRecoveryLifecycleHook/,
  'host must import the bounded managed recovery lifecycle');
assert.match(src, /MANAGED_RECOVERY_ENABLED\s*=\s*\/\^\(1\|true\|yes\|on\)\$\/i/,
  'managed recovery must remain explicit operator policy, not implicit startup behavior');
assert.match(src, /if \(o\.lead === true && MANAGED_RECOVERY_ENABLED\)/,
  'only the active lead run may start managed recovery');
assert.match(src, /store:\s*managedTaskHistoryHost\.store/,
  'recovery must reuse the authoritative managed task-history store');
assert.match(src, /registry,\s*\n\s*leadAgentId:\s*agentId/,
  'recovery must use the same run Registry and explicit lead identity');
assert.match(src, /claimIdFor:\s*\(\) => crypto\.randomUUID\(\)/,
  'claim identity must be minted by the host, not invented by the scheduler');
assert.match(src, /limit:\s*1/,
  'host recovery pass must stay bounded');

const capCtxAt = src.indexOf('const capCtx = makeCapCtx(');
const recoveryAt = src.indexOf('const recoverManagedTasks = makeManagedRecoveryLifecycleHook(');
const providerAt = src.indexOf('// ---- provider + cost ----', capCtxAt);
assert.ok(capCtxAt >= 0 && recoveryAt > capCtxAt && providerAt > recoveryAt,
  'recovery must run at the awaitable lead boundary after capability context exists and before foreground provider execution');

console.log('managed recovery host wiring contract ok');
