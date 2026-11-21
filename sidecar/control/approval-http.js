/* sidecar/control/approval-http.js — bounded GET-only permission/approval surface for Control Mode. */
'use strict';
const { projectApprovalCenter } = require('./approval-view.js');

function makeApprovalControlHttp(opts){
  opts=opts||{};
  const grantSnapshot=typeof opts.grantSnapshot==='function'?opts.grantSnapshot:null;
  const consentSnapshot=typeof opts.consentSnapshot==='function'?opts.consentSnapshot:null;
  const pending=typeof opts.pending==='function'?opts.pending:null;
  const respondJson=opts.respondJson;
  if(!grantSnapshot||!consentSnapshot||!pending) throw new Error('approval control http requires grant, consent and pending sources');
  if(typeof respondJson!=='function') throw new Error('approval control http requires respondJson');
  function send(res,code,body){return respondJson(res,code,body);}
  function serve(req,res){
    try{
      const url=new URL(String(req&&req.url||''),'http://127.0.0.1');
      if(url.pathname!=='/api/control/approvals') return send(res,404,{ok:false,error:'not found'});
      const method=String(req&&req.method||'GET').toUpperCase();
      if(method!=='GET'&&method!=='HEAD') return send(res,405,{ok:false,error:'read-only endpoint'});
      const overview=projectApprovalCenter(grantSnapshot(),consentSnapshot(),pending());
      return send(res,200,{ok:true,overview});
    }catch(e){
      return send(res,500,{ok:false,error:'could not read approval overview: '+String((e&&e.message)||e)});
    }
  }
  return Object.freeze({serve});
}

module.exports={makeApprovalControlHttp};
