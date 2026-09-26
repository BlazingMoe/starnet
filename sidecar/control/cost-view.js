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
    evidence:{
      ledgerRows:rows.length,
      unmeteredExcludedFromMeteredUsd:true,
      historicalAgentsPreserved:true,
      budgetGovernorKnown:!!(budgetStatus&&typeof budgetStatus==='object')
    }
  };
}
module.exports={aggregate,pool,projectCostOverview};
