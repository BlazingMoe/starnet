'use strict';
const A = require('./_assert.js');
const { makeDecisionHistoryHttp } = require('../sidecar/control/decision-history-http.js');

const rows = [
  { id:'d-old', decision:'old choice', alternatives:[], evidenceRefs:[], uncertainty:'unknown', confidence:null, createdAt:10, source:'model', trust:'unconfirmed', outcomeStatus:'pending', outcomeEvents:[] },
  { id:'d-new', decision:'sk-secret choose B', alternatives:['A'], evidenceRefs:['report:1'], uncertainty:'small sample', confidence:0.7, createdAt:20, source:'model', trust:'unconfirmed', outcomeStatus:'recorded',
    outcomeEvents:[{eventId:'o1',outcome:'sk-secret success claim',evidenceRefs:['run:1'],createdAt:30,source:'model',trust:'unconfirmed'}],
    lessonProposals:[
      {outcomeEventId:'o1',lesson:'candidate pending',status:'pending',createdAt:31,contract:{schemaVersion:1,scope:{type:'customer',id:'cust-1'},sourceRefs:['sk-secret:source'],uncertainty:'single run',confidence:null,version:'v1',recheckAt:'2026-11-01',expiresAt:'2026-12-01',positiveExamples:['<script>'],negativeExamples:['other customer'],trust:'trusted',authority:'execute'}} ,
      {outcomeEventId:'o2',lesson:'candidate staged',status:'staging',createdAt:32},
      {outcomeEventId:'o6',lesson:'candidate Keep recovery in progress',status:'reviewing-kept',createdAt:36},
      {outcomeEventId:'o3',lesson:'candidate kept',status:'kept',createdAt:33},
      {outcomeEventId:'o4',lesson:'candidate discarded',status:'discarded',createdAt:34},
      {outcomeEventId:'o5',lesson:'legacy unknown state',status:'auto-approved',createdAt:35}
    ], arbitrarySecretField:'MUST NOT LEAK'
  }
];
const requested = [];
const api = makeDecisionHistoryHttp({
  readForAgent(agentId) { requested.push(agentId); if (agentId === 'broken') throw new Error('disk path or details stay server-side'); if (agentId === 'malformed') return [{decision:'record without identity'}]; return agentId === 'fresh' ? [] : rows; },
  redact(value) { return String(value).replace('sk-secret', '[redacted]'); },
  respondJson(_res, code, body) { return { code, body }; }
});
const get = url => api.serve({method:'GET',url},{});

let result = get('/api/memory/decisions?agent=agent&limit=1');
A.eq(result.code,200,'selected-agent read returns a bounded history page');
A.eq(requested[0],'agent','reader is called only for the requested Memory Core agent');
A.eq(result.body.agentId,'agent','page identifies the selected agent');
A.eq(result.body.total,2,'page reports the authoritative total');
A.eq(result.body.records[0].id,'d-new','newest decisions appear first');
A.eq(result.body.hasMore,true,'partial page clearly advertises more history');
A.eq(result.body.records[0].decision,'[redacted] choose B','redaction is applied before returning model text');
A.eq(result.body.records[0].outcomeEvents[0].outcome,'[redacted] success claim','outcome text is redacted too');
A.eq(result.body.records[0].confidence,0.7,'known confidence is preserved');
A.eq(result.body.records[0].trust,'unconfirmed','model trust is not promoted');
A.eq(result.body.records[0].lessonProposals.map(p=>p.status).join(','),'unknown,discarded,kept,reviewing-kept,staging,pending','lesson review and recovery states remain distinct; unsupported state is unknown');
A.eq(result.body.records[0].lessonProposals[5].contract.scope.id,'cust-1','typed candidate scope is projected for operator review');
A.eq(result.body.records[0].lessonProposals[5].contract.trust,'unverified','typed candidate trust cannot be promoted by stored metadata');
A.eq(result.body.records[0].lessonProposals[5].contract.authority,'reference-only','typed candidate authority is forcibly reference-only');
A.eq(result.body.records[0].lessonProposals[5].contract.sourceRefs[0],'[redacted]:source','typed source refs are redacted');
A.ok(!JSON.stringify(result.body.records[0].lessonProposals[5].contract).includes('execute'),'stored contract cannot grant executable authority');
A.ok(!JSON.stringify(result.body).includes('MUST NOT LEAK'),'projection drops arbitrary/unrecognized stored properties');
A.ok(!JSON.stringify(result.body).includes('sk-secret'),'redaction covers every text field returned');

result = get('/api/memory/decisions?agent=agent&limit=1&offset=1');
A.eq(result.body.records[0].id,'d-old','pagination reaches the older decision');
A.eq(result.body.records[0].confidence,null,'missing confidence remains unknown rather than zero');
A.eq(result.body.hasMore,false,'final page advertises completion');
result = get('/api/memory/decisions?agent=fresh');
A.eq(result.code,200,'a genuinely absent durable key is readable');
A.eq(result.body.records.length,0,'a new agent reports an honest empty history');
result = get('/api/memory/decisions?agent=broken');
A.eq(result.code,500,'unreadable/corrupt history is not presented as empty');
A.eq(result.body.code,'EDECISION_HISTORY_UNAVAILABLE','history failure has a stable error code');
A.ok(!JSON.stringify(result.body).includes('disk path'),'internal storage failure details are not reflected to the client');
A.eq(get('/api/memory/decisions?agent=malformed').code,500,'malformed legacy rows are not silently omitted from an apparently complete timeline');
A.eq(get('/api/memory/decisions?agent=..%2Fetc').code,403,'path traversal agent IDs are rejected');
A.eq(get('/api/memory/decisions?agent=agent&limit=51').code,400,'oversized pages are rejected');
A.eq(get('/api/memory/decisions?agent=agent&limit=11').code,400,'nested decision evidence keeps the HTTP page within its stricter size bound');
A.eq(get('/api/memory/decisions?agent=agent&offset=201').code,400,'out-of-range offsets are rejected');
A.eq(api.serve({method:'POST',url:'/api/memory/decisions?agent=agent'},{}).code,405,'endpoint has no mutation verb');
A.eq(api.serve({method:'GET',url:'/api/memory/records?agent=agent'},{}).code,404,'endpoint does not capture neighboring routes');
A.report('decision-history-http.test');
