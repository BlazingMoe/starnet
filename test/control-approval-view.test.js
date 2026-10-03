'use strict';
const assert = require('assert');
const { projectApprovalCenter } = require('../sidecar/control/approval-view.js');

(function projectsOnlyAuthoritativeApprovalState(){
  const grants={
    grants:['workbench:execute','cabinet:write'],
    grantable:['cabinet:write'],
    meta:{
      'cabinet:write':{grantedAt:1710000000000},
      'workbench:execute':{grantedAt:null},
      'orphan:write':{grantedAt:1}
    }
  };
  const consent={
    permanent:['cabinet:write','workbench:execute'],
    session:{'run-b':['memory:write'],'run-a':['browser:read','cabinet:write']}
  };
  const pending=new Map([
    ['prompt-z',()=>{}],
    ['prompt-a',()=>{}]
  ]);
  const view=projectApprovalCenter(grants,consent,pending);

  assert.equal(view.schemaVersion,'moe.control-approvals.v1');
  assert.equal(view.mode,'read-only');
  assert.deepEqual(view.permanent,[
    {key:'cabinet:write',grantable:true,grantedAt:1710000000000},
    {key:'workbench:execute',grantable:false,grantedAt:null}
  ]);
  assert.deepEqual(view.sessions,[
    {sessionId:'run-a',grants:['browser:read','cabinet:write']},
    {sessionId:'run-b',grants:['memory:write']}
  ]);
  assert.deepEqual(view.pending,[{promptId:'prompt-a'},{promptId:'prompt-z'}]);
  assert.deepEqual(view.evidence,{
    standingGrantSource:'permgrants.snapshot',
    sessionGrantSource:'permissions.snapshot',
    pendingSource:'consentwait.pending',
    pendingDetailsAvailable:false,
    mutationsExposed:false
  });
  assert.equal(JSON.stringify(view).includes('orphan:write'),false);
})();

(function failsSoftWithoutOptionalState(){
  const view=projectApprovalCenter(null,null,null);
  assert.deepEqual(view.permanent,[]);
  assert.deepEqual(view.sessions,[]);
  assert.deepEqual(view.pending,[]);
  assert.equal(view.evidence.pendingDetailsAvailable,false);
  assert.equal(view.evidence.mutationsExposed,false);
})();

console.log('control-approval-view: ok');
