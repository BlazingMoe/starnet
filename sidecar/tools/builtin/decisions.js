/* Structured decision history. Records are untrusted model-produced evidence, isolated from notebook recall. */
'use strict';

const MAX_RECORDS = 200;
const MAX_OUTCOME_EVENTS = 40;
const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
const MAX_TEXT = 1000;
const MAX_ITEMS = 12;
function cleanText(value, field, required, redact) {
  if (typeof value !== 'string') throw new Error(field + ' must be a string');
  const out = String(redact(value)).trim();
  if (required && !out) throw new Error(field + ' is required');
  if (out.length > MAX_TEXT) throw new Error(field + ' must be at most ' + MAX_TEXT + ' characters');
  return out;
}
function cleanList(value, field, redact) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error(field + ' must be an array of up to ' + MAX_ITEMS + ' strings');
  return value.map((v, i) => cleanText(v, field + '[' + i + ']', true, redact));
}
function makeDecisionTools(deps) {
  deps = deps || {};
  const store = deps.store;
  const clock = deps.clock || { now: () => 0 };
  const redact = typeof deps.redact === 'function' ? deps.redact : (s => s);
  if (!store || typeof store.get !== 'function' || typeof store.update !== 'function') throw new Error('decision tools require durable memory store');
  const key = aid => 'decisions:' + (aid || 'agent');
  function rows(aid) {
    if (typeof store.readKey !== 'function') throw new Error('decision history requires recovery-aware readKey');
    const result = store.readKey(key(aid));
    if (result.status === 'absent') return [];
    if (result.status !== 'ok' && result.status !== 'recovered') throw new Error('decision history unavailable: durable store is ' + result.status);
    if (!Array.isArray(result.value)) throw new Error('decision history unavailable: stored value is malformed');
    return result.value.filter(x => x && typeof x === 'object');
  }
  const recordTool = {
    name: 'decision.record', capability: 'memory', scope: 'write', requiresConsent: false,
    description: 'Record a structured, untrusted decision for later retrieval. This does not approve a fact or instruction. Use a stable clientId so retries do not duplicate it. Confidence may be omitted (unknown); outcomes begin pending and are added separately.',
    schema: { type: 'object', required: ['clientId','decision','alternatives','evidenceRefs','uncertainty'], properties: {
      clientId: { type:'string', description:'Stable caller-generated retry key, reused only for this exact decision.' },
      decision: { type:'string' }, alternatives: { type:'array', items:{type:'string'} },
      evidenceRefs: { type:'array', items:{type:'string'}, description:'References/IDs only; do not copy evidence content.' },
      uncertainty: { type:'string' }, confidence: { type:'number', minimum:0, maximum:1 }
    } },
    run: async (args, ctx) => {
      const aid = ctx && ctx.agentId || 'agent';
      const clientId = cleanText(args && args.clientId, 'clientId', true, redact);
      if (clientId.length > 120) throw new Error('clientId must be at most 120 characters');
      const decision = cleanText(args && args.decision, 'decision', true, redact);
      const alternatives = cleanList(args && args.alternatives, 'alternatives', redact);
      const evidenceRefs = cleanList(args && args.evidenceRefs, 'evidenceRefs', redact);
      const uncertainty = cleanText(args && args.uncertainty, 'uncertainty', true, redact);
      const confidence = args.confidence == null ? null : args.confidence;
      if (confidence !== null && (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error('confidence must be between 0 and 1 or omitted');
      let saved, duplicate = false;
      await store.update(key(aid), cur => {
        const list = Array.isArray(cur) ? cur.slice() : [];
        const prior = list.find(r => r && r.clientId === clientId);
        if (prior) {
          const same = prior.decision === decision && JSON.stringify(prior.alternatives) === JSON.stringify(alternatives)
            && JSON.stringify(prior.evidenceRefs) === JSON.stringify(evidenceRefs) && prior.uncertainty === uncertainty && prior.confidence === confidence;
          if (!same) throw new Error('clientId already belongs to a different decision');
          saved = prior; duplicate = true; return undefined;
        }
        saved = { id: 'decision_' + clientId, clientId, decision, alternatives, evidenceRefs, uncertainty, confidence,
          createdAt: Number(clock.now()) || 0, source: 'model', trust: 'unconfirmed', outcomeStatus:'pending', outcomeEvents: [] };
        if (list.length >= MAX_RECORDS) throw new Error('decision history is full (' + MAX_RECORDS + '); archive or reset before recording more');
        list.push(saved); return list;
      });
      return { content: (duplicate ? 'Already recorded ' : 'Recorded ') + saved.id + '. It remains unconfirmed; this does not imply Commander approval.', summary: (duplicate ? 'duplicate ' : 'recorded ') + saved.id };
    }
  };
  const outcomeTool = {
    name: 'decision.outcome', capability: 'memory', scope: 'write', requiresConsent: false,
    description: 'Append an observed outcome event to a recorded decision. Supply a stable eventId for retry safety. Existing decision/evidence fields are immutable; outcome claims remain unverified unless supported by their evidence references.',
    schema: { type:'object', required:['id','eventId','outcome','evidenceRefs'], properties:{
      id:{type:'string'}, eventId:{type:'string'}, outcome:{type:'string'}, evidenceRefs:{type:'array',items:{type:'string'}}
    } },
    run: async (args, ctx) => {
      const aid = ctx && ctx.agentId || 'agent';
      const id = cleanText(args && args.id, 'id', true, redact);
      const eventId = cleanText(args && args.eventId, 'eventId', true, redact);
      const outcome = cleanText(args && args.outcome, 'outcome', true, redact);
      const evidenceRefs = cleanList(args && args.evidenceRefs, 'evidenceRefs', redact);
      let event, duplicate = false;
      await store.update(key(aid), cur => {
        const list = Array.isArray(cur) ? cur.slice() : [];
        const idx = list.findIndex(r => r && r.id === id);
        if (idx < 0) throw new Error('decision not found (it may have aged out)');
        const rec = Object.assign({}, list[idx]);
        const events = Array.isArray(rec.outcomeEvents) ? rec.outcomeEvents.slice() : [];
        const prior = events.find(e => e && e.eventId === eventId);
        if (prior) {
          if (prior.outcome !== outcome || JSON.stringify(prior.evidenceRefs) !== JSON.stringify(evidenceRefs)) throw new Error('eventId already belongs to a different outcome');
          event = prior; duplicate = true; return undefined;
        }
        event = { eventId, outcome, evidenceRefs, createdAt:Number(clock.now()) || 0, source:'model', trust:'unconfirmed' };
        if (events.length >= MAX_OUTCOME_EVENTS) throw new Error('decision outcome history is full (' + MAX_OUTCOME_EVENTS + ' events)');
        rec.outcomeEvents = events.concat([event]); rec.outcomeStatus = 'recorded'; list[idx] = rec; return list;
      });
      return { content:(duplicate ? 'Already appended outcome ' : 'Appended outcome ') + event.eventId + ' to ' + id + '.', summary:(duplicate ? 'duplicate outcome ' : 'outcome ') + id };
    }
  };
  const listTool = {
    name:'decision.list', capability:'memory', scope:'read', requiresConsent:false,
    description:'List your structured decision history. These are unconfirmed model records, separate from notebook facts and excluded from automatic memory recall.',
    schema:{ type:'object', properties:{ id:{type:'string'}, limit:{type:'number',minimum:1,maximum:50}, offset:{type:'number',minimum:0} } },
    run: async (args, ctx) => {
      let list = rows(ctx && ctx.agentId);
      if (args && args.id) list = list.filter(r => r.id === String(args.id));
      const total = list.length;
      const limit = args && args.limit == null ? PAGE_DEFAULT : Number(args.limit);
      const offset = args && args.offset == null ? 0 : Number(args.offset);
      if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) throw new Error('limit must be an integer from 1 to ' + PAGE_MAX);
      if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer');
      const page = list.slice(offset, offset + limit);
      return { content:JSON.stringify({records:page,total,offset,limit,hasMore:offset + page.length < total}), summary:page.length + ' of ' + total + ' decision record(s)' };
    }
  };
  return { recordTool, outcomeTool, listTool, register(reg) { reg.register(recordTool); reg.register(outcomeTool); reg.register(listTool); return reg; } };
}
module.exports = { makeDecisionTools, MAX_RECORDS, MAX_OUTCOME_EVENTS, MAX_TEXT, MAX_ITEMS, PAGE_DEFAULT, PAGE_MAX };
