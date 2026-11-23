/* sidecar/control/cost-view.js — pure Control Mode cost/budget projection.
   Uses the durable spend ledger plus the existing budget governor status. Subscription/unmetered
   rows count as work/tokens but never as charged USD, matching ledger.js and budget.js. */
'use strict';

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0; }
function text(v, max) { const s=v==null?'':String(v).trim(); return s ? s.slice(0,max||200) : ''; }
function rosterMap(roster) {
  if (roster instanceof Map) return new Map(roster);
  if (roster && typeof roster === 'object') return new Map(Object.keys(roster).map(k=>[k,roster[k]]));
  return new Map();
}
function money(v) { return Math.max(0,num(v)); }
function recipeId(v) { return text(v,120).replace(/[\u0000-\u001f\u007f]/g,''); }
function pool(row) {
  if (!row || typeof row !== 'object') return null;
  const usd=money(row.usd), cap=money(row.cap), base=money(row.base);
  return { usd, cap, base, fraction: cap > 0 ? Math.max(0,usd/cap) : null };
}
function aggregate(rows) {
  const out={runs:0,meteredUsd:0,reportedUsd:0,tokens:0,unmeteredRuns:0};
  for(const r of rows){
    if(!r||typeof r!=='object') continue;
    out.runs++;
    const usd=money(r.usd);
    out.reportedUsd+=usd;
    if(r.unmetered===true) out.unmeteredRuns++; else out.meteredUsd+=usd;
    out.tokens+=Math.max(0,Math.floor(num(r.tokens)));
  }
  return out;
}
// runId is opaque runtime identity: never truncate it for grouping. Pair it with agentId so an
// accidentally reused/cross-agent ID cannot merge runs; anonymous ledger rows stay individually countable.
function runIdentity(r) {
  const runId=r&&r.runId!=null?String(r.runId):'';
  if(!runId) return '';
  const agentId=r&&r.agentId!=null?String(r.agentId):'';
  return JSON.stringify([agentId,runId]);
}
function runBillingStats(rows) {
  const runs=new Set(), states=new Map(); let anonymous=0, anonymousUnmetered=0;
  for(const r of rows){
    if(!r||typeof r!=='object') continue;
    const identity=runIdentity(r), isUnmetered=r.unmetered===true;
    if(!identity){anonymous++;if(isUnmetered)anonymousUnmetered++;continue;}
    runs.add(identity);
    const state=states.get(identity)||{metered:false,unmetered:false};
    if(isUnmetered)state.unmetered=true;else state.metered=true;
    states.set(identity,state);
  }
  let unmeteredRuns=anonymousUnmetered,mixedBillingRuns=0;
  for(const state of states.values()){
    if(state.unmetered)unmeteredRuns++;
    if(state.unmetered&&state.metered)mixedBillingRuns++;
  }
  return {runs:runs.size+anonymous,unmeteredRuns,mixedBillingRuns};
}
function projectCostOverview(ledgerRows, roster, budgetStatus, caps) {
  const rows=Array.isArray(ledgerRows)?ledgerRows:[];
  const current=rosterMap(roster);
  const ids=new Set([...current.keys()]);
  for(const r of rows){const id=text(r&&r.agentId,80);if(id)ids.add(id);}
  const agents=[];
  for(const id of ids){
    const agentRows=rows.filter(r=>text(r&&r.agentId,80)===id);
    const sums=aggregate(agentRows);
    const rec=current.get(id)||{};
    agents.push(Object.assign({
      agentId:id,
      name:text(rec&&rec.name,120)||id,
      current:current.has(id)
    },sums));
  }
  agents.sort((a,b)=>(b.meteredUsd-a.meteredUsd)||(b.runs-a.runs)||a.name.localeCompare(b.name)||a.agentId.localeCompare(b.agentId));

  const models=new Map();
  for(const r of rows){
    if(!r||typeof r!=='object') continue;
    const model=text(r.model,100)||'(unknown)';
    const list=models.get(model)||[];
    list.push(r);models.set(model,list);
  }
  const modelRows=Array.from(models.entries()).map(([model,list])=>Object.assign({model},aggregate(list)))
    .sort((a,b)=>(b.meteredUsd-a.meteredUsd)||(b.runs-a.runs)||a.model.localeCompare(b.model))
    .slice(0,20);

  // Attribute rows only from the runtime-stamped recipeId. A legacy row with no recipeId may inherit the
  // metadata from another ledger row for the same agent/run (for example an auxiliary pass); conflicting
  // labels make that run unattributed instead of guessing. Cost/token values are still summed from every row.
  const recipeIdsByRun = new Map();
  for (const r of rows) {
    const identity=runIdentity(r), id=recipeId(r&&r.recipeId);
    if (!identity || !id) continue;
    const ids=recipeIdsByRun.get(identity)||new Set(); ids.add(id); recipeIdsByRun.set(identity,ids);
  }
  const recipeGroups=new Map(), unattributed=[], conflictingRunIds=new Set();
  rows.forEach(r=>{
    if(!r||typeof r!=='object') return;
    const identity=runIdentity(r), own=recipeId(r.recipeId), candidates=identity&&recipeIdsByRun.get(identity);
    if(candidates&&candidates.size>1){conflictingRunIds.add(identity);unattributed.push(r);return;}
    const id=own||(candidates&&candidates.size===1?candidates.values().next().value:'');
    if(!id){unattributed.push(r);return;}
    const group=recipeGroups.get(id)||{rows:[]}; group.rows.push(r);
    recipeGroups.set(id,group);
  });
  const recipeStats=rows=>Object.assign(aggregate(rows),runBillingStats(rows),{ledgerRows:rows.length});
  const recipes=Array.from(recipeGroups.entries()).map(([id,group])=>Object.assign({recipeId:id},recipeStats(group.rows)))
    .sort((a,b)=>(b.meteredUsd-a.meteredUsd)||(b.runs-a.runs)||a.recipeId.localeCompare(b.recipeId)).slice(0,50);
  const unassigned=recipeStats(unattributed);

  const status=budgetStatus&&typeof budgetStatus==='object'?budgetStatus:{};
  const effective=caps&&typeof caps==='object'?caps:{};
  const totals=aggregate(rows);
  return {
    schemaVersion:'moe.control-costs.v1',
    totals,
    liveUsd:money(status.live),
    budgets:{
      perRun:money(effective.perRun),
      perAgent:money(effective.perAgent),
      perDay:money(effective.perDay),
      globalCap:money(effective.global),
      day:pool(status.day),
      global:pool(status.global)
    },
    agents,
    models:modelRows,
    recipes,
    unassigned,
    evidence:{
      ledgerRows:rows.length,
      unmeteredExcludedFromMeteredUsd:true,
      historicalAgentsPreserved:true,
      recipeAttributionSource:'runtime-recipe-id',
      recipeBillingSemantics:'Amounts sum each ledger row; runs deduplicate by agentId+runId. An unmetered run has at least one unmetered row; mixedBillingRuns counts runs with both metered and unmetered rows.',
      recipeGroups:recipeGroups.size,
      recipeGroupsTruncated:recipeGroups.size>50,
      legacyRowsRemainUnassigned:true,
      ambiguousRecipeRuns:conflictingRunIds.size,
      budgetGovernorKnown:!!(budgetStatus&&typeof budgetStatus==='object')
    }
  };
}
module.exports={aggregate,pool,projectCostOverview};
