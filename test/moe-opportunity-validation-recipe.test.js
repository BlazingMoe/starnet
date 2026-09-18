'use strict';

const { ok, eq, report } = require('./_assert');
const recipes = require('../frontend/app/recipe-catalog/index.js');

const validation = recipes.find(r => r && r.id === 'opportunity-validation');
ok(validation, 'opportunity-validation is registered in the canonical recipe catalog');
if (validation) {
  eq(validation.category, 'business', 'opportunity validation is a business recipe');
  ok(/exactly one opportunity/i.test(validation.task) && /single predeclared experiment/i.test(validation.task), 'validation executes one bounded experiment only');
  ok(/still UNTESTED/i.test(validation.task), 'validation starts only from an untested discovery handoff');
  ok(/falsifiable hypothesis/i.test(validation.task) && /measurement window/i.test(validation.task), 'validation requires the predeclared experiment contract');
  ok(/authoritative outcome source/i.test(validation.task) && /success threshold/i.test(validation.task), 'business outcomes are bound to authoritative sources and thresholds');
  ok(/maximum time and money at risk/i.test(validation.task), 'validation preserves the declared exposure bound');
  ok(/existing capability resolution and existing consent path/i.test(validation.task), 'side effects reuse StarNet capability and consent gates');
  ok(/Never invent, cache, mirror or bypass a separate permission or approval state/i.test(validation.task), 'validation cannot create a parallel approval truth source');
  ok(/BLOCKED_CAPABILITY/.test(validation.task) && /DENIED_BY_CONSENT/.test(validation.task), 'capability and consent blockers are explicit execution states');
  ok(/denial is not evidence that the business hypothesis failed/i.test(validation.task), 'consent denial cannot falsify the opportunity');
  ok(/no canonical permitted tool path exists/i.test(validation.task) && /do not simulate completion/i.test(validation.task), 'unavailable consequential execution is reported rather than simulated');
  ok(/task completion, agent confidence, generated artifacts, estimates or inferred proxy metrics are never substitutes/i.test(validation.task), 'agent activity cannot fabricate business outcomes');
  ok(/VALIDATED only if recorded evidence meets/i.test(validation.task), 'validated status requires observed threshold evidence');
  ok(/FALSIFIED only if recorded evidence meets/i.test(validation.task), 'falsified status requires observed failure evidence');
  ok(/Missing, unavailable, partial or unverifiable outcome data must produce INCONCLUSIVE/i.test(validation.task), 'missing outcome data fails closed to inconclusive');
  ok(/unknown for any unsupported metric/i.test(validation.task), 'unsupported metrics remain unknown');
  ok(/Do not automatically promote, scale, publish, purchase, order, spend or start a follow-on workflow/i.test(validation.task), 'validation cannot silently escalate after classification');
}

report('moe opportunity validation recipe');
