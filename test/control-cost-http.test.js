'use strict';
const A=require('./_assert.js');
const {makeCostControlHttp}=require('../sidecar/control/cost-http.js');
const api=makeCostControlHttp({
  ledgerRows:()=>[{runId:'r1',agentId:'agent',usd:1,tokens:10,model:'m',unmetered:false}],
  roster:()=>new Map([['agent',{name:'Commander'}]]),
  budgetStatus:()=>({live:.1,day:{usd:1.1,cap:5,base:5},global:{usd:1,cap:20,base:20}}),
  caps:()=>({perRun:2,perAgent:10,perDay:5,global:20}),
  respondJson(res,code,body){return{code,body};}
});
let out=api.serve({method:'GET',url:'/api/control/costs'},{});
A.eq(out.code,200,'GET returns cost dashboard telemetry');
A.eq(out.body.ok,true,'GET succeeds');
A.eq(out.body.overview.totals.meteredUsd,1,'ledger truth reaches endpoint');
out=api.serve({method:'POST',url:'/api/control/costs'},{});
A.eq(out.code,405,'mutation verb is rejected');
out=api.serve({method:'GET',url:'/api/control/other'},{});
A.eq(out.code,404,'unrelated path is not captured');
A.report('control-cost-http.test');
