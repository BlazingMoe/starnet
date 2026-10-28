/* Read-only, selected-agent decision/outcome history for the dedicated Memory Core. */
'use strict';

const { PAGE_DEFAULT, PAGE_MAX, MAX_RECORDS, MAX_OUTCOME_EVENTS, MAX_TEXT, MAX_ITEMS } = require('../tools/builtin/decisions.js');

const AGENT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const HOST_PROJECT_ID_RE = /^[A-Za-z0-9_-]{16,120}$/;
const LESSON_STATES = new Set(['staging', 'pending', 'reviewing-kept', 'kept', 'discarded']);
// A decision can carry up to 40 outcome events with 12 references each; keep the outer page
// intentionally smaller than decision.list so the complete nested audit evidence remains bounded.
const HTTP_PAGE_MAX = 10;
const HTTP_PAGE_DEFAULT = Math.min(PAGE_DEFAULT, HTTP_PAGE_MAX);

function boundedText(value, max, redact) {
  if (typeof value !== 'string') return '';
  const clean = String(redact(value)).trim();
  return clean.slice(0, max);
}
function boundedList(value, cap, redact) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, cap).map(v => boundedText(v, MAX_TEXT, redact));
}
function timestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function projectSourceBinding(value) {
  // Projection shape does not authenticate imported or edited durable history; this label stays historical-only.
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || value.type !== 'project' || typeof value.id !== 'string' || !HOST_PROJECT_ID_RE.test(value.id)) return null;
  return { schemaVersion:1, type:'project', id:value.id.slice(0,120), provenance:'host-admission-snapshot', authority:'historical-only' };
}
function projectLessonContract(value, redact) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || !value.scope || typeof value.scope !== 'object') return null;
  const s = value.scope;
  if (!['global','customer','project'].includes(s.type) || (s.type === 'global' ? s.id != null : typeof s.id !== 'string')) return null;
  const list = xs => Array.isArray(xs) ? xs.slice(0, MAX_ITEMS).map(x => boundedText(x, MAX_TEXT, redact)) : [];
  const confidence = value.confidence == null ? null : value.confidence;
  return {
    schemaVersion:1, scope:{type:s.type, ...(s.id == null ? {} : {id:boundedText(s.id,120,redact)})},
    sourceRefs:list(value.sourceRefs), uncertainty:boundedText(value.uncertainty,MAX_TEXT,redact),
    confidence:typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null,
    version:boundedText(value.version,80,redact), recheckAt:boundedText(value.recheckAt,10,redact), expiresAt:boundedText(value.expiresAt,10,redact),
    positiveExamples:list(value.positiveExamples), negativeExamples:list(value.negativeExamples),
    trust:'unverified', authority:'reference-only'
  };
}
function pageNumber(value, fallback, max) {
  if (value == null || value === '') return fallback;
  if (!/^(0|[1-9]\d*)$/.test(String(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= max ? n : null;
}
function projectRecord(row, redact) {
  row = row && typeof row === 'object' ? row : {};
  const outcomes = Array.isArray(row.outcomeEvents) ? row.outcomeEvents : [];
  const proposals = Array.isArray(row.lessonProposals) ? row.lessonProposals : [];
  return {
    id: boundedText(row.id, 120, redact),
    decision: boundedText(row.decision, MAX_TEXT, redact),
    alternatives: boundedList(row.alternatives, MAX_ITEMS, redact),
    alternativesTruncated: Array.isArray(row.alternatives) && row.alternatives.length > MAX_ITEMS,
    evidenceRefs: boundedList(row.evidenceRefs, MAX_ITEMS, redact),
    evidenceRefsTruncated: Array.isArray(row.evidenceRefs) && row.evidenceRefs.length > MAX_ITEMS,
    uncertainty: boundedText(row.uncertainty, MAX_TEXT, redact),
    confidence: typeof row.confidence === 'number' && Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1 ? row.confidence : null,
    createdAt: timestamp(row.createdAt),
    source: row.source === 'model' ? 'model' : 'unknown',
    trust: row.trust === 'unconfirmed' ? 'unconfirmed' : 'unknown',
    ...(projectSourceBinding(row.sourceProjectBinding) ? {sourceProjectBinding:projectSourceBinding(row.sourceProjectBinding)} : {}),
    outcomeStatus: row.outcomeStatus === 'pending' || row.outcomeStatus === 'recorded' ? row.outcomeStatus : 'unknown',
    outcomeEventsTotal: outcomes.length,
    outcomeEventsTruncated: outcomes.length > MAX_OUTCOME_EVENTS,
    outcomeEvents: outcomes.slice(-MAX_OUTCOME_EVENTS).reverse().map(event => ({
      eventId: boundedText(event && event.eventId, 120, redact),
      outcome: boundedText(event && event.outcome, MAX_TEXT, redact),
      evidenceRefs: boundedList(event && event.evidenceRefs, MAX_ITEMS, redact),
      evidenceRefsTruncated: Array.isArray(event && event.evidenceRefs) && event.evidenceRefs.length > MAX_ITEMS,
      createdAt: timestamp(event && event.createdAt),
      source: event && event.source === 'model' ? 'model' : 'unknown',
      trust: event && event.trust === 'unconfirmed' ? 'unconfirmed' : 'unknown'
    })),
    lessonProposalsTotal: proposals.length,
    lessonProposalsTruncated: proposals.length > MAX_OUTCOME_EVENTS,
    lessonProposals: proposals.slice(-MAX_OUTCOME_EVENTS).reverse().map(proposal => ({
      outcomeEventId: boundedText(proposal && proposal.outcomeEventId, 120, redact),
      lesson: boundedText(proposal && proposal.lesson, MAX_TEXT, redact),
      status: LESSON_STATES.has(proposal && proposal.status) ? proposal.status : 'unknown',
      createdAt: timestamp(proposal && proposal.createdAt),
      ...(projectSourceBinding(proposal && proposal.sourceProjectBinding) ? {sourceProjectBinding:projectSourceBinding(proposal.sourceProjectBinding)} : {}),
      ...(projectLessonContract(proposal && proposal.contract, redact) ? { contract: projectLessonContract(proposal.contract, redact) } : {})
    }))
  };
}

function makeDecisionHistoryHttp(opts) {
  opts = opts || {};
  const readForAgent = typeof opts.readForAgent === 'function' ? opts.readForAgent : null;
  const respondJson = opts.respondJson;
  const redact = typeof opts.redact === 'function' ? opts.redact : (s => s);
  const isAgentId = typeof opts.isAgentId === 'function' ? opts.isAgentId : (s => typeof s === 'string' && AGENT_ID_RE.test(s));
  if (!readForAgent) throw new Error('decision history HTTP requires readForAgent');
  if (typeof respondJson !== 'function') throw new Error('decision history HTTP requires respondJson');

  function send(res, code, body) { return respondJson(res, code, body); }
  function serve(req, res) {
    try {
      const url = new URL(String(req && req.url || ''), 'http://127.0.0.1');
      if (url.pathname !== '/api/memory/decisions') return send(res, 404, { ok:false, error:'not found' });
      const method = String(req && req.method || 'GET').toUpperCase();
      if (method !== 'GET') return send(res, 405, { ok:false, error:'read-only endpoint' });
      const agentId = url.searchParams.get('agent') || 'agent';
      if (!isAgentId(agentId)) return send(res, 403, { ok:false, error:'forbidden' });
      const limit = pageNumber(url.searchParams.get('limit'), HTTP_PAGE_DEFAULT, Math.min(PAGE_MAX, HTTP_PAGE_MAX));
      const offset = pageNumber(url.searchParams.get('offset'), 0, MAX_RECORDS);
      if (limit == null || limit < 1 || offset == null) return send(res, 400, { ok:false, error:'invalid decision history page' });

      const rows = readForAgent(agentId);
      if (!Array.isArray(rows)) throw new Error('decision history reader returned malformed data');
      const ids = new Set();
      for (const row of rows) {
        if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim() || row.id.length > 120 || ids.has(row.id)) {
          throw new Error('decision history contains malformed or duplicate identities');
        }
        ids.add(row.id);
      }
      const ordered = rows.map((row, index) => ({ row, index })).sort((a, b) => {
        const at = timestamp(a.row && a.row.createdAt), bt = timestamp(b.row && b.row.createdAt);
        return ((bt == null ? -1 : bt) - (at == null ? -1 : at)) || b.index - a.index;
      });
      const page = ordered.slice(offset, offset + limit).map(x => projectRecord(x.row, redact));
      return send(res, 200, {
        ok:true, agentId, records:page, total:rows.length, offset, limit,
        hasMore:offset + Math.min(limit, Math.max(0, rows.length - offset)) < rows.length
      });
    } catch (_) {
      return send(res, 500, { ok:false, error:'decision history unavailable; stored history is not confirmed empty', code:'EDECISION_HISTORY_UNAVAILABLE' });
    }
  }
  return Object.freeze({ serve });
}

module.exports = { makeDecisionHistoryHttp, projectRecord, pageNumber, HTTP_PAGE_DEFAULT, HTTP_PAGE_MAX };
