'use strict';

const { ok, eq, report } = require('./_assert');
const recipes = require('../frontend/app/recipe-catalog/index.js');

const launch = recipes.find(r => r && r.id === 'validated-opportunity-launch');
ok(launch, 'validated-opportunity-launch is registered in the canonical recipe catalog');
if (launch) {
  eq(launch.category, 'business', 'validated opportunity launch is a business recipe');
  ok(/validation_status is exactly VALIDATED/i.test(launch.task), 'launch only accepts validated opportunities');
  ok(/BLOCKED_NOT_VALIDATED/.test(launch.task), 'non-validated opportunities are explicitly blocked');
  ok(/authoritative observations and threshold evaluation/i.test(launch.task), 'validated status must be backed by recorded evidence');
  ok(/Preserve the original opportunity identity/i.test(launch.task), 'launch preserves the upstream opportunity identity');
  ok(/OBSERVED FACTS, ESTIMATES, ASSUMPTIONS and DECISIONS/i.test(launch.task), 'launch separates facts, estimates, assumptions and decisions');
  ok(/keep it unknown/i.test(launch.task), 'unsupported numeric inputs remain unknown');
  ok(/existing planning, capability resolution, consent, files and orchestration paths/i.test(launch.task), 'launch reuses existing StarNet truth paths');
  ok(/do not create or mirror a separate approval, budget, transaction, inventory, order, customer or revenue truth source/i.test(launch.task), 'launch cannot create parallel operational truth stores');
  ok(/canonical capability and consent path at execution time/i.test(launch.task), 'consequential actions remain permissioned at execution time');
  ok(/BLOCKED_CAPABILITY/.test(launch.task) && /rather than simulating it/i.test(launch.task), 'unavailable execution is blocked rather than fabricated');
  ok(/idempotency or duplicate-prevention requirements/i.test(launch.task), 'retryable consequential actions require duplicate prevention');
  ok(/Do not infer launch success from task completion/i.test(launch.task), 'generated work cannot masquerade as launch outcomes');
  ok(/maximum time and money at risk/i.test(launch.task) && /stop conditions/i.test(launch.task), 'launch keeps explicit exposure bounds');
  ok(/Do not automatically scale after launch/i.test(launch.task), 'launch cannot silently escalate into scaling');
}

report('moe validated opportunity launch recipe');
