/* sidecar/control/cost-http.js — bounded GET-only cost/budget surface for Control Mode. */
'use strict';
const { projectCostOverview } = require('./cost-view.js');

function makeCostControlHttp(opts){
  opts=opts||{};
  const ledgerRows=typeof opts.ledgerRows==='function'?opts.ledgerRows:null;
  const roster=typeof opts.roster==='function'?opts.roster:null;
  const budgetStatus=typeof opts.budgetStatus==='function'?opts.budgetStatus:null;
  const caps=typeof opts.caps==='function'?opts.caps:null;
  const respondJson=opts.respondJson;
  if(!ledgerRows||!roster||!budgetStatus||!caps) throw new Error('cost control http requires ledger, roster, budget status and caps');
  if(typeof respondJson!=='function') throw new Error('cost control http requires respondJson');
  function send(res,code,body){return respondJson(res,code,body);}
  function serve(req,res){
    try{
      const url=new URL(String(req&&req.url||''),'http://127.0.0.1');
      if(url.pathname!=='/api/control/costs') return send(res,404,{ok:false,error:'not found'});
      const method=String(req&&req.method||'GET').toUpperCase();
      if(method!=='GET'&&method!=='HEAD') return send(res,405,{ok:false,error:'read-only endpoint'});
      const overview=projectCostOverview(ledgerRows(),roster(),budgetStatus(),caps());
      return send(res,200,{ok:true,overview});
    }catch(e){
      return send(res,500,{ok:false,error:'could not read cost overview: '+String((e&&e.message)||e)});
    }
  }
  return Object.freeze({serve});
}
module.exports={makeCostControlHttp};
