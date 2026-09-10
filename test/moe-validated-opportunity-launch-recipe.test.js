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
  ok(/READY_TO_EXECUTE/.test(launch.task), 'launch has an explicit positive readiness state');
  ok(/BLOCKED_PREFLIGHT/.test(launch.task), 'launch blocks unresolved mandatory preflight requirements');
  ok(/classify launch_state deterministically/i.test(launch.task), 'launch readiness is determined by an explicit state contract');
  ok(/Never use READY_TO_EXECUTE merely because a plan or asset was generated/i.test(launch.task), 'generated artifacts cannot masquerade as execution readiness');
  ok(/stable action_id/i.test(launch.task), 'ready actions carry stable identities for safe execution and reconciliation');
  ok(/maximum exposure delta/i.test(launch.task), 'each action carries a bounded exposure delta');
  ok(/dependency action_ids/i.test(launch.task), 'ready actions declare dependency identities instead of relying on implicit ordering');
  ok(/authoritative reconciliation source/i.test(launch.task), 'each action declares how its real side effect will be reconciled');
  ok(/treat this handoff as immutable input/i.test(launch.task), 'downstream execution cannot silently widen approved action parameters');
  ok(/re-resolved immediately before each consequential side effect/i.test(launch.task), 'capability and consent are refreshed at point of execution');
  ok(/readiness is not a cached permission/i.test(launch.task), 'launch readiness cannot substitute for live permission checks');
  ok(/every declared dependency action_id has a reconciled result/i.test(launch.task), 'dependent actions wait for reconciled dependency outcomes');
  ok(/do not execute its dependent consequential actions/i.test(launch.task), 'blocked denied or unknown dependencies stop downstream side effects');
  ok(/do not retry a consequential action until the authoritative reconciliation source/i.test(launch.task), 'ambiguous outcomes are reconciled before any retry');
  ok(/one execution_result per action_id/i.test(launch.task), 'execution emits one result for every planned action identity');
  ok(/EXECUTED_CONFIRMED/.test(launch.task) && /NOT_APPLIED_CONFIRMED/.test(launch.task) && /BLOCKED_AT_EXECUTION/.test(launch.task) && /DENIED_AT_EXECUTION/.test(launch.task) && /OUTCOME_UNKNOWN/.test(launch.task), 'execution result taxonomy is explicit and bounded');
  ok(/OUTCOME_UNKNOWN must freeze automatic retry/i.test(launch.task), 'unknown outcomes freeze retries until reconciliation');
  ok(/provider acknowledgements, task completion, local intent logs or agent assertions alone are insufficient/i.test(launch.task), 'executor cannot promote local or inferred signals into confirmed side effects');
  ok(/Derive terminal launch_execution_state only from the reconciled execution_result set/i.test(launch.task), 'terminal launch execution state derives only from reconciled action results');
  ok(/EXECUTION_CONFIRMED/.test(launch.task) && /PARTIAL_EXECUTION/.test(launch.task) && /EXECUTION_BLOCKED/.test(launch.task), 'terminal execution states distinguish confirmed partial and blocked outcomes');
  ok(/Never collapse OUTCOME_UNKNOWN into success or failure/i.test(launch.task), 'unknown execution remains explicitly unresolved');
  ok(/never mark the launch completed, failed, spent, ordered, published or charged from planned actions alone/i.test(launch.task), 'aggregate execution state comes only from reconciled action outcomes');
  ok(/do not fabricate identifiers when absent/i.test(launch.task), 'provider identifiers are preserved only when authoritative sources return them');
  ok(/Do not infer launch success from task completion/i.test(launch.task), 'generated work cannot masquerade as launch outcomes');
  ok(/maximum time and money at risk/i.test(launch.task) && /stop conditions/i.test(launch.task), 'launch keeps explicit exposure bounds');
  ok(/Do not automatically scale after launch/i.test(launch.task), 'launch cannot silently escalate into scaling');
}

report('moe validated opportunity launch recipe');