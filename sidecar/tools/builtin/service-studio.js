'use strict';
// Pure bounded preparation from operator evidence. No I/O, ambient clock or external authority.
const str = (maxLength = 400) => ({ type: 'string', minLength: 1, maxLength });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const choice = (...values) => ({ type: 'string', enum: values });
const integer = (maximum, minimum = 0) => ({ type: 'integer', minimum, maximum });
const arr = (items, maxItems = 20, minItems = 1) => ({ type: 'array', items, minItems, maxItems });
const decision = choice('approved', 'rejected', 'unknown');
const money = { ...str(18), pattern: '^(unknown|0|[1-9][0-9]{0,17})$' };
// Contracts describe a future human-reviewed private deliverable; they do not certify finished work.
const lanes = {
  'crm-prototype': { deliverables: ['requirements', 'synthetic-data-prototype', 'handover'], qa: { scope: 'CRM/dashboard/follow-up flow and acceptance criteria; synthetic data only', privacy: 'No real customer records, credentials, live integrations or automated outreach', functionality: 'Human test plan for data validation, access boundaries, dashboard totals and follow-up states', support: 'Document setup, limitations, accessibility, maintenance and support ownership' } },
  'youtube-thumbnail': { deliverables: ['creative-brief', 'thumbnail-spec', 'rights-manifest'], qa: { originality: 'Original composition and customer customization; no competitor replication', legibility: 'Review target dimensions, crop, small-screen text, contrast and export format', fidelity: 'Accurate video promise, likeness permissions and no misleading imagery' } },
  logo: { deliverables: ['brand-brief', 'logo-spec', 'rights-manifest'], qa: { originality: 'Original concept, human refinement and trademark-conflict review; no copied identity', usability: 'Review vector/raster exports, monochrome, small-size readability and clear space', licensing: 'Review font, stock and commercial-use licenses; no exclusivity guarantee' } },
  'game-assets-2d': { deliverables: ['asset-inventory', 'asset-spec', 'integration-plan'], qa: { originality: 'Original art direction and permitted input licenses; no copied game assets', technical: 'Review resolution, sprite bounds, alpha, atlas padding, animation frames and naming', integration: 'Human engine-import test plan, consistency and export/license manifest' } },
  'game-assets-3d': { deliverables: ['asset-inventory', 'asset-spec', 'integration-plan'], qa: { originality: 'Original art direction and permitted mesh/texture licenses', technical: 'Review topology, polygon budget, UVs, materials, textures, units, pivots and rig/animation needs', integration: 'Human engine-import test plan, performance, LOD/collision requirements and export/license manifest' } },
  'ats-resume': { deliverables: ['verified-career-intake', 'resume-spec', 'review-checklist'], qa: { truthfulness: 'Candidate verifies every role, date, qualification and achievement; no invented credentials', privacy: 'Minimize and redact personal data; candidate consent and retention plan', parsing: 'Review simple headings, text extraction, reading order and target role alignment; no ATS score or hiring guarantee' } },
  'aeo-report': { deliverables: ['source-ledger', 'visibility-audit-plan', 'market-sizing-method'], qa: { sourcing: 'Dated query/sample scope and reproducible operator observations; claims distinguished from observations', sizing: 'Define market, geography, time period, units, denominators and cited inputs; ranges and uncertainty, no invented TAM', conclusions: 'Human check of citations, calculations and limitations; no ranking, visibility or earnings guarantee' } },
  'affiliate-blog': { deliverables: ['audience-brief', 'article-outline', 'disclosure-and-sources'], qa: { sourcing: 'Trace factual product claims to dated sources; no fabricated personal use or reviews', originality: 'Original outline and human editorial customization; no copied competitor text', disclosure: 'Review affiliate disclosure placement, program eligibility, links and permissions; no traffic or earnings guarantee' } }
};
const gates = ['originality', 'meaningfulCustomization', 'humanRefinement', 'rights', 'licensing', 'likeness', 'privacy', 'policy', 'fees', 'claims', 'economics', 'humanReview'];
const costs = ['platform', 'processing', 'generation', 'assets', 'labor', 'revisions', 'support', 'refunds', 'tax', 'other'];
const review = obj({ decision, evidenceId: str(48) });
const schema = obj({
  projectId: str(48), version: str(48), lane: choice(...Object.keys(lanes)), asOf: str(24), freshnessDays: integer(90, 1),
  title: str(140), customerNeed: str(800), scope: str(1200), exclusions: str(800), customizationPlan: str(800), humanRefinementPlan: str(800),
  aiUse: choice('none', 'assisted', 'unknown'), customerAiPreference: choice('allowed', 'prohibited', 'unknown'),
  evidence: arr(obj({ id: str(48), kind: choice('observed-fact', 'creator-claim', 'platform-claim', 'assumption', 'hypothesis', 'unknown'), statement: str(800), sourceUrl: str(500), receipt: str(), checkedAt: str(24), support: choice('supported', 'unsupported', 'unknown') }), 30),
  demandEvidenceIds: arr(str(48), 10), policyEvidenceId: str(48), feeEvidenceId: str(48),
  assets: arr(obj({ id: str(48), license: str(), evidenceId: str(48), rights: decision, licensing: decision, likeness: decision, privacy: decision })),
  deliverables: arr(obj({ id: str(48), specification: str(800) }), 6),
  qa: arr(obj({ id: str(48), plan: str(800), decision, evidenceId: str(48) }), 8),
  review: obj(Object.fromEntries(gates.map(k => [k, review]))),
  duplicate: obj({ workId: str(48), priorState: choice('none', 'prepared', 'delivered', 'ambiguous', 'unknown'), reconciliation: choice('confirmed-new', 'confirmed-same-private-revision', 'unresolved', 'unknown'), evidenceId: str(48) }),
  revisionCap: integer(20), revisionsUsed: integer(100), supportWindowDays: integer(365), supportPlan: str(800), refundPlan: str(800),
  economics: obj({ currency: choice('EUR', 'USD', 'GBP'), costCurrency: choice('EUR', 'USD', 'GBP'), quotedPriceMinor: money, costsMinor: obj(Object.fromEntries(costs.map(k => [k, money]))), minutes: obj({ production: integer(100000), revisions: integer(100000), support: integer(100000) }), evidenceId: str(48) })
});
function validate(v, r, at = 'input') {
  const fail = () => { throw Error('Invalid service studio field: ' + at); };
  if (r.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail();
    if (Object.keys(v).some(k => !Object.hasOwn(r.properties, k)) || r.required.some(k => !Object.hasOwn(v, k))) fail();
    for (const [k, rule] of Object.entries(r.properties)) validate(v[k], rule, at + '.' + k);
  } else if (r.type === 'array') {
    if (!Array.isArray(v) || v.length < r.minItems || v.length > r.maxItems) fail();
    for (let i = 0; i < v.length; i++) validate(v[i], r.items, at + '[' + i + ']');
  } else if (r.type === 'integer') {
    if (!Number.isSafeInteger(v) || v < r.minimum || v > r.maximum) fail();
  } else if (typeof v !== 'string' || !v.trim() || v.length > r.maxLength || (r.enum && !r.enum.includes(v)) || (r.pattern && !new RegExp(r.pattern).test(v)) || /[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/u.test(v)) fail();
}
function time(v) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) throw Error('Invalid canonical UTC timestamp');
  return Date.parse(v);
}
const unknown = v => v.trim().toLowerCase() === 'unknown';
const boundary = 'PRIVATE PREPARATION ONLY. All evidence, support labels and approvals are operator assertions, not independently verified. Creator/platform claims remain attributed claims; assumptions and hypotheses are not facts. Demand is not proven sales. No revenue/profit proof or guarantee. Readiness authorizes only human private-production review, never execution. No scraping, outreach, listing, delivery, publication, purchase, paid generation, account/API action or background loop. Original, meaningfully customized human-reviewed work is required; no competitor copying or design replication. File-byte verification does not verify sources, rights or quality.';
const quote = v => '> ' + JSON.stringify(v).replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&');
function prepare(input) {
  validate(input, schema);
  const now = time(input.asOf), gaps = [], contract = lanes[input.lane];
  const id = v => { if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(v)) throw Error('Invalid identifier'); };
  const unique = (items, key) => { const seen = new Set(); for (const item of items) { const v = key ? item[key] : item; id(v); if (seen.has(v.toLowerCase())) throw Error('Duplicate identifier'); seen.add(v.toLowerCase()); } };
  id(input.projectId); id(input.version); id(input.duplicate.workId);
  for (const key of ['evidence', 'assets', 'deliverables', 'qa']) unique(input[key], 'id');
  unique(input.demandEvidenceIds);
  const byId = new Map(input.evidence.map(e => [e.id, e]));
  const reference = (value, label, fact = false) => {
    id(value); const e = byId.get(value); if (!e) throw Error('Unknown evidence reference: ' + label);
    if (fact && e.kind !== 'observed-fact') gaps.push(label + ': observed evidence required');
    return e;
  };
  for (const e of input.evidence) {
    let u; try { u = new URL(e.sourceUrl); } catch { throw Error('Invalid source URL'); }
    if (!/^https:\/\//.test(e.sourceUrl) || u.username || u.password || /[\s\\]/.test(e.sourceUrl)) throw Error('Invalid source URL');
    const t = time(e.checkedAt); if (t > now) throw Error('Evidence postdates asOf');
    if (e.kind === 'unknown' || e.support !== 'supported' || unknown(e.receipt) || unknown(e.statement) || now - t > input.freshnessDays * 86400000) gaps.push(e.id + ': stale, unknown or unsupported evidence');
  }
  for (const value of input.demandEvidenceIds) reference(value, 'demand', true);
  reference(input.policyEvidenceId, 'policy', true); reference(input.feeEvidenceId, 'fees', true);
  for (const k of gates) { reference(input.review[k].evidenceId, k, true); if (input.review[k].decision !== 'approved') gaps.push(k + ': human approval unresolved'); }
  for (const a of input.assets) {
    reference(a.evidenceId, 'asset ' + a.id, true);
    if (unknown(a.license) || ['rights', 'licensing', 'likeness', 'privacy'].some(k => a[k] !== 'approved')) gaps.push('Asset clearance unresolved: ' + a.id);
  }
  for (const key of ['customerNeed', 'scope', 'exclusions', 'customizationPlan', 'humanRefinementPlan', 'supportPlan', 'refundPlan']) if (unknown(input[key])) gaps.push(key + ': unresolved');
  if (input.aiUse === 'unknown' || input.customerAiPreference === 'unknown' || (input.customerAiPreference === 'prohibited' && input.aiUse !== 'none')) gaps.push('Customer AI preference conflict or unknown');
  for (const d of input.deliverables) { if (!contract.deliverables.includes(d.id)) throw Error('Unexpected lane deliverable'); if (unknown(d.specification)) gaps.push('Deliverable specification unresolved: ' + d.id); }
  for (const required of contract.deliverables) if (!input.deliverables.some(d => d.id === required)) gaps.push('Missing lane deliverable: ' + required);
  for (const q of input.qa) { if (!Object.hasOwn(contract.qa, q.id)) throw Error('Unexpected lane QA'); reference(q.evidenceId, 'QA ' + q.id, true); if (q.decision !== 'approved' || unknown(q.plan)) gaps.push('QA plan unresolved: ' + q.id); }
  for (const required of Object.keys(contract.qa)) if (!input.qa.some(q => q.id === required)) gaps.push('Missing lane QA: ' + required);
  reference(input.duplicate.evidenceId, 'duplicate reconciliation', true);
  const dup = input.duplicate;
  if (!((dup.priorState === 'none' && dup.reconciliation === 'confirmed-new') || (dup.priorState === 'prepared' && dup.reconciliation === 'confirmed-same-private-revision'))) gaps.push('Duplicate or ambiguous work: freeze and reconcile');
  if (input.revisionsUsed > input.revisionCap) gaps.push('Revision cap exceeded');
  const e = input.economics, economicsBasis = reference(e.evidenceId, 'economics');
  if (!['observed-fact', 'assumption'].includes(economicsBasis.kind)) gaps.push('Economics requires observed inputs or an explicit operator assumption, not creator/platform claims or hypotheses');
  if (e.currency !== e.costCurrency) throw Error('Currency mismatch');
  const minutes = Object.values(e.minutes).reduce((sum, n) => sum + n, 0);
  let totalCostMinor = null, modeledContributionMinor = null, hourlyModeledContributionMinor = null;
  if (e.quotedPriceMinor === 'unknown' || costs.some(k => e.costsMinor[k] === 'unknown')) gaps.push('Economics unknown; unknown is never zero');
  else {
    const total = costs.reduce((sum, k) => sum + BigInt(e.costsMinor[k]), 0n), contribution = BigInt(e.quotedPriceMinor) - total;
    totalCostMinor = total.toString(); modeledContributionMinor = contribution.toString();
    if (minutes > 0) hourlyModeledContributionMinor = (contribution * 60n / BigInt(minutes)).toString();
    if (contribution <= 0n) gaps.push('Non-positive modeled contribution');
  }
  if (minutes === 0 || e.minutes.production === 0 || (input.revisionCap > 0 && e.minutes.revisions === 0) || (input.supportWindowDays > 0 && e.minutes.support === 0)) gaps.push('Production/revision/support time unresolved');
  const state = gaps.length ? 'NOT_READY' : 'READY_FOR_HUMAN_PRIVATE_PRODUCTION_REVIEW';
  const economics = { ...e, totalMinutes: minutes, totalCostMinor, modeledContributionMinor, hourlyModeledContributionMinor, calculation: 'Exact supplied integer minor units only; hourly quotient truncates toward zero. Quoted price and costs are a scenario, not actual revenue or profit. No platform fee is assumed.' };
  const json = data => JSON.stringify({ boundary, ...data }, null, 2) + '\n';
  const md = data => boundary + '\n\n' + quote(data) + '\n';
  return { state, gaps, economics, files: {
    'service-brief.md': md({ projectId: input.projectId, version: input.version, lane: input.lane, title: input.title, customerNeed: input.customerNeed, scope: input.scope, exclusions: input.exclusions, customizationPlan: input.customizationPlan, humanRefinementPlan: input.humanRefinementPlan, aiUse: input.aiUse, customerAiPreference: input.customerAiPreference }),
    'evidence-ledger.json': json({ asOf: input.asOf, freshnessDays: input.freshnessDays, evidence: input.evidence, demandEvidenceIds: input.demandEvidenceIds, policyEvidenceId: input.policyEvidenceId, feeEvidenceId: input.feeEvidenceId }),
    'production-and-qa.json': json({ lane: input.lane, requirements: contract, deliverables: input.deliverables, qa: input.qa, assets: input.assets }),
    'economics-and-scope.json': json({ economics, revisionCap: input.revisionCap, revisionsUsed: input.revisionsUsed, supportWindowDays: input.supportWindowDays, supportPlan: input.supportPlan, refundPlan: input.refundPlan }),
    'readiness.json': json({ state, gaps, duplicate: input.duplicate, review: input.review, nextStep: 'Human review of this private preparation pack only; independently verify evidence and actual work before any separately authorized production or external action.' })
  } };
}
const tool = { name: 'service.studio.prepare', capability: 'cabinet', scope: 'read', requiresConsent: false, timeoutMs: 5000, schema, description: 'Pure private digital-service preparation: one operator-selected lane, supplied evidence and five fixed review files. No file writes or external action authority.', run: async args => ({ content: JSON.stringify(prepare(args)), summary: 'Private studio preparation only; no files written or external action' }) };
module.exports = { prepare, schema, gates, costs, lanes, makeServiceStudioTools: () => ({ register(reg) { reg.register(tool); return reg; } }) };
