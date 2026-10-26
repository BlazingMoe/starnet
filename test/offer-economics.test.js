/* node test/offer-economics.test.js — bounded exact offer-scenario arithmetic and cabinet dispatch. */
'use strict';
const A = require('./_assert.js');
const Economics = require('../sidecar/tools/builtin/economics.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { resolveTools } = require('../sidecar/capability/resolve.js');

const entry = (label, amountMinor, overrides = {}) => ({ label, amountMinor, currency: 'EUR', status: 'estimate', asOf: '2026-10-26', source: 'operator fixture', ...overrides });
const scenario = overrides => ({
  scenarioId: 'pilot-1', currency: 'EUR', asOf: '2026-10-26', status: 'estimate', source: 'operator fixture',
  grossRevenue: entry('gross revenue', '10000'), fees: [entry('platform fee', '1000')],
  costs: [entry('materials', '2000')], refunds: [entry('refunds', '500')], timeMinutes: 120,
  ...overrides
});
const scenarioCurrency = currency => {
  const s = scenario({ currency });
  s.grossRevenue.currency = currency;
  for (const group of [s.fees, s.costs, s.refunds]) for (const row of group) row.currency = currency;
  return s;
};
const scenarioDate = asOf => {
  const s = scenario({ asOf });
  s.grossRevenue.asOf = asOf;
  for (const group of [s.fees, s.costs, s.refunds]) for (const row of group) row.asOf = asOf;
  return s;
};
const throws = (fn, re, label) => { let err; try { fn(); } catch (e) { err = e; } A.ok(err && re.test(err.message), label + (err ? ' (' + err.message + ')' : ' (did not throw)')); };

(async () => {
  const good = Economics.calculate(scenario({}));
  A.eq(good.netContributionMinor, '6500', 'net contribution is exact minor units');
  A.eq(good.netContributionAmount, { value: '65.00', currency: 'EUR' }, 'net contribution has deterministic major-unit display');
  A.eq(good.effectiveHourlyAmount, { value: '32.50', currency: 'EUR', rounding: 'nearest minor unit, ties away from zero' }, 'effective hourly amount is exact and documents rounding');
  A.eq(good.completeness, 'all-required-input-categories-supplied', 'supplied category completeness is stated');
  A.ok(/cannot prove that all costs/.test(good.omittedCostCaveat), 'known inputs do not imply a complete ledger');
  A.eq(good.status, 'estimate', 'scenario status remains estimate');
  A.eq(good.calculationStatus, 'estimate', 'result status remains an estimate when all complete inputs are estimates');
  A.eq(good.grossRevenue.amountMinor, '10000', 'input is preserved in normalized ledger');
  A.eq(Economics.calculate(scenarioCurrency('USD')).currency, 'USD', 'supported USD scenario calculates');
  A.eq(Economics.calculate(scenarioCurrency('GBP')).currency, 'GBP', 'supported GBP scenario calculates');
  A.eq(Economics.calculate(scenarioDate('2028-02-29')).asOf, '2028-02-29', 'valid leap date is accepted');

  const unknownCost = Economics.calculate(scenario({ costs: null }));
  A.eq(unknownCost.netContributionMinor, null, 'unknown cost category makes net unavailable');
  A.eq(unknownCost.effectiveHourlyAmount, null, 'unknown net makes hourly amount unavailable');
  A.eq(unknownCost.completeness, 'unavailable-required-inputs-unknown', 'unknown input disclosure is explicit');
  A.eq(Economics.calculate(scenario({ grossRevenue: null })).netContributionMinor, null, 'unknown gross revenue makes net unavailable');
  A.eq(Economics.calculate(scenario({ refunds: null })).netContributionMinor, null, 'unknown refunds make net unavailable');
  const unknownComponent = Economics.calculate(scenario({ fees: [entry('fee', null)] }));
  A.eq(unknownComponent.netContributionMinor, null, 'unknown fee component makes net unavailable');
  A.eq(Economics.calculate(scenario({ fees: [] })).netContributionMinor, '7500', 'empty array means operator explicitly supplied no fee entries');
  const missingFees = scenario({}); delete missingFees.fees;
  throws(() => Economics.calculate(missingFees), /fees must be an array/, 'omitted fee category is rejected instead of treated as empty');
  A.eq(Economics.calculate(scenario({ refunds: [entry('explicit zero', '0', { status: 'assumption' })] })).calculationStatus, 'assumption', 'a component assumption keeps derived metrics labeled as assumptions');
  const zeroTime = Economics.calculate(scenario({ timeMinutes: 0 }));
  A.eq(zeroTime.effectiveHourlyAmount, null, 'zero time has no hourly division');
  A.eq(zeroTime.effectiveHourlyAvailability, 'unavailable-zero-time', 'zero-time unavailability reason is stated');
  A.eq(Economics.calculate(scenario({ timeMinutes: null })).effectiveHourlyAvailability, 'unavailable-unknown-time', 'unknown time is distinct from zero');

  const negative = Economics.calculate(scenario({ grossRevenue: entry('gross', '0'), fees: [entry('fee', '1')], costs: [], refunds: [], timeMinutes: 120 }));
  A.eq(negative.netContributionMinor, '-1', 'negative contribution is retained, not clamped');
  A.eq(negative.effectiveHourlyAmount.value, '-0.01', 'negative half-minor hourly tie rounds away from zero');
  const positiveTie = Economics.calculate(scenario({ grossRevenue: entry('gross', '1'), fees: [], costs: [], refunds: [], timeMinutes: 120 }));
  A.eq(positiveTie.effectiveHourlyAmount.value, '0.01', 'positive half-minor hourly tie rounds away from zero');
  const huge = Economics.calculate(scenario({ grossRevenue: entry('gross', '999999999999999999'), fees: [entry('fee A', '999999999999999999'), entry('fee B', '999999999999999999')], costs: [], refunds: [] }));
  A.eq(huge.categoryTotals.fees.minor, '1999999999999999998', 'multi-component total preserves exact value beyond Number.MAX_SAFE_INTEGER');
  A.eq(huge.netContributionMinor, '-999999999999999999', 'large net remains exact beyond Number.MAX_SAFE_INTEGER');

  throws(() => Economics.calculate(scenario({ currency: 'CAD' })), /EUR, USD, or GBP/, 'unsupported currency is rejected');
  throws(() => Economics.calculate(scenario({ costs: [entry('mixed', '20', { currency: 'USD' })] })), /must match scenario currency/, 'mixed component currency is rejected');
  throws(() => Economics.calculate(scenario({ asOf: '2026-02-29' })), /valid YYYY-MM-DD/, 'invalid calendar date is rejected');
  throws(() => Economics.calculate(scenario({ status: 'actual' })), /assumption or estimate/, 'actual status is rejected');
  throws(() => Economics.calculate(scenario({ grossRevenue: entry('gross', '1', { status: 'actual' }) })), /actual cashflow is not accepted/, 'component actual status is rejected');
  throws(() => Economics.calculate(scenario({ fees: [entry('negative', '-1')] })), /non-negative integer/, 'negative deductions are rejected');
  throws(() => Economics.calculate(scenario({ fees: [entry('decimal', '1.00')] })), /integer minor-unit/, 'decimal formatted money is rejected');
  throws(() => Economics.calculate(scenario({ fees: [entry('leading', '01')] })), /integer minor-unit/, 'ambiguous leading-zero money is rejected');
  throws(() => Economics.calculate(scenario({ grossRevenue: entry('negative gross', '-1') })), /non-negative integer/, 'negative gross revenue is rejected');
  throws(() => Economics.calculate(scenario({ grossRevenue: entry('overflow', '1000000000000000000') })), /at most 18 digits/, 'money overflow is bounded');
  throws(() => Economics.calculate(scenario({ timeMinutes: -1 })), /timeMinutes/, 'negative time is rejected');
  throws(() => Economics.calculate(scenario({ timeMinutes: 1_000_001 })), /timeMinutes/, 'excessive time is bounded');
  throws(() => Economics.calculate(scenario({ source: 'x'.repeat(201) })), /at most 200 characters/, 'source provenance text is bounded');
  A.eq(Economics.calculate(scenario({ source: '  supplied\n  brief  ' })).source, 'supplied brief', 'source labels are normalized to bounded single-line text');
  throws(() => Economics.calculate(scenario({ fees: Array.from({ length: 41 }, (_, i) => entry('fee' + i, '1')) })), /exceeds 40/, 'component count is bounded');

  const registry = makeRegistry();
  Economics.makeEconomicsTools().register(registry);
  const call = { id: 'econ-1', name: 'economics.calculate', args: scenario({}), argsRaw: JSON.stringify(scenario({})), parseError: null };
  const denied = await registry.dispatch(call, { canUse: () => ({ ok: false, reason: 'cabinet absent' }) });
  A.eq(denied.isError, true, 'dispatcher capability denial occurs before calculation');
  const allowed = await registry.dispatch(call, { canUse: () => ({ ok: true }) });
  A.eq(allowed.ok, true, 'valid calculator invocation passes production dispatcher');
  A.eq(JSON.parse(allowed.content).netContributionMinor, '6500', 'dispatcher result returns exact tool calculation');
  const schemaDenied = await registry.dispatch({ ...call, args: scenario({ currency: 'CAD' }), argsRaw: JSON.stringify(scenario({ currency: 'CAD' })) }, { canUse: () => ({ ok: true }) });
  A.eq(schemaDenied.isError, true, 'schema gate rejects unsupported enum before calculator');

  const station = objects => ({ agents: { ag: { id: 'ag', room: 'r' } }, rooms: { r: { id: 'r', objects: objects.map(objectType => ({ objectType })) } } });
  const cabinetReach = resolveTools('ag', station(['computer', 'cabinet']));
  A.ok(cabinetReach.tools.includes('economics.calculate'), 'cabinet capability resolves calculator');
  A.eq(cabinetReach.approvalRules['economics.calculate'], { requiresConsent: false, scope: 'read', network: false }, 'tool metadata is pure local read with no consent or network');
  A.ok(!resolveTools('ag', station(['computer'])).tools.includes('economics.calculate'), 'calculator is unavailable without cabinet');
  A.ok(!resolveTools('ag', station(['computer', 'cabinet']), undefined, { disabledCaps: ['cabinet'] }).tools.includes('economics.calculate'), 'cabinet kill-switch removes calculator access');
  A.report('offer-economics');
})().catch(e => { console.error(e); process.exitCode = 1; });
