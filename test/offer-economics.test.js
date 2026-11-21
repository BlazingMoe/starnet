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
const tx = (transactionId, kind, amountMinor, overrides = {}) => ({
  transactionId, orderId: 'order-1', settlementId: 'settlement-1', kind, amountMinor,
  currency: 'EUR', occurredAt: '2026-11-19T10:00:00Z', status: 'settled', evidenceRef: 'operator export row ' + transactionId,
  ...overrides
});
const reconcileFixture = overrides => {
  const rows = [
    tx('sale-1', 'sale_receipt', '10000'), tx('platform-1', 'platform_fee', '1000'),
    tx('payment-1', 'payment_fee', '300'), tx('tax-1', 'tax_withheld', '500'),
    tx('cost-1', 'fulfilment_cost', '2500', { settlementId: null }),
    tx('payout-1', 'payout', '8200'),
    tx('refund-pending', 'refund', '1000', { settlementId: 'settlement-2', status: 'pending' }),
    tx('reversed-sale', 'sale_receipt', '999', { settlementId: null, status: 'reversed' })
  ];
  const source = { importId: 'import-a', sourceSystem: 'marketplace', accountScope: 'shop-a', sourceSha256: 'a'.repeat(64), sourceReceipt: 'operator-selected export A', importedAt: '2026-11-19T12:00:00Z', transactions: rows };
  return {
    reconciliationId: 'reconcile-1', currency: 'EUR', asOf: '2026-11-19',
    imports: [source, { ...source, importId: 'import-b' }],
    timeEntries: [
      { entryId: 'time-sales', orderId: 'order-1', category: 'sales', minutes: 60, occurredAt: '2026-11-19T09:00:00Z', evidenceRef: 'operator timer A' },
      { entryId: 'time-production', orderId: 'order-1', category: 'production', minutes: 30, occurredAt: '2026-11-19T09:30:00Z', evidenceRef: 'operator timer B' },
      { entryId: 'time-sales', orderId: 'order-1', category: 'sales', minutes: 60, occurredAt: '2026-11-19T09:00:00Z', evidenceRef: 'operator timer A' }
    ],
    ...overrides
  };
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

  const cash = (amount, label = 'cash') => entry(label, amount);
  const flow = (id, kind, date, amount, label = id) => ({ ...entry(label, amount), id, kind, date });
  const liquidity = overrides => ({ startDate: '2026-10-26', endDate: '2026-10-28', initialCash: cash('1000', 'opening cash'), minimumReserve: cash('200', 'reserve'), events: [], ...overrides });
  const cashResult = Economics.calculate(scenario({ liquidity: liquidity({ events: [flow('payout', 'inflow', '2026-10-27', '500'), flow('fulfilment', 'outflow', '2026-10-27', '900'), flow('refund', 'outflow', '2026-10-28', '200') ] }) }));
  A.eq(cashResult.liquidity.closingBalanceMinor, '400', 'liquidity arithmetic retains exact balances and treats refund as outflow');
  A.eq(cashResult.liquidity.timeline.map(x => x.eventId), ['fulfilment', 'payout', 'refund'], 'same-day outflows precede inflows and IDs break ties deterministically');
  A.eq(Economics.calculate(scenario({ liquidity: liquidity({ events: [flow('ä', 'outflow', '2026-10-27', '1'), flow('Z', 'outflow', '2026-10-27', '1'), flow('a', 'outflow', '2026-10-27', '1')] }) })).liquidity.timeline.map(x => x.eventId), ['Z', 'a', 'ä'], 'same-kind same-day events use locale-independent code-unit ID order');
  A.eq(cashResult.liquidity.minimumBalanceMinor, '100', 'minimum balance reflects intraday outflow ordering');
  A.eq(cashResult.liquidity.shortfallToReserveMinor, '100', 'reserve shortfall is exact');
  A.eq(cashResult.liquidity.earliestShortfallDate, '2026-10-27', 'earliest reserve shortfall date is reported');
  const largeCash = Economics.calculate(scenario({ liquidity: liquidity({ initialCash: cash('999999999999999999'), events: [flow('large', 'inflow', '2026-10-27', '999999999999999999')] }) }));
  A.eq(largeCash.liquidity.closingBalanceMinor, '1999999999999999998', 'cash sums remain exact beyond Number.MAX_SAFE_INTEGER');
  const zeroCash = Economics.calculate(scenario({ liquidity: liquidity({ initialCash: cash('0'), minimumReserve: cash('0') }) }));
  A.eq(zeroCash.liquidity.availability, 'available', 'explicit zero is a known amount');
  const unknownLiquidity = Economics.calculate(scenario({ liquidity: liquidity({ events: [flow('unknown-date', 'inflow', null, '1')] }) }));
  A.eq(unknownLiquidity.liquidity.availability, 'unavailable-unknown-amount-or-timing', 'unknown event timing makes liquidity unavailable');
  A.eq(unknownLiquidity.liquidity.timeline, null, 'unknown timing is never omitted or treated as zero');
  A.eq(Economics.calculate(scenario({ liquidity: liquidity({ events: [flow('unknown-amount', 'outflow', '2026-10-27', null)] }) })).liquidity.availability, 'unavailable-unknown-amount-or-timing', 'unknown event amount makes liquidity unavailable');
  A.eq(Economics.calculate(scenario({})).liquidity, undefined, 'liquidity remains optional for existing callers');
  throws(() => Economics.calculate(scenario({ liquidity: liquidity({ events: [flow('same', 'outflow', '2026-10-27', '1'), flow('same', 'inflow', '2026-10-27', '2')] }) })), /unique/, 'duplicate event IDs are rejected');
  throws(() => Economics.calculate(scenario({ liquidity: liquidity({ events: [flow('bad-date', 'inflow', '2026-02-29', '1')] }) })), /valid YYYY-MM-DD/, 'invalid liquidity event calendar date is rejected');
  throws(() => Economics.calculate(scenario({ liquidity: liquidity({ endDate: '2026-10-25' }) })), /horizon/, 'reversed liquidity horizon is rejected');
  throws(() => Economics.calculate(scenario({ liquidity: liquidity({ events: [flow('outside', 'inflow', '2026-10-29', '1')] }) })), /within the liquidity horizon/, 'out-of-horizon events are rejected');
  const mixedFlow = flow('mixed', 'outflow', '2026-10-27', '1'); mixedFlow.currency = 'USD';
  throws(() => Economics.calculate(scenario({ liquidity: liquidity({ events: [mixedFlow] }) })), /must match scenario currency/, 'mixed liquidity currencies are rejected');
  A.eq(Economics.calculate(scenario({ liquidity: liquidity({ events: null }) })).liquidity.availability, 'unavailable-unknown-amount-or-timing', 'unknown event list is distinct from an explicitly empty list');
  const unknownInitial = Economics.calculate(scenario({ liquidity: liquidity({ initialCash: cash(null, 'unknown opening') }) })).liquidity;
  A.eq(unknownInitial.calculationStatus, 'unknown', 'unknown opening cash has unknown calculation status');
  A.eq(unknownInitial.minimumBalanceDate, null, 'unavailable result has null minimum balance date');
  A.eq(Economics.calculate(scenario({ liquidity: liquidity({ minimumReserve: cash(null, 'unknown reserve') }) })).liquidity.calculationStatus, 'unknown', 'unknown reserve makes liquidity unavailable');
  A.eq(Economics.calculate(scenario({ status: 'assumption', liquidity: liquidity({}) })).liquidity.status, 'assumption', 'top-level assumption status is reflected in liquidity');
  const assumedEvent = flow('assumption', 'outflow', '2026-10-27', '1'); assumedEvent.status = 'assumption';
  A.eq(Economics.calculate(scenario({ liquidity: liquidity({ events: [assumedEvent] }) })).liquidity.status, 'assumption', 'event assumption status is reflected in liquidity');
  const openingShortfall = Economics.calculate(scenario({ liquidity: liquidity({ initialCash: cash('100'), minimumReserve: cash('200') }) })).liquidity;
  A.eq(openingShortfall.shortfallToReserveMinor, '100', 'opening reserve shortfall is included');
  A.eq(openingShortfall.earliestShortfallDate, '2026-10-26', 'opening reserve shortfall starts on horizon date');
  const negativeCash = Economics.calculate(scenario({ liquidity: liquidity({ initialCash: cash('1'), minimumReserve: cash('0'), events: [flow('overspend', 'outflow', '2026-10-27', '3')] }) })).liquidity;
  A.eq(negativeCash.closingBalanceMinor, '-2', 'negative balances are retained');
  const tooManyFlows = Array.from({ length: 41 }, (_, i) => flow('event-' + i, 'inflow', '2026-10-27', '1'));
  throws(() => Economics.calculate(scenario({ liquidity: liquidity({ events: tooManyFlows }) })), /exceeds 40/, 'liquidity event count is bounded');
  A.ok(/only supplied assumptions within this explicit horizon/.test(cashResult.liquidity.caveat) && /not verified actual cash/.test(cashResult.liquidity.caveat) && /spending authorization/.test(cashResult.liquidity.caveat), 'liquidity caveat states horizon and evidence limits');
  const assumedReserve = cash('200', 'reserve'); assumedReserve.status = 'assumption';
  A.eq(Economics.calculate(scenario({ liquidity: liquidity({ minimumReserve: assumedReserve }) })).liquidity.status, 'assumption', 'liquidity status reflects its supplied assumptions');
  throws(() => Economics.calculate(scenario({ liquidity: liquidity({ events: [{ ...flow('invalid-kind', 'outflow', '2026-10-27', '1'), kind: 'refund' }] }) })), /kind must be inflow or outflow/, 'invalid liquidity event types are rejected');

  A.eq(cashResult.liquidity.calculationStatus, 'estimate', 'available liquidity retains estimate status');
  throws(() => Economics.calculate(scenario({ liquidity: null })), /must be an object/, 'explicit null liquidity object is rejected');

  const actual = Economics.reconcile(reconcileFixture({}));
  A.eq(actual.evidenceStatus, 'operator-supplied-unverified', 'actual rows retain unverified evidence status');
  A.eq(actual.transactionCounts, { supplied: 16, accepted: 8, exactDuplicatesExcluded: 8, reversedExcludedFromContribution: 1 }, 'a repeated exact source export is deduplicated without losing its receipt');
  A.eq(actual.importSummaries.map(x => [x.importId, x.acceptedCount, x.duplicateCount]), [['import-a', 8, 0], ['import-b', 0, 8]], 'each import reports accepted and duplicate row counts');
  A.eq(actual.settledContribution, { minor: '6200', amount: '62.00', currency: 'EUR' }, 'settled contribution excludes payout, tax and reversed rows');
  A.eq(actual.pendingContribution.minor, '-1000', 'pending contribution is separate from settled contribution');
  A.eq(actual.categoryTotals.reversed.sale_receipt.minor, '999', 'reversed evidence remains visible but excluded from contribution');
  A.eq(actual.payoutReconciliation[0].status, 'matched', 'settled payout matches supplied receipt, fee, tax and payout rows');
  A.eq(actual.payoutReconciliation[0].expectedPayout.minor, '8200', 'expected payout arithmetic is exact');
  A.eq(actual.payoutReconciliation[0].difference.minor, '0', 'matched payout difference is zero');
  A.eq(actual.payoutReconciliation[1].status, 'pending-components', 'pending settlement components never become a missing-payout claim');
  A.eq(actual.totalTimeMinutes, 90, 'exact duplicate time rows are excluded');
  A.eq(actual.duplicateTimeEntries, [{ entryId: 'time-sales' }], 'time duplicate receipt is visible');
  A.eq(actual.effectiveHourlyContribution.amount, '41.33', 'actual hourly contribution uses settled rows and deduplicated supplied time');
  A.eq(actual.coverage, 'supplied-rows-only-not-proof-of-ledger-completeness', 'matched rows do not claim ledger completeness');
  A.ok(/not read, changed, or verified/.test(actual.sourceHandling), 'pure reconciliation states its source-file boundary');
  const crossScope = reconcileFixture({});
  crossScope.imports[1] = { ...crossScope.imports[1], accountScope: 'shop-b' };
  A.eq(Economics.reconcile(crossScope).transactionCounts, { supplied: 16, accepted: 16, exactDuplicatesExcluded: 0, reversedExcludedFromContribution: 2 }, 'identical IDs from a different account scope are not silently merged');
  const original = reconcileFixture({});
  const before = JSON.stringify(original);
  Economics.reconcile(original);
  A.eq(JSON.stringify(original), before, 'reconciliation does not mutate operator-supplied imports or time evidence');

  const noTime = Economics.reconcile(reconcileFixture({ timeEntries: null }));
  A.eq(noTime.totalTimeMinutes, null, 'unknown time remains distinct from zero');
  A.eq(noTime.effectiveHourlyAvailability, 'unavailable-unknown-time', 'unknown time blocks hourly arithmetic');
  const zeroTimeActual = Economics.reconcile(reconcileFixture({ timeEntries: [] }));
  A.eq(zeroTimeActual.effectiveHourlyAvailability, 'unavailable-zero-time', 'explicitly supplied zero time is labelled separately');
  const missingPayoutInput = reconcileFixture({});
  missingPayoutInput.imports = [missingPayoutInput.imports[0]];
  missingPayoutInput.imports[0].transactions = missingPayoutInput.imports[0].transactions.filter(row => row.kind !== 'payout');
  A.eq(Economics.reconcile(missingPayoutInput).payoutReconciliation[0].status, 'missing-payout', 'expected settlement without supplied payout is flagged');
  const payoutOnly = reconcileFixture({});
  payoutOnly.imports = [{ ...payoutOnly.imports[0], transactions: [tx('payout-only', 'payout', '10')] }];
  A.eq(Economics.reconcile(payoutOnly).payoutReconciliation[0].status, 'unattributed-payout', 'payout without supplied expected components is not called matched');
  const unassigned = reconcileFixture({});
  unassigned.imports = [{ ...unassigned.imports[0], transactions: [tx('sale-unassigned', 'sale_receipt', '10', { settlementId: null })] }];
  A.eq(unassigned.imports[0].transactions.length, 1, 'unassigned fixture is explicit');
  A.eq(Economics.reconcile(unassigned).unassignedSettlementRows[0].transactionId, 'sale-unassigned', 'settlement-affecting row without settlement ID remains unresolved');

  const conflictingTransaction = reconcileFixture({});
  conflictingTransaction.imports[1] = { ...conflictingTransaction.imports[1], sourceSha256: 'b'.repeat(64), transactions: conflictingTransaction.imports[1].transactions.map((row, i) => i === 0 ? { ...row, amountMinor: '10001' } : row) };
  throws(() => Economics.reconcile(conflictingTransaction), /conflicting duplicate transaction/, 'same scoped transaction ID with changed content fails closed');
  const conflictingHash = reconcileFixture({});
  conflictingHash.imports[1] = { ...conflictingHash.imports[1], transactions: conflictingHash.imports[1].transactions.slice(0, 1) };
  throws(() => Economics.reconcile(conflictingHash), /same claimed source hash has conflicting/, 'same claimed source hash cannot describe different rows');
  const conflictingTime = reconcileFixture({});
  conflictingTime.timeEntries[2] = { ...conflictingTime.timeEntries[2], minutes: 61 };
  throws(() => Economics.reconcile(conflictingTime), /conflicting duplicate time entry/, 'changed duplicate time row fails closed');
  throws(() => Economics.reconcile(reconcileFixture({ imports: [] })), /1 to 20/, 'empty import list is rejected');
  const badHash = reconcileFixture({}); badHash.imports[0] = { ...badHash.imports[0], sourceSha256: 'A'.repeat(64) };
  throws(() => Economics.reconcile(badHash), /lowercase SHA-256/, 'noncanonical source hash is rejected');
  const badUtc = reconcileFixture({}); badUtc.imports[0].transactions[0] = { ...badUtc.imports[0].transactions[0], occurredAt: '2026-11-19T11:00:00+01:00' };
  throws(() => Economics.reconcile(badUtc), /canonical UTC/, 'noncanonical transaction timestamp is rejected');
  const mixedActual = reconcileFixture({}); mixedActual.imports[0].transactions[0] = { ...mixedActual.imports[0].transactions[0], currency: 'USD' };
  throws(() => Economics.reconcile(mixedActual), /must match reconciliation currency/, 'mixed actual transaction currencies are rejected');
  const negativeActual = reconcileFixture({}); negativeActual.imports[0].transactions[0] = { ...negativeActual.imports[0].transactions[0], amountMinor: '-1' };
  throws(() => Economics.reconcile(negativeActual), /non-negative integer/, 'actual deductions use explicit kinds rather than negative money');

  const registry = makeRegistry();
  Economics.makeEconomicsTools().register(registry);
  const call = { id: 'econ-1', name: 'economics.calculate', args: scenario({}), argsRaw: JSON.stringify(scenario({})), parseError: null };
  const denied = await registry.dispatch(call, { canUse: () => ({ ok: false, reason: 'cabinet absent' }) });
  A.eq(denied.isError, true, 'dispatcher capability denial occurs before calculation');
  const allowed = await registry.dispatch(call, { canUse: () => ({ ok: true }) });
  A.eq(allowed.ok, true, 'valid calculator invocation passes production dispatcher');
  A.eq(JSON.parse(allowed.content).netContributionMinor, '6500', 'dispatcher result returns exact tool calculation');
  const liquidityCall = { ...call, args: scenario({ liquidity: liquidity({ events: [flow('dispatch', 'outflow', '2026-10-27', '1')] }) }), argsRaw: '' };
  const liquidDispatch = await registry.dispatch(liquidityCall, { canUse: () => ({ ok: true }) });
  A.eq(JSON.parse(liquidDispatch.content).liquidity.closingBalanceMinor, '999', 'production dispatcher exposes the optional liquidity result');
  const schemaDenied = await registry.dispatch({ ...call, args: scenario({ currency: 'CAD' }), argsRaw: JSON.stringify(scenario({ currency: 'CAD' })) }, { canUse: () => ({ ok: true }) });
  A.eq(schemaDenied.isError, true, 'schema gate rejects unsupported enum before calculator');
  const reconcileArgs = reconcileFixture({});
  const reconcileCall = { id: 'econ-reconcile-1', name: 'economics.reconcile', args: reconcileArgs, argsRaw: JSON.stringify(reconcileArgs), parseError: null };
  const reconciled = await registry.dispatch(reconcileCall, { canUse: () => ({ ok: true }) });
  A.eq(reconciled.ok, true, 'valid reconciliation passes the production dispatcher');
  A.eq(JSON.parse(reconciled.content).settledContribution.minor, '6200', 'dispatcher returns exact reconciled contribution');

  const station = objects => ({ agents: { ag: { id: 'ag', room: 'r' } }, rooms: { r: { id: 'r', objects: objects.map(objectType => ({ objectType })) } } });
  const cabinetReach = resolveTools('ag', station(['computer', 'cabinet']));
  A.ok(cabinetReach.tools.includes('economics.calculate'), 'cabinet capability resolves calculator');
  A.eq(cabinetReach.approvalRules['economics.calculate'], { requiresConsent: false, scope: 'read', network: false }, 'tool metadata is pure local read with no consent or network');
  A.ok(cabinetReach.tools.includes('economics.reconcile'), 'cabinet capability resolves reconciliation');
  A.eq(cabinetReach.approvalRules['economics.reconcile'], { requiresConsent: false, scope: 'read', network: false }, 'reconciliation metadata is pure local read with no consent or network');
  A.ok(!resolveTools('ag', station(['computer'])).tools.includes('economics.calculate'), 'calculator is unavailable without cabinet');
  A.ok(!resolveTools('ag', station(['computer'])).tools.includes('economics.reconcile'), 'reconciliation is unavailable without cabinet');
  A.ok(!resolveTools('ag', station(['computer', 'cabinet']), undefined, { disabledCaps: ['cabinet'] }).tools.includes('economics.calculate'), 'cabinet kill-switch removes calculator access');
  A.report('offer-economics');
})().catch(e => { console.error(e); process.exitCode = 1; });
