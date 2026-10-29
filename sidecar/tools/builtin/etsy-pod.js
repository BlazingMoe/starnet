'use strict';
// Pure operator-supplied POD preflight. No accounts, I/O, clock, or execution authority.
const str = (maxLength = 400) => ({ type: 'string', minLength: 1, maxLength });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const choice = (...values) => ({ type: 'string', enum: values });
const nullable = rule => ({ ...rule, type: [rule.type, 'null'] });
const integer = (maximum, minimum = 0) => ({ type: 'integer', minimum, maximum });
const money = nullable({ ...str(18), pattern: '^(0|[1-9][0-9]{0,17})$' });
const record = obj({ status: choice('assumption', 'observed', 'verified', 'unknown'), note: str(), receipt: nullable(str()), checkedAt: nullable(str(24)), sourceUrl: nullable(str(500)) });
const gates = ['sellerCreativeForce', 'individualHumanContribution', 'inputRights', 'outputRights', 'mockupPhotoRights', 'partnerDisclosed', 'shippingOriginConfirmed', 'accurateRepresentation', 'qualityControl', 'policyReviewed', 'feesReviewed', 'humanDraftApproval', 'humanRightsApproval', 'humanEconomicsApproval'];
const costs = ['listing', 'transaction', 'processing', 'ads', 'tax', 'production', 'shipping', 'refund', 'reprint', 'cancellation', 'other'];
const schema = obj({
  designId: str(48), version: str(48), asOf: str(24), freshnessDays: integer(90, 1),
  title: str(140), description: str(1200), humanContribution: str(800),
  itemKind: choice('original-pod', 'ready-made-resale', 'ai-prompt-bundle', 'ai-functional-instructions'),
  aiInvolvement: choice('none', 'assisted', 'unknown'), aiDisclosure: nullable(str(800)),
  product: obj({ type: str(100), variant: str(100), dimensions: str(100), mockupDescription: str(), shippingOrigin: nullable(str(200)) }),
  partner: obj({ name: nullable(str(100)), details: nullable(str()), disclosure: nullable(str()) }),
  review: obj(Object.fromEntries(gates.map(k => [k, obj({ decision: choice('approved', 'rejected', 'unknown'), evidence: record })]))),
  policySnapshot: record, feeSnapshot: record,
  currency: choice('EUR', 'USD', 'GBP'),
  unit: obj({ revenueMinor: money, costsMinor: obj(Object.fromEntries(costs.map(k => [k, money]))) }),
  assumptions: obj({ economics: record, refund: record, reprint: record, cancellation: record, duplicateOrder: record, payoutReserve: record }),
  orders: { type: 'array', minItems: 1, maxItems: 20, items: obj({ id: str(48), quantity: integer(100, 1) }) },
  cash: obj({ initialMinor: money, retainedFloorMinor: money, outflowDate: nullable(str(24)), payoutDate: nullable(str(24)), payoutMinor: money, evidence: record })
});
function validate(v, r, at = 'input') {
  const fail = () => { throw new Error('Invalid POD field: ' + at); };
  if (Array.isArray(r.type)) { if (v === null) return; r = { ...r, type: r.type[0] }; }
  if (r.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail();
    if (Object.keys(v).some(k => !Object.hasOwn(r.properties, k)) || r.required.some(k => !Object.hasOwn(v, k))) fail();
    for (const [k, s] of Object.entries(r.properties)) validate(v[k], s, at + '.' + k);
  } else if (r.type === 'array') {
    if (!Array.isArray(v) || v.length < r.minItems || v.length > r.maxItems) fail();
    for (let i = 0; i < v.length; i++) validate(v[i], r.items, at + '[' + i + ']');
  } else if (r.type === 'integer') {
    if (!Number.isSafeInteger(v) || v < r.minimum || v > r.maximum) fail();
  } else if (typeof v !== 'string' || !v.trim() || (r.maxLength && v.length > r.maxLength) || (r.enum && !r.enum.includes(v)) || (r.pattern && !new RegExp(r.pattern).test(v)) || /[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/u.test(v)) fail();
}
function time(v) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) throw new Error('Invalid canonical UTC timestamp');
  return Date.parse(v);
}
function url(v) {
  let u; try { u = new URL(v); } catch { throw new Error('Invalid source URL'); }
  if (!/^https:\/\//.test(v) || u.username || u.password || /[\s\\]/.test(v)) throw new Error('Invalid source URL');
}
const quote = v => '> ' + String(v).replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&');
const boundary = 'PRIVATE HUMAN REVIEW ONLY. Supplied evidence labels are operator assertions, not independent verification. No legal compliance, rights clearance, demand, profit, zero fixed costs, listing readiness or spending authorization is established. No account, network, publication, order, fulfilment or payment action occurs. File-byte verification is not source verification.';
function prepare(input) {
  validate(input, schema);
  const now = time(input.asOf), gaps = [];
  const id = v => { if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(v)) throw new Error('Invalid identifier'); };
  id(input.designId); id(input.version);
  const checkEvidence = (r, label, observed = false) => {
    if (r.sourceUrl !== null) url(r.sourceUrl);
    const t = r.checkedAt === null ? null : time(r.checkedAt);
    if (t !== null && t > now) throw new Error('Evidence cannot postdate asOf');
    if (r.status === 'unknown' || !r.receipt || !r.sourceUrl || t === null || now - t > input.freshnessDays * 86400000 || (observed && !['observed', 'verified'].includes(r.status))) gaps.push(label + ': missing, stale or insufficient evidence; recheck required');
  };
  checkEvidence(input.policySnapshot, 'policySnapshot', true); checkEvidence(input.feeSnapshot, 'feeSnapshot', true);
  for (const k of gates) { checkEvidence(input.review[k].evidence, k, true); if (input.review[k].decision !== 'approved') gaps.push(k + ': human approval unresolved'); }
  for (const [k, r] of Object.entries(input.assumptions)) checkEvidence(r, 'assumptions.' + k);
  checkEvidence(input.cash.evidence, 'cash.evidence');
  if (input.itemKind !== 'original-pod') gaps.push('Prohibited or unsupported item kind');
  if (input.aiInvolvement === 'unknown' || (input.aiInvolvement === 'assisted' && !input.aiDisclosure)) gaps.push('AI involvement/disclosure unresolved');
  if (!input.partner.name || !input.partner.details || !input.partner.disclosure || !input.product.shippingOrigin) gaps.push('Production partner disclosure or shipping origin unknown');
  const ids = new Set(); let quantity = 0;
  for (const o of input.orders) { id(o.id); if (ids.has(o.id)) throw new Error('Duplicate order ID'); ids.add(o.id); quantity += o.quantity; }
  const allKnown = input.unit.revenueMinor !== null && costs.every(k => input.unit.costsMinor[k] !== null);
  let unitContributionMinor = null, scenarioContributionMinor = null, outflowMinor = null;
  if (allKnown) {
    const total = costs.reduce((n, k) => n + BigInt(input.unit.costsMinor[k]), 0n);
    unitContributionMinor = (BigInt(input.unit.revenueMinor) - total).toString();
    scenarioContributionMinor = (BigInt(unitContributionMinor) * BigInt(quantity)).toString();
    // Conservative stress case: all supplied costs (including refunds and fees) precede payout.
    outflowMinor = (total * BigInt(quantity)).toString();
    if (BigInt(unitContributionMinor) <= 0n) gaps.push('Non-positive supplied contribution');
  } else gaps.push('Unit revenue or required cost category unknown');
  const c = input.cash;
  for (const d of [c.outflowDate, c.payoutDate]) if (d !== null && time(d) < now) throw new Error('Scenario cash date precedes asOf');
  const timeline = []; let shortfallMinor = null;
  if (outflowMinor !== null && c.initialMinor !== null && c.retainedFloorMinor !== null && c.outflowDate !== null && c.payoutDate !== null && c.payoutMinor !== null) {
    if (c.payoutDate < c.outflowDate) throw new Error('Payout must not precede outflow in this pre-payout stress scenario');
    let balance = BigInt(c.initialMinor); const floor = BigInt(c.retainedFloorMinor);
    let minimum = balance;
    for (const e of [{ date: c.outflowDate, kind: 'outflow', amountMinor: outflowMinor }, { date: c.payoutDate, kind: 'inflow', amountMinor: c.payoutMinor }]) {
      balance += (e.kind === 'inflow' ? 1n : -1n) * BigInt(e.amountMinor); if (balance < minimum) minimum = balance;
      timeline.push({ ...e, balanceMinor: balance.toString() });
    }
    shortfallMinor = (minimum < floor ? floor - minimum : 0n).toString();
    if (shortfallMinor !== '0') gaps.push('Working-capital shortfall against retained cash floor');
  } else gaps.push('Cash amounts or payout timing unknown');
  const economics = { currency: input.currency, quantity, unitContributionMinor, scenarioContributionMinor, outflowMinor, shortfallMinor, timeline: shortfallMinor === null ? null : timeline, rounding: 'No fractional arithmetic: operator supplies whole minor units for one unit, multiplied exactly by quantity.', caveat: 'Supplied scenarios only. All costs precede separately supplied net payout as a conservative stress case; fees/refunds already withheld in net payout may overstate exposure. Not a payout forecast or complete ledger. Refund, reprint and cancellation allowances are per-unit assumptions, not actual events.' };
  const state = gaps.length ? 'NOT_READY' : 'READY_FOR_HUMAN_REVIEW';
  const draft = { version: 1, state, gaps, boundary, input: JSON.parse(JSON.stringify(input)) };
  const json = v => JSON.stringify(v, null, 2) + '\n';
  const review = boundary + '\n\n' + quote(state) + '\n\n' + (gaps.length ? gaps.map(quote).join('\n\n') : 'All supplied review gates passed; recheck policy and fees before any separately authorized shop work.') + '\n\n' + quote(JSON.stringify({ policySnapshot: input.policySnapshot, feeSnapshot: input.feeSnapshot, review: input.review })) + '\n';
  return { state, gaps, economics, files: {
    'product-draft.json': json(draft), 'rights-policy-review.md': review,
    'listing-draft.md': boundary + '\n\n' + [input.title, input.description, input.humanContribution, input.aiDisclosure || 'AI disclosure: none supplied', JSON.stringify(input.product), JSON.stringify(input.partner)].map(quote).join('\n\n') + '\n',
    'economics-and-liquidity.json': json({ ...economics, unit: input.unit, assumptions: input.assumptions, cash: c, orders: input.orders }),
    'fulfilment-checklist.md': boundary + '\n\nConfirm design version, variant, dimensions, licensed accurate mockup, partner and shipping origin. Human sample/QC review required. Recheck dated policy and fees; generic ready-made resale, AI prompt bundles and AI-generated functional instructions are unsupported. Confirm individualized human creative input and AI disclosure. Reconcile unique order IDs before any future separately authorized submission; ambiguous outcomes must freeze retries. Review refund, reprint, cancellation allowances and payout/reserve timing. This checklist submits nothing.\n\n' + quote(JSON.stringify(input.assumptions)) + '\n'
  } };
}
const tool = { name: 'etsy.pod.prepare', capability: 'cabinet', scope: 'read', requiresConsent: false, timeoutMs: 5000, schema, description: 'Pure private Etsy POD preflight from explicit operator evidence and cost assumptions. Five fixed draft files; unknown and stale evidence block readiness. No Etsy connection or external action. Money is integer minor units, EUR/USD/GBP, per-unit costs; separate supplied net payout and conservative pre-payout cash stress.', run: async args => ({ content: JSON.stringify(prepare(args)), summary: 'Private POD preflight prepared; no files written or external action taken' }) };
module.exports = { prepare, schema, gates, costs, makeEtsyPodTools: () => ({ register(reg) { reg.register(tool); return reg; } }) };
