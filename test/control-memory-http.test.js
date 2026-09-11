'use strict';
const A = require('./_assert.js');
const { makeMemoryControlHttp } = require('../sidecar/control/memory-http.js');

const roster = new Map([
  ['agent',{name:'Commander'}],
  ['worker',{name:'Worker'}]
]);
const api = makeMemoryControlHttp({
  roster:()=>roster,
  recordsForAgent(id) {
    if (id === 'worker') throw new Error('store unavailable');
    return [{ id:'m1', body:'never expose', scope:'global', sourceRunId:'run-1', origin:'commander', trust:.5, effectiveTrust:.4 }];
  },
  respondJson(res,code,body){ return {code,body}; }
});

let out = api.serve({method:'GET',url:'/api/control/memory?perAgent=5'},{});
A.eq(out.code,200,'GET returns memory metadata overview');
A.eq(out.body.ok,true,'GET succeeds');
A.eq(out.body.overview.agents[0].known,true,'available agent memory is known');
A.eq(out.body.overview.agents[1].known,false,'per-agent read failure remains partial/unknown');
A.ok(!JSON.stringify(out.body).includes('never expose'),'HTTP projection never includes memory text');

out = api.serve({method:'POST',url:'/api/control/memory'},{});
A.eq(out.code,405,'mutation verb is rejected');
out = api.serve({method:'GET',url:'/api/control/other'},{});
A.eq(out.code,404,'unrelated route is not captured');
A.report('control-memory-http.test');
