/* sidecar/control/memory-view.js — content-free Control Mode memory projection.
   Receives already-authoritative memory records and emits provenance/trust metadata only.
   It never copies title/body/content, never invents missing records, and keeps per-agent rows bounded. */
'use strict';

function text(v, max) {
  const s = v == null ? '' : String(v).trim();
  return s ? s.slice(0, max || 200) : '';
}
function finite(v) { return typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0; }
function clamp01(v) { const n = finite(v); return n < 0 ? 0 : n > 1 ? 1 : n; }
function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = text(row && row[field], 80) || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}
function recordMeta(record) {
  record = record && typeof record === 'object' ? record : {};
  return {
    id: text(record.id, 120),
    kind: text(record.kind, 40) || 'note',
    scope: text(record.scope, 80) || 'global',
    sourceRunId: text(record.sourceRunId, 160) || null,
    origin: text(record.origin, 80) || 'commander',
    createdAt: Math.max(0, finite(record.createdAt)),
    lastUsedAt: Math.max(0, finite(record.lastUsedAt)) || null,
    lastFeedbackAt: Math.max(0, finite(record.lastFeedbackAt)) || null,
    useCount: Math.max(0, Math.floor(finite(record.useCount))),
    trust: clamp01(record.trust),
    effectiveTrust: clamp01(record.effectiveTrust),
    pinned: record.pinned === true
  };
}
function projectMemoryOverview(agentRows, options) {
  options = options || {};
  const cap = Math.max(1, Math.min(50, Math.floor(finite(options.perAgentLimit) || 12)));
  const input = Array.isArray(agentRows) ? agentRows : [];
  const agents = [];
  let totalRecords = 0, pinned = 0, withSourceRun = 0, knownAgents = 0, unknownAgents = 0;
  const allKnownRecords = [];

  for (const row of input) {
    const agentId = text(row && row.agentId, 80);
    if (!agentId) continue;
    const known = Array.isArray(row && row.records);
    const records = known ? row.records.map(recordMeta).filter(r => r.id) : [];
    if (known) {
      knownAgents++;
      totalRecords += records.length;
      pinned += records.filter(r => r.pinned).length;
      withSourceRun += records.filter(r => !!r.sourceRunId).length;
      allKnownRecords.push(...records);
    } else unknownAgents++;
    const newest = records.slice().sort((a,b) => (b.createdAt-a.createdAt) || a.id.localeCompare(b.id)).slice(0, cap);
    const trustBase = records.length ? records.reduce((sum,r)=>sum+r.effectiveTrust,0)/records.length : 0;
    agents.push({
      agentId,
      name: text(row && row.name, 120) || agentId,
      known,
      total: known ? records.length : null,
      pinned: known ? records.filter(r => r.pinned).length : null,
      withSourceRun: known ? records.filter(r => !!r.sourceRunId).length : null,
      averageEffectiveTrust: known && records.length ? trustBase : (known ? 0 : null),
      scopes: known ? countBy(records, 'scope') : {},
      origins: known ? countBy(records, 'origin') : {},
      records: newest
    });
  }

  return {
    schemaVersion: 'moe.control-memory.v1',
    totals: {
      agents: agents.length,
      knownAgents,
      unknownAgents,
      records: knownAgents ? totalRecords : (agents.length ? null : 0),
      pinned: knownAgents ? pinned : (agents.length ? null : 0),
      withSourceRun: knownAgents ? withSourceRun : (agents.length ? null : 0)
    },
    scopes: countBy(allKnownRecords, 'scope'),
    origins: countBy(allKnownRecords, 'origin'),
    agents,
    evidence: {
      contentIncluded: false,
      provenanceFieldsOnly: true,
      unknownAgents
    }
  };
}

module.exports = { recordMeta, projectMemoryOverview };
