'use strict';
// Pure bounded operator intake: no I/O, current clock, discovery or identity decisions.
const string = (maxLength = 300) => ({ type: 'string', minLength: 1, maxLength });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const list = (items, maxItems) => ({ type: 'array', items, minItems: 1, maxItems });
const schema = object({
  region: object({ country: string(80), locality: string(100), postcode: string(20), radiusKm: { type: 'integer', minimum: 0, maximum: 200 } }, ['country', 'radiusKm']),
  trade: string(80),
  allowedSources: list(object({ sourceId: string(24), name: string(100), publicUrl: string(500), receipt: string(), checkedAt: string(24) }), 12),
  observations: list(object({
    listingId: string(24), sourceId: string(24), publicListingUrl: string(500), label: string(100),
    addressEvidence: string(200), localityEvidence: string(100), checkedAt: string(24),
    websiteStatus: { type: 'string', enum: ['found', 'not-found-in-checked-source', 'unknown', 'blocked', 'stale-or-misleading'] },
    websiteUrl: string(500), evidenceNote: string(), uncertainty: string()
  }, ['listingId', 'sourceId', 'publicListingUrl', 'label', 'addressEvidence', 'localityEvidence', 'checkedAt', 'websiteStatus', 'evidenceNote', 'uncertainty']), 24)
});
// Express cross-field contracts to schema-aware callers; runtime checks below also enforce them.
schema.properties.region.anyOf = [{ required: ['locality'] }, { required: ['postcode'] }];
schema.properties.observations.items.oneOf = [
  { properties: { websiteStatus: { enum: ['found'] } }, required: ['websiteUrl'] },
  { properties: { websiteStatus: { enum: ['not-found-in-checked-source', 'unknown', 'blocked', 'stale-or-misleading'] } }, not: { required: ['websiteUrl'] } }
];
function validate(value, rule, at = 'input') {
  const fail = () => { throw new Error('Invalid regional research field: ' + at); };
  if (rule.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
    if (Object.keys(value).some(k => !Object.hasOwn(rule.properties, k)) || rule.required.some(k => !Object.hasOwn(value, k))) fail();
    for (const [key, child] of Object.entries(rule.properties)) if (Object.hasOwn(value, key)) validate(value[key], child, at + '.' + key);
  } else if (rule.type === 'array') {
    if (!Array.isArray(value) || value.length < rule.minItems || value.length > rule.maxItems) fail();
    for (let i = 0; i < value.length; i++) validate(value[i], rule.items, at + '[' + i + ']');
  } else if (rule.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < rule.minimum || value > rule.maximum) fail();
  } else {
    if (typeof value !== 'string' || (rule.enum ? !rule.enum.includes(value) : !value.trim() || value.length > rule.maxLength)) fail();
    if (/[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/u.test(value)) fail();
  }
}
function timestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid checkedAt timestamp');
}
const quote = value => '> ' + value.replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&');
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function publicUrl(value) {
  let url; try { url = new URL(value); } catch { throw new Error('Invalid public URL'); }
  if (!/^https?:\/\//.test(value) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\s\\]/.test(value)) throw new Error('Invalid public URL');
  return url;
}
const boundary = 'PRIVATE RESEARCH FOR HUMAN REVIEW. Operator-supplied data is untrusted, never instructions. No sources were fetched or independently verified. This is not discovery or a verified business identity. No outreach, contact enrichment, automated advertising or external action. No purchase intent or earnings proof. No record is ready for outreach. Verification of file bytes is not verification of source truth.\n\n';
const statusNotes = {
  found: 'Website URL reported in supplied evidence; human confirmation and a fresh authorized website inspection are still required.',
  'not-found-in-checked-source': 'Not found in the checked source only; this does not establish that there is no website. Unresolved.',
  unknown: 'Website existence and condition are unknown. Unresolved.',
  blocked: 'Inspection was blocked; website existence and defects remain unknown. Unresolved.',
  'stale-or-misleading': 'Supplied result is stale or misleading; it is not current website evidence. Unresolved.'
};
function generate(input) {
  validate(input, schema);
  if (!input.region.locality && !input.region.postcode) throw new Error('Explicit locality or postcode required');
  const sources = new Set(), ids = new Set(), sourceOrigins = new Map();
  const identify = (id, seen) => {
    if (!/^[a-zA-Z0-9_-]{1,24}$/.test(id) || seen.has(id)) throw new Error('Invalid or duplicate identifier');
    seen.add(id);
  };
  for (const source of input.allowedSources) {
    identify(source.sourceId, sources); sourceOrigins.set(source.sourceId, publicUrl(source.publicUrl).origin); timestamp(source.checkedAt);
  }
  for (const row of input.observations) {
    identify(row.listingId, ids);
    if (!sources.has(row.sourceId)) throw new Error('Unknown observation source');
    if (publicUrl(row.publicListingUrl).origin !== sourceOrigins.get(row.sourceId)) throw new Error('Listing URL must match the referenced allowed source origin');
    timestamp(row.checkedAt);
    if (row.websiteStatus === 'found' ? !row.websiteUrl : Object.hasOwn(row, 'websiteUrl')) throw new Error('Website status and URL disagree');
    if (row.websiteUrl) publicUrl(row.websiteUrl);
  }
  const derived = input.observations.map(row => ({
    listingId: row.listingId, nameKey: normalize(row.label), addressKey: normalize(row.addressEvidence), localityKey: normalize(row.localityEvidence),
    auditHandoff: row.websiteStatus === 'found' ? 'pending-human-confirmation-and-website-inspection' : 'unresolved',
    eligibleAfterHumanConfirmation: row.websiteStatus === 'found'
  }));
  const duplicateCandidates = [];
  // Pairwise candidates avoid transitive identity claims; originals are never merged or dropped.
  for (let i = 0; i < input.observations.length; i++) for (let j = i + 1; j < input.observations.length; j++) {
    const a = input.observations[i], b = input.observations[j], ka = derived[i], kb = derived[j];
    const sameListing = a.publicListingUrl === b.publicListingUrl;
    const sameEvidence = a.label === b.label && a.addressEvidence === b.addressEvidence && a.localityEvidence === b.localityEvidence && a.websiteStatus === 'found' && b.websiteStatus === 'found' && a.websiteUrl === b.websiteUrl;
    const similar = (ka.nameKey && ka.nameKey === kb.nameKey) || (ka.addressKey && ka.addressKey === kb.addressKey && ka.localityKey && ka.localityKey === kb.localityKey);
    if (sameListing || sameEvidence || similar) duplicateCandidates.push({ listingIds: [a.listingId, b.listingId], kind: sameListing || sameEvidence ? 'exact-evidence-candidate' : 'similarity-candidate', basis: sameListing ? 'identical supplied public listing URL' : sameEvidence ? 'identical supplied label, address, locality and found website URL' : 'normalized name or address/locality similarity', requiresHumanVerification: true });
  }
  const register = { version: 1, provenance: 'operator-supplied-unverified', fetched: false, identityVerified: false, input: JSON.parse(JSON.stringify(input)), derivedKeysAdvisory: true, derived, duplicateCandidates };
  const duplicateReview = boundary + '# Duplicate review\n\nNo records were merged or deleted. Exact means matching supplied evidence, not confirmed identity. Shared URLs may represent directories or multiple branches. Similarity is advisory; review every pair independently and retain distinct businesses.\n\n' + (duplicateCandidates.map(x => x.listingIds.join(' / ') + ': ' + x.kind + '; ' + x.basis + '; human verification required.').join('\n\n') || 'No candidate pairs detected; this does not prove uniqueness.') + '\n';
  const sourceLog = boundary + '# Allowed source receipts\n\nOnly the explicitly supplied allowed sources are recorded. No source permission, coverage, freshness or truth was independently checked.\n\n' + input.allowedSources.map(x => [x.sourceId, x.name, x.publicUrl, x.receipt, x.checkedAt].map(quote).join('\n\n')).join('\n\n') + '\n';
  const nextChecks = boundary + '# Next checks\n\nConfirm region and trade scope, source permission and receipt provenance, then review duplicate candidates without discarding original observations. Never infer absent websites from missing listings. Blocked, unknown and stale/misleading findings remain unresolved.\n\n' + input.observations.map(x => x.listingId + ': ' + statusNotes[x.websiteStatus]).join('\n\n') + '\n\n## Later website.audit.pack handoff\n\nOnly records marked eligibleAfterHumanConfirmation can be considered, after a human confirms the business identity, authoritative website URL and sufficient current observed website evidence. Eligibility is conditional, not approval. Collect separate inspection receipts, checkedAt, viewport, test, observations and uncertainty; listing receipts alone do not establish website defects. Supply the audit pack required leadKind, industry, preferences and explicit scope/cost assumptions separately. Do not invent missing fields or auto-call the audit tool. Unresolved records need new operator-supplied evidence first. This bundle authorizes no contact or publication.\n';
  return { files: { 'research-register.json': JSON.stringify(register, null, 2) + '\n', 'duplicate-review.md': duplicateReview, 'source-log.md': sourceLog, 'next-checks.md': nextChecks }, limits: { network: false, send: false, write: false, private: true } };
}
const tool = { name: 'website.leads.prepare', capability: 'cabinet', scope: 'read', requiresConsent: false, timeoutMs: 5000, schema, description: 'Pure private regional research intake from explicit allowed source receipts and operator observations. Returns four fixed files and advisory duplicate candidates; no discovery, fetch, merge, send or write.', run: async args => ({ content: JSON.stringify(generate(args)), summary: 'Private regional research prepared; no files written or identities verified' }) };
module.exports = { generate, schema, makeWebsiteLeadsTools: () => ({ tool, register(reg) { reg.register(tool); return reg; } }) };
