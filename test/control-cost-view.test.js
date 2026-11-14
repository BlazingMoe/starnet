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

// Recipe attribution is sourced only from explicit runtime labels. Auxiliary rows on the same run inherit
// the unique label; legacy and conflicting runs remain visible in an unassigned bucket.
const attributed=projectCostOverview([
  {runId:'recipe-run',agentId:'a',recipeId:'explain-data',usd:.1,tokens:10,unmetered:false},
  {runId:'recipe-run',agentId:'a',recipeId:'',usd:.2,tokens:20,unmetered:true},
  {runId:'legacy-run',agentId:'a',recipeId:'',usd:.4,tokens:40,unmetered:false},
  {runId:'conflict-run',agentId:'a',recipeId:'recipe-a',usd:.5,tokens:50,unmetered:false},
  {runId:'conflict-run',agentId:'a',recipeId:'recipe-b',usd:.2,tokens:20,unmetered:false}
],roster,{},{});
A.eq(attributed.recipes.length,1,'one unambiguous recipe is projected');
A.eq(attributed.recipes[0].recipeId,'explain-data','recipe label comes from runtime ledger provenance');
A.eq(attributed.recipes[0].runs,1,'multiple spend rows for one recipe run are counted once');
A.eq(attributed.recipes[0].ledgerRows,2,'all same-run auxiliary spend rows remain included');
A.eq(attributed.recipes[0].meteredUsd,.1,'unmetered recipe spend is excluded from charged USD');
A.ok(Math.abs(attributed.recipes[0].reportedUsd-.3)<1e-12,'provider-reported amount remains observable separately');
A.eq(attributed.recipes[0].tokens,30,'recipe token attribution includes all spend rows');
A.eq(attributed.recipes[0].unmeteredRuns,1,'an unmetered auxiliary row marks its containing recipe run once');
A.eq(attributed.recipes[0].mixedBillingRuns,1,'a run with metered and unmetered spend is explicitly mixed');
A.eq(attributed.unassigned.runs,2,'legacy and ambiguous runs remain separately counted once each');
A.eq(attributed.unassigned.meteredUsd,1.1,'unassigned spend is not dropped or falsely assigned');
A.eq(attributed.evidence.ambiguousRecipeRuns,1,'conflicting labels are surfaced as ambiguous');
A.eq(attributed.evidence.legacyRowsRemainUnassigned,true,'legacy recipe attribution is explicitly unknown');
A.eq(attributed.evidence.recipeGroupsTruncated,false,'the bounded recipe projection reports whether groups were omitted');
const identity=projectCostOverview([
  {runId:'same',agentId:'agent-a',recipeId:'shared-id',usd:.1,unmetered:true},
  {runId:'same',agentId:'agent-b',recipeId:'',usd:.2,unmetered:true},
  {runId:'x'.repeat(120)+'a',agentId:'agent-a',recipeId:'long-a',usd:.3,unmetered:true},
  {runId:'x'.repeat(120)+'b',agentId:'agent-a',recipeId:'long-b',usd:.4,unmetered:true},
  {runId:'unassigned-long-a','agentId':'agent-a',recipeId:'',usd:.5,unmetered:true},
  {runId:'unassigned-long-b','agentId':'agent-a',recipeId:'',usd:.6,unmetered:true}
],roster,{},{});
A.eq(identity.recipes.find(r=>r.recipeId==='shared-id').runs,1,'same runId in distinct agents is not merged into one recipe run');
A.eq(identity.recipes.find(r=>r.recipeId==='shared-id').unmeteredRuns,1,'repeated unmetered rows are deduplicated by agent and run');
A.eq(identity.recipes.find(r=>r.recipeId==='long-a').runs,1,'full run identity keeps long IDs distinct beyond the display-length boundary');
A.eq(identity.recipes.find(r=>r.recipeId==='long-b').runs,1,'a distinct long run does not become ambiguous through truncation');
A.eq(identity.unassigned.runs,3,'unassigned runs deduplicate same-run auxiliary rows while preserving distinct and cross-agent work');
A.eq(identity.unassigned.unmeteredRuns,3,'unassigned unmetered work counts runs, not ledger rows');
A.eq(identity.unassigned.mixedBillingRuns,0,'all-unmetered unassigned runs are not classified as mixed');
const manyRecipes=projectCostOverview(Array.from({length:55},(_,i)=>({runId:'many-'+i,recipeId:'recipe-'+i,usd:.01,tokens:1})),roster,{},{});
A.eq(manyRecipes.recipes.length,50,'recipe projection remains bounded');
A.eq(manyRecipes.evidence.recipeGroups,55,'total attributed group count is preserved');
A.eq(manyRecipes.evidence.recipeGroupsTruncated,true,'truncated recipe groups are explicitly reported');
A.report('control-cost-view.test');
