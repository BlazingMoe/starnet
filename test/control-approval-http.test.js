'use strict';
const A=require('./_assert.js');
const {makeApprovalControlHttp}=require('../sidecar/control/approval-http.js');
const pending=new Map([['prompt-2',{}],['prompt-1',{}]]);
const api=makeApprovalControlHttp({
  grantSnapshot:()=>({grantable:['shell.run'],grants:['shell.run'],meta:{'shell.run':{grantedAt:123}}}),
  consentSnapshot:()=>({session:{s1:['browser.click']}}),
  pending:()=>pending,
  respondJson(res,code,body){return{code,body};}
});
let out=api.serve({method:'GET',url:'/api/control/approvals'},{});
A.eq(out.code,200,'GET returns approval telemetry');
A.eq(out.body.ok,true,'GET succeeds');
A.eq(out.body.overview.mode,'read-only','endpoint preserves read-only contract');
A.eq(out.body.overview.permanent[0].key,'shell.run','standing grant truth reaches endpoint');
A.eq(out.body.overview.sessions[0].grants[0],'browser.click','session grant truth reaches endpoint');
A.eq(out.body.overview.pending[0].promptId,'prompt-1','pending prompts are projected deterministically');
A.eq(out.body.overview.pending[0].agentId,undefined,'endpoint does not invent unavailable prompt metadata');
out=api.serve({method:'POST',url:'/api/control/approvals'},{});
A.eq(out.code,405,'mutation verb is rejected');
out=api.serve({method:'GET',url:'/api/control/other'},{});
A.eq(out.code,404,'unrelated path is not captured');
A.report('control-approval-http.test');
