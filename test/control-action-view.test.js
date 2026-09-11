'use strict';
const A=require('./_assert.js');
const {projectRun,projectActionTrace}=require('../sidecar/control/action-view.js');

const states=[
  {
    runId:'run-new',status:'resumable',corrupt:false,
    meta:{agentId:'worker',startedAt:200,trigger:'manual',model:'private-model',userTitle:'private task'},
    completed:[{
      intent:{callId:'c1',name:'fs.read',argsRaw:'{"path":"/secret/workspace.txt","token":"do-not-leak"}',replayFingerprint:'secret-fingerprint',mutating:false},
      dispatch:{callId:'c1',name:'fs.read',replayFingerprint:'secret-fingerprint',mutating:false},
      result:{callId:'c1',ok:true,isError:false,content:'private file contents',summary:'read complete'}
    }],
    replayablePrepared:[{callId:'c2',name:'browser.open',argsRaw:'{"url":"https://example.test/private"}',mutating:false,boundaryModel:'prepared-dispatch-v1'}],
    replayableReads:[{callId:'c3',name:'web.fetch',argsRaw:'{"authorization":"Bearer secret"}',mutating:false}],
    uncertain:[{callId:'c4',name:'fs.write',argsRaw:'{"path":"/private","content":"secret"}',mutating:true}],
    checkpoint:{messages:[{role:'user',content:'never expose me'}]},
    hash:'journal-secret'
  },
  {
    runId:'run-old',status:'finished',corrupt:true,
    meta:{agentId:'commander',startedAt:100,trigger:'schedule'},
    completed:[{intent:{callId:'old1',name:'web.fetch',mutating:false},result:{callId:'old1',ok:false,isError:true,summary:'network error',content:'raw error detail'}}],
    replayablePrepared:[],replayableReads:[],uncertain:[]
  }
];

const projected=projectRun(states[0]);
A.eq(projected.length,4,'all journal-backed action states are projected');
A.eq(projected.find(r=>r.callId==='c1').phase,'completed','completed boundary remains explicit');
A.eq(projected.find(r=>r.callId==='c1').ok,true,'journal result success is preserved');
A.eq(projected.find(r=>r.callId==='c2').phase,'prepared','prepared but undispatched intent stays distinct');
A.eq(projected.find(r=>r.callId==='c3').phase,'dispatched','dispatched replayable read stays distinct');
A.eq(projected.find(r=>r.callId==='c4').phase,'needs_review','uncertain mutation stays review-required');
A.eq(projected.find(r=>r.callId==='c4').mutating,true,'real mutation classification is preserved');

const out=projectActionTrace({rows:states,total:9},{limit:3});
A.eq(out.schemaVersion,'moe.control-actions.v1','action trace projection is versioned');
A.eq(out.rows.length,3,'response is bounded');
A.eq(out.rows[0].runId,'run-new','newer journal runs sort first using authoritative run startedAt');
A.eq(out.evidence.source,'run-journal','durable journal is named as the source');
A.eq(out.evidence.journalRuns,2,'source run count is explicit');
A.eq(out.evidence.journalTotal,9,'upstream journal total is preserved without guessing');
A.eq(out.evidence.bounded,true,'truncation is explicit');
A.eq(out.evidence.argumentsExposed,false,'tool arguments are explicitly excluded');
A.eq(out.evidence.resultContentExposed,false,'raw tool results are explicitly excluded');
A.eq(out.evidence.replayFingerprintsExposed,false,'recovery fingerprints are explicitly excluded');
A.eq(out.evidence.mutationsExposed,false,'projection is read-only');

const serialized=JSON.stringify(out);
for(const forbidden of ['do-not-leak','/secret/workspace.txt','private file contents','secret-fingerprint','example.test/private','Bearer secret','never expose me','private-model','private task','raw error detail','journal-secret']) {
  A.ok(!serialized.includes(forbidden),'sensitive journal field must not leak: '+forbidden);
}
A.ok(!Object.prototype.hasOwnProperty.call(out.rows[0],'ts'),'per-action timestamp is not invented when analyzed journal state does not expose one');
A.ok(!Object.prototype.hasOwnProperty.call(out.rows[0],'ms'),'duration is not invented when durable journal state does not expose one');
A.report('control-action-view.test');
