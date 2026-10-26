/* sidecar/tools/builtin/economics.js — exact arithmetic for one operator-supplied offer scenario.
   This computes arithmetic over the caller's inputs. It does not establish that the inputs are complete,
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
      resultSemantics: 'Exact arithmetic over supplied operator assumptions or estimates; not verified transactions, tax profit, or a forecast.'
    };
  }

  const componentSchema = { type: 'object', required: ['label', 'amountMinor', 'currency', 'status', 'asOf', 'source'], properties: {
    label: { type: 'string' }, amountMinor: { type: ['string', 'null'] }, currency: { type: 'string' },
    status: { type: 'string', enum: ['assumption', 'estimate'] }, asOf: { type: 'string' }, source: { type: 'string' }
  }, additionalProperties: false };
  const economicsTool = {
    name: 'economics.calculate', capability: 'cabinet', scope: 'read', requiresConsent: false, timeoutMs: 5000,
    description: 'Calculate exact single-scenario arithmetic over operator-supplied offer assumptions or estimates. Use decimal integer minor-unit strings and the same EUR/USD/GBP currency on every component. Null means unknown; an empty fees/costs/refunds list means the operator explicitly supplied no entries. Actual transaction status is not accepted. The result cannot prove completeness, paid status, tax profit, or future outcomes.',
    schema: { type: 'object', required: ['scenarioId', 'currency', 'asOf', 'status', 'source', 'grossRevenue', 'fees', 'costs', 'refunds', 'timeMinutes'], properties: {
      scenarioId: { type: 'string' }, currency: { type: 'string', enum: ['EUR', 'USD', 'GBP'] }, asOf: { type: 'string' },
      status: { type: 'string', enum: ['assumption', 'estimate'] }, source: { type: 'string' },
      grossRevenue: { type: ['object', 'null'], required: componentSchema.required, properties: componentSchema.properties, additionalProperties: false },
      fees: { type: ['array', 'null'], items: componentSchema }, costs: { type: ['array', 'null'], items: componentSchema }, refunds: { type: ['array', 'null'], items: componentSchema },
      timeMinutes: { type: ['integer', 'null'] }
    }, additionalProperties: false },
    run: async args => ({ content: JSON.stringify(calculate(args)), summary: 'Offer economics calculated from supplied inputs' })
  };
  function makeEconomicsTools() { return { economicsTool, register(reg) { reg.register(economicsTool); return reg; } }; }
  return { makeEconomicsTools, calculate, CURRENCIES, STATUSES, _internals: { dateValid, minorUnits, roundHalfAwayFromZero, majorDecimal } };
});
