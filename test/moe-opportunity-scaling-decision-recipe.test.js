'use strict';

const { ok, eq, report } = require('./_assert');
const recipes = require('../frontend/app/recipe-catalog/index.js');

const scale = recipes.find(r => r && r.id === 'opportunity-scaling-decision');
ok(scale, 'opportunity-scaling-decision is registered in the canonical recipe catalog');
if (scale) {
  eq(scale.category, 'business', 'opportunity scaling decision is a business recipe');
  ok(/launch_execution_state is OUTCOME_UNKNOWN/i.test(scale.task), 'unknown launch execution blocks scaling');
  ok(/authoritative measurement sources declared before launch/i.test(scale.task), 'post-launch outcomes come from predeclared authoritative sources');
  ok(/OBSERVED FACTS, ESTIMATES, ASSUMPTIONS and DECISIONS/i.test(scale.task), 'scaling keeps evidence classes separate');
  ok(/otherwise keep the metric unknown/i.test(scale.task), 'unsupported economics remain unknown');
  ok(/Never infer sales, profit, conversion, demand or return on spend/i.test(scale.task), 'scaling cannot fabricate commercial outcomes');
  ok(/SCALE_READY/.test(scale.task) && /HOLD/.test(scale.task) && /STOP/.test(scale.task) && /INCONCLUSIVE/.test(scale.task), 'scaling decision taxonomy is explicit');
  ok(/Do not rewrite the original thresholds after seeing results/i.test(scale.task), 'scaling cannot move success criteria after observing results');
  ok(/smallest next exposure increment/i.test(scale.task), 'successful scaling remains incremental and bounded');
  ok(/maximum incremental money, quantity, audience, channel and time at risk/i.test(scale.task), 'next exposure has explicit multidimensional bounds');
  ok(/new consequential decision, not inherited permission from the launch/i.test(scale.task), 'launch permission cannot silently authorize scale-up');
  ok(/canonical capability resolution, fresh consent and preflight at execution time/i.test(scale.task), 'consequential scaling reuses live permission checks');
  ok(/Never create or mirror a separate budget, approval, transaction, inventory, order, customer, revenue or analytics truth source/i.test(scale.task), 'scaling cannot create a parallel operational truth store');
  ok(/authoritative provider reconciliation paths/i.test(scale.task), 'scaling reuses provider reconciliation truth');
  ok(/BLOCKED_CAPABILITY/.test(scale.task) && /BLOCKED_PREFLIGHT/.test(scale.task), 'scaling readiness reports real execution blockers');
  ok(/Do not execute scaling inside this decision step/i.test(scale.task), 'decision and consequential execution remain separated');
}

report('moe opportunity scaling decision recipe');
