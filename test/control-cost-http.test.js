'use strict';
const A=require('./_assert.js');
const {makeCostControlHttp}=require('../sidecar/control/cost-http.js');
const api=makeCostControlHttp({
  ledgerRows:()=>[
    {runId:'r1',agentId:'agent',recipeId:'decision-dossier',usd:1,tokens:10,model:'m',unmetered:false},
    {runId:'r1',agentId:'agent',recipeId:'',usd:.2,tokens:2,model:'aux',unmetered:true},
    {runId:'legacy',agentId:'agent',recipeId:'',usd:.4,tokens:4,model:'m',unmetered:false}
  ],
  roster:()=>new Map([['agent',{name:'Commander'}]]),
  budgetStatus:()=>({live:.1,day:{usd:1.1,cap:5,base:5},global:{usd:1,cap:20,base:20}}),
  caps:()=>({perRun:2,perAgent:10,perDay:5,global:20}),
  respondJson(res,code,body){return{code,body};}
});
let out=api.serve({method:'GET',url:'/api/control/costs'},{});
A.eq(out.code,200,'GET returns cost dashboard telemetry');
A.eq(out.body.ok,true,'GET succeeds');
A.eq(out.body.overview.totals.meteredUsd,1.4,'ledger truth reaches endpoint');
A.eq(out.body.overview.recipes[0].recipeId,'decision-dossier','runtime recipe attribution reaches endpoint');
A.eq(out.body.overview.recipes[0].runs,1,'same-run auxiliary spend does not inflate attributed run count');
A.ok(Math.abs(out.body.overview.recipes[0].reportedUsd-1.2)<1e-12,'reported and metered recipe amounts remain distinct');
A.eq(out.body.overview.unassigned.runs,1,'legacy spend is exposed without inferred recipe metadata');
out=api.serve({method:'POST',url:'/api/control/costs'},{});
A.eq(out.code,405,'mutation verb is rejected');
out=api.serve({method:'GET',url:'/api/control/other'},{});
A.eq(out.code,404,'unrelated path is not captured');
A.report('control-cost-http.test');
