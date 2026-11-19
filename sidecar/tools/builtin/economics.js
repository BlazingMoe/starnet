/* sidecar/tools/builtin/economics.js — exact arithmetic for supplied planning scenarios and actual-evidence imports.
   This computes arithmetic over the caller's inputs without file I/O. It does not establish that inputs are complete,
   true, paid, tax-compliant, or representative of future results. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SK = root.SK || {}; root.SK.tools = root.SK.tools || {}; (root.SK.tools.builtin = root.SK.tools.builtin || {}).economics = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CURRENCIES = new Set(['EUR', 'USD', 'GBP']);
  const STATUSES = new Set(['assumption', 'estimate']);
  const MAX_COMPONENTS = 40;
  const MAX_TIME_MINUTES = 1_000_000;
  const MAX_SOURCE = 200;
  const MAX_LABEL = 80;
  const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const SHA256 = /^[a-f0-9]{64}$/;
  const MAX_IMPORTS = 20;
  const MAX_TRANSACTIONS = 1000;
  const MAX_TIME_ENTRIES = 500;
  const TRANSACTION_KINDS = new Set([
    'sale_receipt', 'refund', 'platform_fee', 'payment_fee', 'generation_cost',
    'render_cost', 'fulfilment_cost', 'acquisition_cost', 'reprint_cost',
    'tax_withheld', 'reserve_hold', 'reserve_release', 'payout'
  ]);
  const TRANSACTION_STATUSES = new Set(['settled', 'pending', 'reversed']);
  const TIME_CATEGORIES = new Set(['sales', 'production', 'support', 'revision']);

  function dateValid(value) {
    if (typeof value !== 'string') return false;
    const m = ISO_DATE.exec(value);
    if (!m) return false;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const parsed = new Date(0);
    parsed.setUTCHours(0, 0, 0, 0);
    parsed.setUTCFullYear(y, mo - 1, d);
    return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === mo - 1 && parsed.getUTCDate() === d;
  }
  function boundedText(value, max, field, required) {
    if (typeof value !== 'string') throw new Error(field + ' must be text');
    const s = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if ((required && !s) || s.length > max) throw new Error(field + ' must be ' + (required ? 'non-empty and ' : '') + 'at most ' + max + ' characters');
    return s;
  }
  function boundedId(value, field, nullable) {
    if (nullable && value === null) return null;
    const id = boundedText(value, 80, field, true);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(id)) throw new Error(field + ' must be a bounded stable identifier');
    return id;
  }
  function utcTimestamp(value, field) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new Error(field + ' must be a canonical UTC timestamp');
    const parsed = new Date(0);
    parsed.setTime(Date.parse(value));
    if (!Number.isFinite(parsed.getTime())) throw new Error(field + ' must be a canonical UTC timestamp');
    const expected = value.includes('.') ? parsed.toISOString() : parsed.toISOString().replace('.000Z', 'Z');
    if (expected !== value) throw new Error(field + ' must be a canonical UTC timestamp');
    return value;
  }
  function minorUnits(value, field) {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,17})$/.test(value)) throw new Error(field + ' must be a non-negative integer minor-unit string of at most 18 digits');
    return BigInt(value);
  }
  function component(row, currency, field) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(field + ' entries must be objects');
    const label = boundedText(row.label, MAX_LABEL, field + '.label', true);
    if (row.currency !== currency) throw new Error(field + '.currency must match scenario currency ' + currency);
    if (!STATUSES.has(row.status)) throw new Error(field + '.status must be assumption or estimate; actual cashflow is not accepted');
    if (!dateValid(row.asOf)) throw new Error(field + '.asOf must be a valid YYYY-MM-DD calendar date');
    const source = boundedText(row.source, MAX_SOURCE, field + '.source', true);
    const amount = row.amountMinor === null ? null : minorUnits(row.amountMinor, field + '.amountMinor');
    return { label, amountMinor: amount === null ? null : amount.toString(), currency, status: row.status, asOf: row.asOf, source };
  }
  function category(rows, currency, field) {
    if (rows === null) return null;
    if (!Array.isArray(rows)) throw new Error(field + ' must be an array (known entries) or null (unknown category)');
    if (rows.length > MAX_COMPONENTS) throw new Error(field + ' exceeds ' + MAX_COMPONENTS + ' entries');
    return rows.map((r, i) => component(r, currency, field + '[' + i + ']'));
  }
  function sumKnown(rows) {
    if (rows === null || rows.some(row => row.amountMinor === null)) return null;
    return rows.reduce((n, row) => n + BigInt(row.amountMinor), 0n);
  }
  function liquidityScenario(value, currency, scenarioStatus) {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('liquidity must be an object');
    const startDate = value.startDate, endDate = value.endDate;
    if (!dateValid(startDate) || !dateValid(endDate) || startDate > endDate) throw new Error('liquidity horizon must have valid startDate and endDate with startDate no later than endDate');
    const initialCash = component(value.initialCash, currency, 'liquidity.initialCash');
    const minimumReserve = component(value.minimumReserve, currency, 'liquidity.minimumReserve');
    if (value.events !== null && !Array.isArray(value.events)) throw new Error('liquidity.events must be an array or null (unknown event list)');
    if (Array.isArray(value.events) && value.events.length > MAX_COMPONENTS) throw new Error('liquidity.events exceeds ' + MAX_COMPONENTS + ' entries');
    const ids = new Set();
    const events = value.events === null ? null : value.events.map((row, i) => {
      const field = 'liquidity.events[' + i + ']';
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(field + ' entries must be objects');
      const id = boundedText(row.id, 80, field + '.id', true);
      if (ids.has(id)) throw new Error('liquidity event IDs must be unique');
      ids.add(id);
      if (row.kind !== 'inflow' && row.kind !== 'outflow') throw new Error(field + '.kind must be inflow or outflow');
      const base = component(row, currency, field);
      if (row.date !== null && !dateValid(row.date)) throw new Error(field + '.date must be null (unknown) or a valid YYYY-MM-DD calendar date');
      if (row.date !== null && (row.date < startDate || row.date > endDate)) throw new Error(field + '.date must fall within the liquidity horizon');
      return { id, kind: row.kind, date: row.date, ...base };
    });
    const rows = [initialCash, minimumReserve, ...(events || [])];
    const status = rows.some(row => row.status === 'assumption') ? 'assumption' : 'estimate';
    const suppliedStatus = scenarioStatus === 'assumption' || status === 'assumption' ? 'assumption' : 'estimate';
    const known = events !== null && initialCash.amountMinor !== null && minimumReserve.amountMinor !== null && events.every(e => e.amountMinor !== null && e.date !== null);
    const caveat = 'Cash arithmetic covers only supplied assumptions within this explicit horizon; same-day outflows precede inflows. It is not verified actual cash, a complete ledger, spending authorization, profit, or a payout calculation.';
    if (!known) return { startDate, endDate, initialCash, minimumReserve, events, status: suppliedStatus, calculationStatus: 'unknown', availability: 'unavailable-unknown-amount-or-timing', timeline: null, openingBalanceMinor: null, closingBalanceMinor: null, minimumBalanceMinor: null, minimumBalanceDate: null, shortfallToReserveMinor: null, earliestShortfallDate: null, caveat };
    let balance = BigInt(initialCash.amountMinor), min = balance, minDate = startDate, opening = balance;
    let shortfall = balance < BigInt(minimumReserve.amountMinor) ? BigInt(minimumReserve.amountMinor) - balance : 0n;
    let earliestShortfallDate = shortfall > 0n ? startDate : null;
    const compareCodeUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    const sorted = events.slice().sort((a, b) => compareCodeUnits(a.date, b.date) || (a.kind === b.kind ? compareCodeUnits(a.id, b.id) : a.kind === 'outflow' ? -1 : 1));
    const timeline = [];
    for (const e of sorted) {
      const amount = BigInt(e.amountMinor);
      balance += e.kind === 'inflow' ? amount : -amount;
      if (balance < min) { min = balance; minDate = e.date; }
      if (balance < BigInt(minimumReserve.amountMinor)) {
        const deficit = BigInt(minimumReserve.amountMinor) - balance;
        if (deficit > shortfall) shortfall = deficit;
        if (earliestShortfallDate === null) earliestShortfallDate = e.date;
      }
      timeline.push({ date: e.date, eventId: e.id, kind: e.kind, amountMinor: e.amountMinor, balanceMinor: balance.toString() });
    }
    return { startDate, endDate, initialCash, minimumReserve, events, status: suppliedStatus, calculationStatus: suppliedStatus, availability: 'available', timeline,
      openingBalanceMinor: opening.toString(), closingBalanceMinor: balance.toString(), minimumBalanceMinor: min.toString(),
      minimumBalanceDate: minDate, shortfallToReserveMinor: shortfall.toString(), earliestShortfallDate, caveat };
  }
  function roundHalfAwayFromZero(numerator, denominator) {
    const negative = numerator < 0n;
    const abs = negative ? -numerator : numerator;
    let q = abs / denominator;
    if ((abs % denominator) * 2n >= denominator) q += 1n;
    return negative ? -q : q;
  }
  function majorDecimal(minor) {
    const negative = minor < 0n;
    const abs = negative ? -minor : minor;
    return (negative ? '-' : '') + (abs / 100n).toString() + '.' + (abs % 100n).toString().padStart(2, '0');
  }
  function signedContribution(row) {
    const amount = BigInt(row.amountMinor);
    if (row.kind === 'sale_receipt') return amount;
    if (['refund', 'platform_fee', 'payment_fee', 'generation_cost', 'render_cost', 'fulfilment_cost', 'acquisition_cost', 'reprint_cost'].includes(row.kind)) return -amount;
    return 0n;
  }
  function signedExpectedPayout(row) {
    const amount = BigInt(row.amountMinor);
    if (row.kind === 'sale_receipt' || row.kind === 'reserve_release') return amount;
    if (['refund', 'platform_fee', 'payment_fee', 'tax_withheld', 'reserve_hold'].includes(row.kind)) return -amount;
    return 0n;
  }
  function transactionRow(value, currency, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(field + ' must be an object');
    const transactionId = boundedId(value.transactionId, field + '.transactionId', false);
    const orderId = boundedId(value.orderId, field + '.orderId', true);
    const settlementId = boundedId(value.settlementId, field + '.settlementId', true);
    if (!TRANSACTION_KINDS.has(value.kind)) throw new Error(field + '.kind is unsupported');
    if (!TRANSACTION_STATUSES.has(value.status)) throw new Error(field + '.status must be settled, pending, or reversed');
    if (value.currency !== currency) throw new Error(field + '.currency must match reconciliation currency ' + currency);
    const amountMinor = minorUnits(value.amountMinor, field + '.amountMinor').toString();
    const occurredAt = utcTimestamp(value.occurredAt, field + '.occurredAt');
    const evidenceRef = boundedText(value.evidenceRef, MAX_SOURCE, field + '.evidenceRef', true);
    return { transactionId, orderId, settlementId, kind: value.kind, amountMinor, currency, occurredAt, status: value.status, evidenceRef };
  }
  function timeEntry(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(field + ' must be an object');
    const entryId = boundedId(value.entryId, field + '.entryId', false);
    const orderId = boundedId(value.orderId, field + '.orderId', true);
    if (!TIME_CATEGORIES.has(value.category)) throw new Error(field + '.category must be sales, production, support, or revision');
    if (!Number.isSafeInteger(value.minutes) || value.minutes < 0 || value.minutes > MAX_TIME_MINUTES) throw new Error(field + '.minutes must be an integer from 0 to ' + MAX_TIME_MINUTES);
    const occurredAt = utcTimestamp(value.occurredAt, field + '.occurredAt');
    const evidenceRef = boundedText(value.evidenceRef, MAX_SOURCE, field + '.evidenceRef', true);
    return { entryId, orderId, category: value.category, minutes: value.minutes, occurredAt, evidenceRef };
  }
  function addKindTotals(target, row) {
    const bucket = target[row.kind] || (target[row.kind] = 0n);
    target[row.kind] = bucket + BigInt(row.amountMinor);
  }
  function decimalAmount(minor, currency) { return { minor: minor.toString(), amount: majorDecimal(minor), currency }; }
  function reconcile(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('reconciliation must be an object');
    const reconciliationId = boundedId(input.reconciliationId, 'reconciliationId', false);
    const currency = boundedText(input.currency, 3, 'currency', true).toUpperCase();
    if (!CURRENCIES.has(currency)) throw new Error('currency must be EUR, USD, or GBP (each supported with two minor-unit digits)');
    if (!dateValid(input.asOf)) throw new Error('asOf must be a valid YYYY-MM-DD calendar date');
    if (!Array.isArray(input.imports) || input.imports.length < 1 || input.imports.length > MAX_IMPORTS) throw new Error('imports must contain 1 to ' + MAX_IMPORTS + ' source batches');
    if (input.timeEntries !== null && (!Array.isArray(input.timeEntries) || input.timeEntries.length > MAX_TIME_ENTRIES)) throw new Error('timeEntries must be null (unknown) or an array of at most ' + MAX_TIME_ENTRIES + ' entries');

    const seenImports = new Set(), claimedFiles = new Map(), seenTransactions = new Map();
    const accepted = [], duplicates = [], importSummaries = [];
    let totalRows = 0;
    for (let i = 0; i < input.imports.length; i++) {
      const raw = input.imports[i], field = 'imports[' + i + ']';
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(field + ' must be an object');
      const importId = boundedId(raw.importId, field + '.importId', false);
      if (seenImports.has(importId)) throw new Error('importId values must be unique');
      seenImports.add(importId);
      const sourceSystem = boundedId(raw.sourceSystem, field + '.sourceSystem', false);
      const accountScope = boundedId(raw.accountScope, field + '.accountScope', false);
      if (typeof raw.sourceSha256 !== 'string' || !SHA256.test(raw.sourceSha256)) throw new Error(field + '.sourceSha256 must be lowercase SHA-256');
      const sourceReceipt = boundedText(raw.sourceReceipt, MAX_SOURCE, field + '.sourceReceipt', true);
      const importedAt = utcTimestamp(raw.importedAt, field + '.importedAt');
      if (!Array.isArray(raw.transactions)) throw new Error(field + '.transactions must be an array');
      totalRows += raw.transactions.length;
      if (totalRows > MAX_TRANSACTIONS) throw new Error('transaction rows exceed ' + MAX_TRANSACTIONS);
      const rows = raw.transactions.map((row, j) => transactionRow(row, currency, field + '.transactions[' + j + ']'));
      const fileKey = sourceSystem + '\u0000' + accountScope + '\u0000' + raw.sourceSha256;
      const fileClaim = JSON.stringify(rows);
      if (claimedFiles.has(fileKey) && claimedFiles.get(fileKey) !== fileClaim) throw new Error('the same claimed source hash has conflicting normalized transactions');
      claimedFiles.set(fileKey, fileClaim);
      let acceptedCount = 0, duplicateCount = 0;
      for (const row of rows) {
        const key = sourceSystem + '\u0000' + accountScope + '\u0000' + row.transactionId;
        const canonical = JSON.stringify(row);
        if (seenTransactions.has(key)) {
          const prior = seenTransactions.get(key);
          if (prior.canonical !== canonical) throw new Error('conflicting duplicate transaction ' + row.transactionId + ' for ' + sourceSystem + '/' + accountScope);
          duplicates.push({ importId, transactionId: row.transactionId, duplicateOfImportId: prior.importId, dedupeKey: sourceSystem + '/' + accountScope + '/' + row.transactionId });
          duplicateCount++;
          continue;
        }
        seenTransactions.set(key, { canonical, importId });
        accepted.push({ importId, sourceSystem, accountScope, sourceSha256: raw.sourceSha256, ...row });
        acceptedCount++;
      }
      importSummaries.push({ importId, sourceSystem, accountScope, sourceSha256: raw.sourceSha256, sourceReceipt, importedAt, rowCount: rows.length, acceptedCount, duplicateCount });
    }

    const settledKinds = {}, pendingKinds = {}, reversedKinds = {};
    let settledContribution = 0n, pendingContribution = 0n;
    const settlementGroups = new Map(), unassignedSettlementRows = [];
    for (const row of accepted) {
      const target = row.status === 'settled' ? settledKinds : row.status === 'pending' ? pendingKinds : reversedKinds;
      addKindTotals(target, row);
      if (row.status === 'settled') settledContribution += signedContribution(row);
      if (row.status === 'pending') pendingContribution += signedContribution(row);
      const affectsSettlement = row.kind === 'payout' || signedExpectedPayout(row) !== 0n;
      if (!affectsSettlement || row.status === 'reversed') continue;
      if (row.settlementId === null) { unassignedSettlementRows.push({ importId: row.importId, transactionId: row.transactionId, kind: row.kind, status: row.status }); continue; }
      const group = settlementGroups.get(row.settlementId) || { settlementId: row.settlementId, expected: 0n, observed: 0n, expectedRows: 0, payoutRows: 0, pendingRows: 0 };
      if (row.status === 'pending') group.pendingRows++;
      else if (row.kind === 'payout') { group.observed += BigInt(row.amountMinor); group.payoutRows++; }
      else { group.expected += signedExpectedPayout(row); group.expectedRows++; }
      settlementGroups.set(row.settlementId, group);
    }
    const payoutReconciliation = Array.from(settlementGroups.values()).sort((a, b) => a.settlementId < b.settlementId ? -1 : a.settlementId > b.settlementId ? 1 : 0).map(group => {
      const difference = group.observed - group.expected;
      const status = group.pendingRows ? 'pending-components'
        : group.expectedRows === 0 ? 'unattributed-payout'
        : group.payoutRows === 0 ? 'missing-payout'
        : difference === 0n ? 'matched' : 'mismatch';
      return { settlementId: group.settlementId, status, expectedPayout: decimalAmount(group.expected, currency), observedPayout: decimalAmount(group.observed, currency), difference: decimalAmount(difference, currency), expectedRowCount: group.expectedRows, payoutRowCount: group.payoutRows, pendingRowCount: group.pendingRows };
    });

    const normalizedTime = [], duplicateTimeEntries = [], seenTime = new Map();
    if (Array.isArray(input.timeEntries)) {
      for (let i = 0; i < input.timeEntries.length; i++) {
        const row = timeEntry(input.timeEntries[i], 'timeEntries[' + i + ']');
        const canonical = JSON.stringify(row);
        if (seenTime.has(row.entryId)) {
          if (seenTime.get(row.entryId) !== canonical) throw new Error('conflicting duplicate time entry ' + row.entryId);
          duplicateTimeEntries.push({ entryId: row.entryId });
        } else { seenTime.set(row.entryId, canonical); normalizedTime.push(row); }
      }
    }
    const totalMinutes = input.timeEntries === null ? null : normalizedTime.reduce((sum, row) => sum + row.minutes, 0);
    const hourly = totalMinutes && totalMinutes > 0 ? roundHalfAwayFromZero(settledContribution * 60n, BigInt(totalMinutes)) : null;
    const formatKinds = value => Object.fromEntries(Object.keys(value).sort().map(kind => [kind, decimalAmount(value[kind], currency)]));
    return {
      reconciliationId, currency, asOf: input.asOf,
      evidenceStatus: 'operator-supplied-unverified',
      importSummaries, acceptedTransactions: accepted, duplicateTransactions: duplicates,
      transactionCounts: { supplied: totalRows, accepted: accepted.length, exactDuplicatesExcluded: duplicates.length, reversedExcludedFromContribution: accepted.filter(row => row.status === 'reversed').length },
      categoryTotals: { settled: formatKinds(settledKinds), pending: formatKinds(pendingKinds), reversed: formatKinds(reversedKinds) },
      settledContribution: decimalAmount(settledContribution, currency),
      pendingContribution: decimalAmount(pendingContribution, currency),
      timeEntries: input.timeEntries === null ? null : normalizedTime,
      duplicateTimeEntries,
      totalTimeMinutes: totalMinutes,
      effectiveHourlyContribution: hourly === null ? null : { ...decimalAmount(hourly, currency), rounding: 'nearest minor unit, ties away from zero' },
      effectiveHourlyAvailability: totalMinutes === null ? 'unavailable-unknown-time' : totalMinutes === 0 ? 'unavailable-zero-time' : 'available',
      payoutReconciliation, unassignedSettlementRows,
      coverage: 'supplied-rows-only-not-proof-of-ledger-completeness',
      sourceHandling: 'Source hashes and receipts are operator claims; source files are not read, changed, or verified by this pure calculator.',
      resultSemantics: 'Exact arithmetic over normalized operator-supplied transaction and time evidence. Exact duplicates are excluded; conflicts fail closed. This is not bank/platform verification, tax profit, payment authority, or proof that all transactions and costs were supplied.'
    };
  }
  function calculate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('scenario must be an object');
    const scenarioId = boundedText(input.scenarioId, 80, 'scenarioId', true);
    const currency = boundedText(input.currency, 3, 'currency', true).toUpperCase();
    if (!CURRENCIES.has(currency)) throw new Error('currency must be EUR, USD, or GBP (each supported with two minor-unit digits)');
    if (!dateValid(input.asOf)) throw new Error('asOf must be a valid YYYY-MM-DD calendar date');
    if (!STATUSES.has(input.status)) throw new Error('status must be assumption or estimate; actual cashflow is not accepted');
    const source = boundedText(input.source, MAX_SOURCE, 'source', true);
    const revenue = input.grossRevenue === null ? null : component(input.grossRevenue, currency, 'grossRevenue');
    const fees = category(input.fees, currency, 'fees');
    const costs = category(input.costs, currency, 'costs');
    const refunds = category(input.refunds, currency, 'refunds');
    const liquidity = liquidityScenario(input.liquidity, currency, input.status);
    const time = input.timeMinutes;
    if (time !== null && (!Number.isSafeInteger(time) || time < 0 || time > MAX_TIME_MINUTES)) throw new Error('timeMinutes must be null (unknown) or an integer from 0 to ' + MAX_TIME_MINUTES);
    const gross = revenue === null || revenue.amountMinor === null ? null : BigInt(revenue.amountMinor);
    const feeTotal = sumKnown(fees), costTotal = sumKnown(costs), refundTotal = sumKnown(refunds);
    const complete = gross !== null && feeTotal !== null && costTotal !== null && refundTotal !== null;
    const net = complete ? gross - feeTotal - costTotal - refundTotal : null;
    const suppliedRows = [revenue, ...(fees || []), ...(costs || []), ...(refunds || [])].filter(Boolean);
    const calculationStatus = !complete ? 'unknown'
      : input.status === 'assumption' || suppliedRows.some(row => row.status === 'assumption') ? 'assumption' : 'estimate';
    const hourlyMinor = net !== null && time !== null && time > 0
      ? roundHalfAwayFromZero(net * 60n, BigInt(time)) : null;
    return {
      scenarioId, currency, asOf: input.asOf, status: input.status, source,
      calculationStatus,
      grossRevenue: revenue, fees, costs, refunds,
      timeMinutes: time,
      categoryTotals: {
        grossRevenue: gross === null ? null : { minor: gross.toString(), amount: majorDecimal(gross), currency },
        fees: feeTotal === null ? null : { minor: feeTotal.toString(), amount: majorDecimal(feeTotal), currency },
        costs: costTotal === null ? null : { minor: costTotal.toString(), amount: majorDecimal(costTotal), currency },
        refunds: refundTotal === null ? null : { minor: refundTotal.toString(), amount: majorDecimal(refundTotal), currency }
      },
      completeness: complete ? 'all-required-input-categories-supplied' : 'unavailable-required-inputs-unknown',
      omittedCostCaveat: 'Arithmetic covers only the supplied inputs; it cannot prove that all costs, fees, refunds, or revenue were supplied.',
      netContributionMinor: net === null ? null : net.toString(),
      netContributionAmount: net === null ? null : { value: majorDecimal(net), currency },
      effectiveHourlyAmount: hourlyMinor === null ? null : {
        value: majorDecimal(hourlyMinor), currency,
        rounding: 'nearest minor unit, ties away from zero'
      },
      effectiveHourlyAvailability: net === null ? 'unavailable-unknown-inputs' : time === null ? 'unavailable-unknown-time' : time === 0 ? 'unavailable-zero-time' : 'available',
      ...(liquidity === undefined ? {} : { liquidity }),
      resultSemantics: 'Exact arithmetic over supplied operator assumptions or estimates; not verified transactions, tax profit, or a forecast.'
    };
  }

  const componentSchema = { type: 'object', required: ['label', 'amountMinor', 'currency', 'status', 'asOf', 'source'], properties: {
    label: { type: 'string' }, amountMinor: { type: ['string', 'null'] }, currency: { type: 'string' },
    status: { type: 'string', enum: ['assumption', 'estimate'] }, asOf: { type: 'string' }, source: { type: 'string' }
  }, additionalProperties: false };
  const economicsTool = {
    name: 'economics.calculate', capability: 'cabinet', scope: 'read', requiresConsent: false, timeoutMs: 5000,
    description: 'Calculate exact single-scenario arithmetic over operator-supplied offer assumptions or estimates. Use decimal integer minor-unit strings and the same EUR/USD/GBP currency on every component. Null means unknown; an empty fees/costs/refunds list means the operator explicitly supplied no entries. Optional liquidity is a separate bounded cash-timing view with a sourced opening balance, reserve, explicit horizon and up to 40 identified dated inflows/outflows; null event lists, dates or amounts keep it unavailable. Same-day outflows precede inflows. It covers only supplied assumptions within the horizon and is not a complete ledger, verified actual cash, spending authorization, profit or payout calculation. Actual transaction status is not accepted. The result cannot prove completeness, paid status, tax profit, or future outcomes.',
    schema: { type: 'object', required: ['scenarioId', 'currency', 'asOf', 'status', 'source', 'grossRevenue', 'fees', 'costs', 'refunds', 'timeMinutes'], properties: {
      scenarioId: { type: 'string' }, currency: { type: 'string', enum: ['EUR', 'USD', 'GBP'] }, asOf: { type: 'string' },
      status: { type: 'string', enum: ['assumption', 'estimate'] }, source: { type: 'string' },
      grossRevenue: { type: ['object', 'null'], required: componentSchema.required, properties: componentSchema.properties, additionalProperties: false },
      fees: { type: ['array', 'null'], items: componentSchema }, costs: { type: ['array', 'null'], items: componentSchema }, refunds: { type: ['array', 'null'], items: componentSchema },
      timeMinutes: { type: ['integer', 'null'] },
      liquidity: { type: 'object', required: ['startDate', 'endDate', 'initialCash', 'minimumReserve', 'events'], properties: {
        startDate: { type: 'string' }, endDate: { type: 'string' }, initialCash: componentSchema, minimumReserve: componentSchema,
        events: { type: ['array', 'null'], maxItems: 40, items: { type: 'object', required: ['id', 'kind', 'date', ...componentSchema.required], properties: {
          id: { type: 'string' }, kind: { type: 'string', enum: ['inflow', 'outflow'] }, date: { type: ['string', 'null'] }, ...componentSchema.properties
        }, additionalProperties: false } }
      }, additionalProperties: false }
    }, additionalProperties: false },
    run: async args => ({ content: JSON.stringify(calculate(args)), summary: 'Offer economics calculated from supplied inputs' })
  };
  const transactionSchema = { type: 'object', required: ['transactionId', 'orderId', 'settlementId', 'kind', 'amountMinor', 'currency', 'occurredAt', 'status', 'evidenceRef'], properties: {
    transactionId: { type: 'string' }, orderId: { type: ['string', 'null'] }, settlementId: { type: ['string', 'null'] },
    kind: { type: 'string', enum: Array.from(TRANSACTION_KINDS) }, amountMinor: { type: 'string' }, currency: { type: 'string', enum: ['EUR', 'USD', 'GBP'] },
    occurredAt: { type: 'string' }, status: { type: 'string', enum: ['settled', 'pending', 'reversed'] }, evidenceRef: { type: 'string' }
  }, additionalProperties: false };
  const reconcileTool = {
    name: 'economics.reconcile', capability: 'cabinet', scope: 'read', requiresConsent: false, timeoutMs: 5000,
    description: 'Normalize and reconcile bounded operator-supplied transaction export batches without reading or changing source files. Every batch needs a stable source/account scope, lowercase SHA-256 claim, receipt and UTC import time. Rows use unique provider transaction IDs, explicit settled/pending/reversed status, non-negative integer minor units and one EUR/USD/GBP currency. Repeated exact rows are excluded; conflicting transaction IDs or conflicting rows under the same claimed source hash fail closed. Contribution, time evidence and payout settlement are separate. Hashes and receipts remain unverified operator evidence; results do not prove ledger completeness, payment, tax profit, platform state, or spending authority.',
    schema: { type: 'object', required: ['reconciliationId', 'currency', 'asOf', 'imports', 'timeEntries'], properties: {
      reconciliationId: { type: 'string' }, currency: { type: 'string', enum: ['EUR', 'USD', 'GBP'] }, asOf: { type: 'string' },
      imports: { type: 'array', minItems: 1, maxItems: MAX_IMPORTS, items: { type: 'object', required: ['importId', 'sourceSystem', 'accountScope', 'sourceSha256', 'sourceReceipt', 'importedAt', 'transactions'], properties: {
        importId: { type: 'string' }, sourceSystem: { type: 'string' }, accountScope: { type: 'string' }, sourceSha256: { type: 'string' }, sourceReceipt: { type: 'string' }, importedAt: { type: 'string' },
        transactions: { type: 'array', items: transactionSchema }
      }, additionalProperties: false } },
      timeEntries: { type: ['array', 'null'], maxItems: MAX_TIME_ENTRIES, items: { type: 'object', required: ['entryId', 'orderId', 'category', 'minutes', 'occurredAt', 'evidenceRef'], properties: {
        entryId: { type: 'string' }, orderId: { type: ['string', 'null'] }, category: { type: 'string', enum: ['sales', 'production', 'support', 'revision'] }, minutes: { type: 'integer' }, occurredAt: { type: 'string' }, evidenceRef: { type: 'string' }
      }, additionalProperties: false } }
    }, additionalProperties: false },
    run: async args => ({ content: JSON.stringify(reconcile(args)), summary: 'Supplied transaction batches reconciled without source-file mutation' })
  };
  function makeEconomicsTools() { return { economicsTool, reconcileTool, register(reg) { reg.register(economicsTool); reg.register(reconcileTool); return reg; } }; }
  return { makeEconomicsTools, calculate, reconcile, CURRENCIES, STATUSES, TRANSACTION_KINDS, _internals: { dateValid, utcTimestamp, minorUnits, roundHalfAwayFromZero, majorDecimal } };
});
