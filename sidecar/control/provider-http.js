/* sidecar/control/provider-http.js — read-only provider configuration/quota evidence for Control Mode. */
'use strict';
const { projectProviderSignals } = require('./provider-view.js');

function makeProviderControlHttp(opts){
  opts=opts||{};
  const profiles=typeof opts.profiles==='function'?opts.profiles:null;
  const rateLimits=typeof opts.rateLimits==='function'?opts.rateLimits:null;
  const respondJson=opts.respondJson;
  if(!profiles||!rateLimits) throw new Error('provider control http requires profiles and rate-limit snapshot');
  if(typeof respondJson!=='function') throw new Error('provider control http requires respondJson');
  function send(res,code,body){return respondJson(res,code,body);}
  function serve(req,res){
    try{
      const url=new URL(String(req&&req.url||''),'http://127.0.0.1');
      if(url.pathname!=='/api/control/providers') return send(res,404,{ok:false,error:'not found'});
      const method=String(req&&req.method||'GET').toUpperCase();
      if(method!=='GET'&&method!=='HEAD') return send(res,405,{ok:false,error:'read-only endpoint'});
      const overview=projectProviderSignals(profiles(),rateLimits());
      return send(res,200,{ok:true,overview});
    }catch(e){
      return send(res,500,{ok:false,error:'could not read provider signals: '+String((e&&e.message)||e)});
    }
  }
  return Object.freeze({serve});
}
module.exports={makeProviderControlHttp};
