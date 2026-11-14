/* Read-only decision/outcome retrospective for the existing, selected-agent Memory Core. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MemoryDecisionHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PAGE_SIZE = 10;
  let generation = 0;
  let state = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function text(v, fallback) { return typeof v === 'string' && v.trim() ? v : (fallback || '—'); }
  function when(ts) {
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return 'time unknown';
    try { return new Date(ts).toLocaleString(); } catch (_) { return 'time unknown'; }
  }
  function mark(record) {
    return record.source === 'model' && record.trust === 'unconfirmed'
      ? 'MODEL-REPORTED · UNCONFIRMED'
      : 'SOURCE OR TRUST UNKNOWN';
  }
  function lessonStatus(status) {
    if (status === 'staging') return 'STAGED · QUEUE COMPLETION MAY NEED RECOVERY';
    if (status === 'pending') return 'AWAITING COMMANDER REVIEW';
    if (status === 'reviewing-kept') return 'KEEP IN PROGRESS · REVIEW RECEIPT RECOVERY MAY BE NEEDED';
    if (status === 'kept') return 'KEPT · REFERENCE ONLY';
    if (status === 'discarded') return 'DISCARDED';
    return 'REVIEW STATUS UNKNOWN';
  }
  function outcomeMark(event) {
    return event.source === 'model' && event.trust === 'unconfirmed'
      ? 'MODEL-REPORTED · UNVERIFIED'
      : 'OUTCOME PROVENANCE UNKNOWN';
  }
  function line(parent, label, value) {
    const row = el('div', 'mc-meta');
    row.textContent = label + ': ' + text(value, '—');
    parent.appendChild(row);
  }
  function createRecord(record) {
    const card = el('article', 'mc-rec mc-decision-record');
    const head = el('div', 'mc-head');
    head.append(el('span', 'turnin-kind', 'DECISION'), el('span', 'mc-scope', mark(record)));
    card.appendChild(head);
    const body = el('div', 'mc-body'); body.textContent = text(record.decision, '(decision text unavailable)'); card.appendChild(body);
    line(card, 'ID', record.id);
    line(card, 'RECORDED', when(record.createdAt));
    line(card, 'CONFIDENCE', record.confidence == null ? 'unknown (not supplied)' : Math.round(record.confidence * 100) + '%');
    line(card, 'UNCERTAINTY', record.uncertainty);
    if (record.alternatives && record.alternatives.length) line(card, 'ALTERNATIVES', record.alternatives.join(' · ') + (record.alternativesTruncated ? ' · additional entries omitted' : ''));
    if (record.evidenceRefs && record.evidenceRefs.length) line(card, 'DECISION EVIDENCE REFERENCES', record.evidenceRefs.join(' · ') + (record.evidenceRefsTruncated ? ' · additional references omitted' : ''));
    const events = Array.isArray(record.outcomeEvents) ? record.outcomeEvents : [];
    line(card, 'OUTCOMES', record.outcomeEventsTotal === 0 ? 'none recorded' : String(record.outcomeEventsTotal) + ' event(s)' + (record.outcomeEventsTruncated ? ' · only latest events shown' : ''));
    events.forEach(event => {
      const outcome = el('div', 'mc-decision-outcome');
      const outcomeHead = el('div', 'mc-meta');
      outcomeHead.textContent = 'OUTCOME · ' + outcomeMark(event) + ' · ' + when(event.createdAt) + ' · ' + text(event.eventId, 'event id unknown');
      outcome.appendChild(outcomeHead);
      const outcomeBody = el('div', 'mc-body'); outcomeBody.textContent = text(event.outcome, '(outcome text unavailable)'); outcome.appendChild(outcomeBody);
      if (event.evidenceRefs && event.evidenceRefs.length) line(outcome, 'EVIDENCE REFERENCES', event.evidenceRefs.join(' · ') + (event.evidenceRefsTruncated ? ' · additional references omitted' : ''));
      card.appendChild(outcome);
    });
    const proposals = Array.isArray(record.lessonProposals) ? record.lessonProposals : [];
    if (proposals.length || record.lessonProposalsTotal > 0) {
      line(card, 'LESSON CANDIDATES', String(record.lessonProposalsTotal || proposals.length) + (record.lessonProposalsTruncated ? ' · only latest candidates shown' : ''));
      proposals.forEach(proposal => {
        const candidate = el('div', 'mc-decision-lesson');
        const candidateHead = el('div', 'mc-meta');
        candidateHead.textContent = 'LESSON CANDIDATE · ' + lessonStatus(proposal.status) + ' · outcome ' + text(proposal.outcomeEventId, 'unknown');
        candidate.appendChild(candidateHead);
        const candidateBody = el('div', 'mc-body'); candidateBody.textContent = text(proposal.lesson, '(candidate text unavailable)'); candidate.appendChild(candidateBody);
        card.appendChild(candidate);
      });
    }
    return card;
  }
  function visible(s) { return state === s && s.generation === generation && document.getElementById('mc-decision-history') === s.host; }
  function showError(s, message) {
    if (!visible(s)) return;
    s.host.replaceChildren(el('div', 'mc-meta', message));
  }
  function addLoadOlder(s) {
    if (!visible(s) || !s.hasMore || s.busy) return;
    const button = el('button', 'consent-btn mc-decision-more', 'Load older decisions');
    button.type = 'button';
    button.setAttribute('aria-label', 'Load older decision history');
    button.onclick = () => loadPage(s, s.nextOffset, true);
    s.host.appendChild(button);
  }
  async function loadPage(s, offset, append) {
    if (!visible(s) || s.busy) return;
    s.busy = true;
    if (!append) s.host.replaceChildren(el('div', 'mc-meta', 'Reading durable decision history…'));
    else {
      const button = s.host.querySelector('.mc-decision-more');
      if (button) button.remove();
    }
    try {
      const url = '/api/memory/decisions?agent=' + encodeURIComponent(s.agentId) + '&limit=' + PAGE_SIZE + '&offset=' + offset;
      const body = await Harness.api.get(url);
      if (!visible(s)) return;
      if (!body || body.ok !== true || body.agentId !== s.agentId || !Array.isArray(body.records) || !Number.isSafeInteger(body.total) || body.total < 0) throw new Error('invalid response');
      if (body.hasMore === true && body.records.length === 0) {
        s.hasMore = false;
        throw new Error('empty page claims more records');
      }
      if (!append) s.host.replaceChildren();
      if (!append) s.records = [];
      // A new decision can be appended between offset pages; deduplicate by durable ID so a refresh cannot
      // display the same event twice. Reopen/refresh the pane to start again from the newest record.
      const seen = new Set(s.records.map(record => record && record.id).filter(Boolean));
      const page = body.records.filter(record => record && record.id && !seen.has(record.id));
      page.forEach(record => { seen.add(record.id); s.records.push(record); s.host.appendChild(createRecord(record)); });
      s.offset = offset;
      s.nextOffset = offset + body.records.length;
      s.hasMore = body.hasMore === true;
      s.total = body.total;
      const status = document.getElementById('mc-decision-history-status');
      if (status && visible(s)) status.textContent = 'Showing ' + s.records.length + ' of ' + s.total + ' · newest first · model reports remain unverified';
      if (!s.records.length && !s.hasMore) s.host.appendChild(el('div', 'mc-meta', 'No structured decisions are recorded for this agent.'));
    } catch (_) {
      if (!visible(s)) return;
      if (append) {
        const old = s.host.querySelector('.mc-decision-more'); if (old) old.remove();
        s.host.appendChild(el('div', 'mc-memory-error mc-meta', 'Could not load older decisions; previously loaded entries remain available. Refresh the Memory tab to retry.'));
      } else {
        const status = document.getElementById('mc-decision-history-status');
        if (status) status.textContent = 'History unavailable';
        showError(s, 'Decision history unavailable — stored records are not confirmed empty.');
      }
    } finally {
      s.busy = false;
      if (visible(s) && s.hasMore && !s.host.querySelector('.mc-decision-more')) addLoadOlder(s);
    }
  }
  function load(agentId) {
    const host = document.getElementById('mc-decision-history');
    const section = document.getElementById('mc-decision-history-sec');
    const status = document.getElementById('mc-decision-history-status');
    if (!host || !section) return;
    const id = typeof agentId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(agentId) ? agentId : '';
    if (!id) {
      generation++;
      section.style.display = '';
      if (status) status.textContent = 'Selected agent history unavailable';
      host.replaceChildren(el('div', 'mc-meta', 'Decision history unavailable — selected agent ID is invalid; no other agent history was requested.'));
      return Promise.resolve();
    }
    const s = { agentId:id, generation:++generation, host, records:[], offset:0, nextOffset:0, total:null, hasMore:false, busy:false };
    state = s;
    section.style.display = '';
    if (status) status.textContent = 'Reading newest decisions…';
    host.replaceChildren(el('div', 'mc-meta', 'Reading durable decision history…'));
    return loadPage(s, 0, false);
  }
  function stop() { generation++; state = null; }
  return Object.freeze({ load, stop, PAGE_SIZE });
});
