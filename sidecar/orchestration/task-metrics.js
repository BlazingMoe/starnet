'use strict';

const KNOWN_STATUS = ['accepted', 'revised', 'rejected', 'dispatch_error', 'audit_error', 'contract_error'];
const KNOWN_STAGE = ['contract', 'dispatch', 'revision', 'formal-review', 'audit', 'accepted'];

function finite(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function rate(n, d) { return d > 0 ? n / d : 0; }
function inc(map, key) {
  key = key == null ? '' : String(key).trim();
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}
function ranked(map, limit) {
  return Object.keys(map)
    .map(value => ({ value, count: map[value] }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}
function makeCounts(keys) {
  const out = {};
  for (const key of keys) out[key] = 0;
  return out;
}

function summarizeManagedTasks(input, opts) {
  const rows = Array.isArray(input) ? input : [];
  opts = opts || {};
  const statusCounts = makeCounts(KNOWN_STATUS);
  const stageCounts = makeCounts(KNOWN_STAGE);
  const riskCounts = {};
  const findingCounts = {};
  const workerMap = new Map();

  let accepted = 0;
  let usd = 0;
  let attempts = 0;
  let durationMs = 0;
  let durationSamples = 0;
  let revisedTasks = 0;
  let auditedTasks = 0;
  let auditedRejected = 0;
  let errorTasks = 0;

  for (const row0 of rows) {
    const row = row0 && typeof row0 === 'object' ? row0 : {};
    const status = String(row.status || 'rejected');
    const stage = String(row.stage || 'formal-review');
    if (!(status in statusCounts)) statusCounts[status] = 0;
    if (!(stage in stageCounts)) stageCounts[stage] = 0;
    statusCounts[status]++;
    stageCounts[stage]++;

    const ok = row.accepted === true;
    if (ok) accepted++;
    const rowUsd = Math.max(0, finite(row.usd));
    const rowAttempts = Math.max(0, Math.floor(finite(row.attempts)));
    const rowDuration = Math.max(0, finite(row.durationMs));
    usd += rowUsd;
    attempts += rowAttempts;
    if (rowDuration > 0) { durationMs += rowDuration; durationSamples++; }
    if (rowAttempts > 1 || status === 'revised') revisedTasks++;
    if (/_error$/.test(status)) errorTasks++;

    const audited = !!String(row.auditorAgentId || '').trim();
    if (audited) {
      auditedTasks++;
      if (!ok) auditedRejected++;
    }

    if (Array.isArray(row.riskFlags)) for (const flag of row.riskFlags) inc(riskCounts, flag);
    if (Array.isArray(row.findings)) for (const finding of row.findings) inc(findingCounts, finding);

    const workerId = String(row.workerAgentId || '').trim();
    if (workerId) {
      let w = workerMap.get(workerId);
      if (!w) {
        w = { workerAgentId: workerId, tasks: 0, accepted: 0, rejected: 0, usd: 0, attempts: 0, durationMs: 0, durationSamples: 0 };
        workerMap.set(workerId, w);
      }
      w.tasks++;
      if (ok) w.accepted++; else w.rejected++;
      w.usd += rowUsd;
      w.attempts += rowAttempts;
      if (rowDuration > 0) { w.durationMs += rowDuration; w.durationSamples++; }
    }
  }

  const total = rows.length;
  const workers = Array.from(workerMap.values()).map(w => ({
    workerAgentId: w.workerAgentId,
    tasks: w.tasks,
    accepted: w.accepted,
    rejected: w.rejected,
    acceptanceRate: rate(w.accepted, w.tasks),
    usd: w.usd,
    attempts: w.attempts,
    averageDurationMs: w.durationSamples ? w.durationMs / w.durationSamples : 0
  })).sort((a, b) => b.tasks - a.tasks || a.workerAgentId.localeCompare(b.workerAgentId));

  return {
    schemaVersion: 'moe.managed-task-summary.v2',
    total,
    accepted,
    rejected: total - accepted,
    acceptanceRate: rate(accepted, total),
    usd,
    attempts,
    averageAttempts: rate(attempts, total),
    averageDurationMs: durationSamples ? durationMs / durationSamples : 0,
    revisedTasks,
    revisionRate: rate(revisedTasks, total),
    auditedTasks,
    auditCoverageRate: rate(auditedTasks, total),
    auditedRejected,
    auditedRejectRate: rate(auditedRejected, auditedTasks),
    errorTasks,
    errorRate: rate(errorTasks, total),
    statusCounts,
    stageCounts,
    topRiskFlags: ranked(riskCounts, 20),
    topFindings: ranked(findingCounts, 20),
    workers,
    window: {
      rows: total,
      capacity: Math.max(1, Math.floor(finite(opts.windowCapacity) || total || 1)),
      truncated: opts.truncated === true
    }
  };
}

module.exports = { summarizeManagedTasks };
