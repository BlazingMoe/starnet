/* Structured decision history. Records are untrusted model-produced evidence, isolated from notebook recall. */
'use strict';

const MAX_RECORDS = 200;
const MAX_OUTCOME_EVENTS = 40;
const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
const MAX_TEXT = 1000;
const MAX_ITEMS = 12;
function lessonSourceKey(agentId, decisionId, outcomeEventId) { return JSON.stringify([String(agentId), String(decisionId), String(outcomeEventId)]); }
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
const LESSON_CONTRACT_KEYS = new Set(['schemaVersion','scope','sourceRefs','uncertainty','confidence','version','recheckAt','expiresAt','positiveExamples','negativeExamples']);
function cleanLessonContract(value, redact) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('contract must be an object');
  for (const k of Object.keys(value)) if (!LESSON_CONTRACT_KEYS.has(k)) throw new Error('contract contains unsupported field: ' + k);
  if (value.schemaVersion !== 1) throw new Error('contract.schemaVersion must be 1');
  const scope = value.scope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).some(k => !['type','id'].includes(k))) throw new Error('contract.scope must contain type and optional id');
  if (!['global','customer','project'].includes(scope.type)) throw new Error('contract.scope.type must be global, customer, or project');
  let scopeId = null;
  if (scope.type === 'global') { if (scope.id != null) throw new Error('global scope must not include an id'); }
  else { scopeId = cleanText(scope.id, 'contract.scope.id', true, redact); if (scopeId.length > 120) throw new Error('contract.scope.id must be at most 120 characters'); }
  const sourceRefs = cleanList(value.sourceRefs, 'contract.sourceRefs', redact);
  const uncertainty = cleanText(value.uncertainty, 'contract.uncertainty', true, redact);
  const confidence = value.confidence == null ? null : value.confidence;
  if (confidence !== null && (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error('contract.confidence must be between 0 and 1 or null');
  const version = cleanText(value.version, 'contract.version', true, redact);
  if (version.length > 80) throw new Error('contract.version must be at most 80 characters');
  const date = (v, field) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(field + ' must be a valid YYYY-MM-DD date');
    const d = new Date(v + 'T00:00:00.000Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== v) throw new Error(field + ' must be a valid YYYY-MM-DD date');
    return v;
  };
  const recheckAt = date(value.recheckAt, 'contract.recheckAt'), expiresAt = date(value.expiresAt, 'contract.expiresAt');
  if (expiresAt < recheckAt) throw new Error('contract.expiresAt must be on or after recheckAt');
  const positiveExamples = cleanList(value.positiveExamples, 'contract.positiveExamples', redact);
  const negativeExamples = cleanList(value.negativeExamples, 'contract.negativeExamples', redact);
  if (!positiveExamples.length || !negativeExamples.length) throw new Error('contract requires at least one positive and one negative example');
  return { schemaVersion:1, scope:{type:scope.type, ...(scopeId == null ? {} : {id:scopeId})}, sourceRefs, uncertainty, confidence, version, recheckAt, expiresAt, positiveExamples, negativeExamples, trust:'unverified', authority:'reference-only' };
}
// One recovery-aware read seam is shared by the model tool and the operator's read-only Memory Core view.
// Missing history is an honest empty list; corrupt/unreadable/malformed durable state always throws.
function readDecisionRows(store, agentId) {
  if (!store || typeof store.readKey !== 'function') throw new Error('decision history requires recovery-aware readKey');
  const result = store.readKey('decisions:' + (agentId || 'agent'));
  // A failed main file may have been quarantined by the durable store, which re-reads as absent.
  // Keep that recovery evidence loud instead of presenting a damaged history as a confirmed empty one.
  if (result.status === 'absent' && !result.quarantined) return [];
  if (result.status !== 'ok' && result.status !== 'recovered') throw new Error('decision history unavailable: durable store is ' + result.status);
  if (!Array.isArray(result.value)) throw new Error('decision history unavailable: stored value is malformed');
  if (result.value.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw new Error('decision history unavailable: stored row is malformed');
  return result.value;
}
function makeDecisionTools(deps) {
  deps = deps || {};
  const store = deps.store;
  const clock = deps.clock || { now: () => 0 };
  const redact = typeof deps.redact === 'function' ? deps.redact : (s => s);
  const proposeLesson = typeof deps.proposeLesson === 'function' ? deps.proposeLesson : null;
  if (!store || typeof store.get !== 'function' || typeof store.update !== 'function') throw new Error('decision tools require durable memory store');
  const key = aid => 'decisions:' + (aid || 'agent');
  function rows(aid) { return readDecisionRows(store, aid); }
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
  const lessonTool = {
    name:'decision.lesson_propose', capability:'memory', scope:'write', requiresConsent:false,
    description:'Propose a reviewable reference-only lesson candidate from one of your persisted decision outcome events. Decision/outcome IDs must resolve in your own history; source text and evidence references are attached from that history. Candidate remains unconfirmed until the Commander reviews it in Memory Core. This never saves a memory or skill.',
    schema:{ type:'object', required:['decisionId','outcomeEventId','lesson'], properties:{
      decisionId:{type:'string'}, outcomeEventId:{type:'string'}, lesson:{type:'string',description:'A concise lesson candidate for review, not an instruction or executable procedure.'}
      ,contract:{type:'object',additionalProperties:false,description:'Optional typed candidate contract. Structured candidates remain pending review; Keep is not yet supported.',required:['schemaVersion','scope','sourceRefs','uncertainty','confidence','version','recheckAt','expiresAt','positiveExamples','negativeExamples'],properties:{
        schemaVersion:{type:'integer',enum:[1]}, scope:{type:'object',additionalProperties:false,required:['type'],properties:{type:{type:'string',enum:['global','customer','project']},id:{type:'string',maxLength:120,description:'Required for customer or project scope; forbidden for global.'}}},
        sourceRefs:{type:'array',maxItems:12,items:{type:'string',maxLength:1000}}, uncertainty:{type:'string',maxLength:1000}, confidence:{type:['number','null'],minimum:0,maximum:1}, version:{type:'string',maxLength:80},
        recheckAt:{type:'string',format:'date'}, expiresAt:{type:'string',format:'date'}, positiveExamples:{type:'array',minItems:1,maxItems:12,items:{type:'string',maxLength:1000}}, negativeExamples:{type:'array',minItems:1,maxItems:12,items:{type:'string',maxLength:1000}}
      }}
    } },
    run: async (args, ctx) => {
      if (!proposeLesson) throw new Error('lesson proposal review is unavailable');
      const aid = ctx && ctx.agentId || 'agent';
      const decisionId = cleanText(args && args.decisionId, 'decisionId', true, redact);
      const outcomeEventId = cleanText(args && args.outcomeEventId, 'outcomeEventId', true, redact);
      const lesson = cleanText(args && args.lesson, 'lesson', true, redact);
      const lessonContract = args && args.contract == null ? null : cleanLessonContract(args.contract, redact);
      let decision, outcome;
      const found = rows(aid).find(r => r && r.id === decisionId);
      if (!found) throw new Error('decision not found for this agent');
      decision = found;
      outcome = (Array.isArray(decision.outcomeEvents) ? decision.outcomeEvents : []).find(e => e && e.eventId === outcomeEventId);
      if (!outcome) throw new Error('outcome event not found on that decision');
      if (outcome.source !== 'model' || outcome.trust !== 'unconfirmed') throw new Error('outcome event has invalid or unsupported provenance');
      const combinedRefs = [...new Set([...(Array.isArray(decision.evidenceRefs) ? decision.evidenceRefs : []), ...(Array.isArray(outcome.evidenceRefs) ? outcome.evidenceRefs : [])])];
      if (combinedRefs.length > MAX_ITEMS * 2 || combinedRefs.some(ref => typeof ref !== 'string' || ref.length > MAX_TEXT)) throw new Error('combined source evidence references exceed the lesson proposal bounds');
      let prior = null;
      await store.update(key(aid), cur => {
        const list = Array.isArray(cur) ? cur.slice() : [];
        const i = list.findIndex(r => r && r.id === decisionId);
        if (i < 0) throw new Error('decision disappeared before lesson proposal was staged');
        const rec = Object.assign({}, list[i]);
        const proposals = Array.isArray(rec.lessonProposals) ? rec.lessonProposals.slice() : [];
        const pi = proposals.findIndex(p => p && p.outcomeEventId === outcomeEventId);
        if (pi >= 0) {
          prior = proposals[pi];
          if (prior.lesson !== lesson || JSON.stringify(prior.contract || null) !== JSON.stringify(lessonContract)) throw new Error('this outcome already has a different lesson candidate');
          if (prior.status === 'discarded') throw new Error('this lesson candidate was discarded and cannot be proposed again');
          if (prior.status === 'kept') throw new Error('this lesson candidate was already reviewed and kept');
          if (prior.status === 'pending') return undefined;
        } else { prior = { outcomeEventId, lesson, ...(lessonContract ? {contract:lessonContract} : {}), status:'staging', createdAt:Number(clock.now()) || 0 }; proposals.push(prior); }
        rec.lessonProposals = proposals; list[i] = rec; return list;
      });
      // Re-run the idempotent queue callback even for a pending receipt: the row may have been lost to a legacy FIFO rewrite.
      const result = await proposeLesson({
        agentId: aid, decisionId, outcomeEventId, lesson,
        sourceDecision: cleanText(String(decision.decision || ''), 'source decision', true, redact),
        sourceOutcome: cleanText(String(outcome.outcome || ''), 'source outcome', true, redact),
        evidenceRefs: combinedRefs.map((ref,i) => cleanText(ref, 'evidenceRefs[' + i + ']', true, redact)),
        uncertainty: cleanText(String(decision.uncertainty || 'unknown'), 'uncertainty', true, redact), lessonContract
      });
      if (!result || !result.ok) throw new Error(result && result.error || 'could not queue lesson candidate');
      await store.update(key(aid), cur => {
        const list = Array.isArray(cur) ? cur.slice() : [];
        const i = list.findIndex(r => r && r.id === decisionId);
        if (i < 0) throw new Error('decision disappeared before lesson receipt was saved');
        const rec = Object.assign({}, list[i]);
        const proposals = Array.isArray(rec.lessonProposals) ? rec.lessonProposals.slice() : [];
        const pi = proposals.findIndex(p => p && p.outcomeEventId === outcomeEventId);
        if (pi < 0) proposals.push({ outcomeEventId, lesson, ...(lessonContract ? {contract:lessonContract} : {}), status:'pending', createdAt:Number(clock.now()) || 0 });
        else if (proposals[pi].status === 'staging') proposals[pi] = Object.assign({}, proposals[pi], { ...(lessonContract ? {contract:lessonContract} : {}), status:'pending' });
        else if (proposals[pi].status === 'kept' || proposals[pi].status === 'discarded') return undefined;
        rec.lessonProposals = proposals; list[i] = rec; return list;
      });
      return { content:'Queued an unverified lesson candidate for Memory Core review. No memory or skill was saved.', summary:'lesson awaiting review' };
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
  return { recordTool, outcomeTool, lessonTool, listTool, register(reg) { reg.register(recordTool); reg.register(outcomeTool); reg.register(lessonTool); reg.register(listTool); return reg; } };
}
module.exports = { makeDecisionTools, readDecisionRows, lessonSourceKey, MAX_RECORDS, MAX_OUTCOME_EVENTS, MAX_TEXT, MAX_ITEMS, PAGE_DEFAULT, PAGE_MAX };
