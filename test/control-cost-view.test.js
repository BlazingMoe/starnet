'use strict';
const A=require('./_assert.js');
const {projectCostOverview}=require('../sidecar/control/cost-view.js');

const roster=new Map([['agent',{name:'Commander'}],['worker',{name:'Worker'}]]);
const rows=[
  {runId:'r1',agentId:'agent',usd:1.5,tokens:1000,model:'m1',unmetered:false},
  {runId:'r2',agentId:'agent',usd:2.0,tokens:500,model:'m1',unmetered:true},
  {runId:'r3',agentId:'worker',usd:.5,tokens:250,model:'m2',unmetered:false},
  {runId:'r4',agentId:'deleted',usd:.25,tokens:100,model:'m2',unmetered:false}
];
const out=projectCostOverview(rows,roster,{live:.2,day:{usd:2.45,cap:10,base:10},global:{usd:2.25,cap:100,base:100}},{perRun:2,perAgent:20,perDay:10,global:100});
A.eq(out.schemaVersion,'moe.control-costs.v1','cost projection is versioned');
A.eq(out.totals.runs,4,'all ledger runs are counted');
A.eq(out.totals.meteredUsd,2.25,'unmetered subscription estimates do not count as charged USD');
A.eq(out.totals.reportedUsd,4.25,'provider-reported amount remains separately observable');
A.eq(out.totals.unmeteredRuns,1,'unmetered runs remain visible as work');
A.eq(out.liveUsd,.2,'live governor spend is preserved separately');
A.ok(Math.abs(out.budgets.day.fraction - .245) < 1e-12, 'day pool fraction uses the governor status');
A.eq(out.budgets.perRun,2,'effective per-run cap is projected');
A.eq(out.agents.length,3,'historical deleted-agent spend is not erased by current roster');
A.eq(out.agents.find(a=>a.agentId==='deleted').current,false,'historical agent is marked non-current');
A.eq(out.agents.find(a=>a.agentId==='agent').meteredUsd,1.5,'per-agent charged USD excludes unmetered runs');
A.eq(out.models[0].model,'m1','model aggregates remain available');
A.eq(out.evidence.unmeteredExcludedFromMeteredUsd,true,'money semantics are explicit');
A.report('control-cost-view.test');
