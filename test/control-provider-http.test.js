'use strict';
const A=require('./_assert.js');
const {makeProviderControlHttp}=require('../sidecar/control/provider-http.js');

function call(handler,method,url){
  let result=null;
  const req={method,url};
  const res={};
  handler.serve(req,res);
  return result;
}

function makeRespond(box){
  return function(_res,code,body){box.code=code;box.body=body;return body;};
}

const profiles=[
  {id:'openrouter',name:'OpenRouter',authType:'api_key',keyRequired:true,unmetered:false,supportsTools:'catalog',supportsReasoning:'catalog'},
  {id:'codex',name:'ChatGPT Codex',authType:'oauth_device_code',keyRequired:false,unmetered:true,supportsTools:true,supportsReasoning:true}
];
const quota=[{provider:'openrouter',observedAt:1000,ageMs:50,buckets:{requests:{limit:100,remaining:9,resetAt:5000,resetInMs:4000,observedAt:1000}}}];

{
  const box={};
  const http=makeProviderControlHttp({profiles:()=>profiles,rateLimits:()=>quota,respondJson:makeRespond(box)});
  http.serve({method:'GET',url:'/api/control/providers'},{});
  A.eq(box.code,200,'GET succeeds');
  A.eq(box.body.ok,true,'GET response is successful');
  A.eq(box.body.overview.schemaVersion,'moe.control-providers.v1','GET returns provider projection');
  A.eq(box.body.overview.rows.length,2,'registry profiles are returned');
  A.eq(box.body.overview.rows.find(r=>r.id==='openrouter').quota.buckets.requests.remaining,9,'real quota evidence is preserved');
  A.eq(box.body.overview.evidence.healthScoreInferred,false,'endpoint does not infer health');
}

for(const method of ['POST','PUT','PATCH','DELETE']){
  const box={};
  const http=makeProviderControlHttp({profiles:()=>profiles,rateLimits:()=>quota,respondJson:makeRespond(box)});
  http.serve({method,url:'/api/control/providers'},{});
  A.eq(box.code,405,method+' is rejected');
}

{
  const box={};
  const http=makeProviderControlHttp({profiles:()=>profiles,rateLimits:()=>quota,respondJson:makeRespond(box)});
  http.serve({method:'HEAD',url:'/api/control/providers'},{});
  A.eq(box.code,200,'HEAD is allowed');
}

{
  const box={};
  const http=makeProviderControlHttp({profiles:()=>{throw new Error('registry unavailable');},rateLimits:()=>quota,respondJson:makeRespond(box)});
  http.serve({method:'GET',url:'/api/control/providers'},{});
  A.eq(box.code,500,'source failure is not rendered as an empty healthy surface');
  A.ok(String(box.body.error).includes('registry unavailable'),'source failure remains explicit');
}

A.throws(()=>makeProviderControlHttp({profiles:()=>profiles,rateLimits:()=>quota}),/respondJson/,'respondJson is required');
A.throws(()=>makeProviderControlHttp({profiles:()=>profiles,respondJson:()=>{}}),/rate-limit snapshot/,'rate-limit source is required');
A.report('control-provider-http.test');
