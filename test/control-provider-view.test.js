'use strict';
const A=require('./_assert.js');
const {projectProviderSignals}=require('../sidecar/control/provider-view.js');

const profiles=[
  {id:'openrouter',name:'OpenRouter',authType:'api_key',keyRequired:true,unmetered:false,supportsTools:'catalog',supportsReasoning:'catalog',live:true,baseUrl:'https://openrouter.ai/api/v1'},
  {id:'codex',name:'ChatGPT Codex',authType:'oauth_device_code',keyRequired:false,unmetered:true,supportsTools:true,supportsReasoning:true,live:true},
  {id:'starnet',name:'StarNet Managed',authType:'api_key',keyRequired:true,requiresBaseUrl:true,unmetered:false,supportsTools:null,supportsReasoning:null,live:true}
];

const quota=[{
  provider:'openrouter',model:'model-a',observedAt:1000,ageMs:250,
  buckets:{requests:{limit:100,remaining:12,resetAt:5000,resetInMs:4000,observedAt:1000}}
}];

const out=projectProviderSignals(profiles,quota);
A.eq(out.schemaVersion,'moe.control-providers.v1','provider projection is versioned');
A.eq(out.rows.length,3,'all registry profiles are projected');
A.eq(out.evidence.profileSource,'provider-registry','registry metadata source is explicit');
A.eq(out.evidence.quotaSource,'providers-ratelimits','runtime quota source is explicit');
A.eq(out.evidence.quotaObservedProviders,1,'only actually observed quota providers are counted');

const or=out.rows.find(r=>r.id==='openrouter');
A.eq(or.quotaObserved,true,'real quota observation is preserved');
A.eq(or.quota.buckets.requests.remaining,12,'observed remaining quota is preserved');
A.eq(or.supportsTools,null,'catalog-dependent capability is not coerced into a boolean claim');
A.eq(or.supportsReasoning,null,'catalog-dependent reasoning support is not guessed');

const codex=out.rows.find(r=>r.id==='codex');
A.eq(codex.quotaObserved,false,'absence of quota evidence stays explicit');
A.ok(!Object.prototype.hasOwnProperty.call(codex,'quota'),'missing runtime evidence does not create a fake quota object');
A.eq(codex.supportsTools,true,'boolean registry assertions may be projected');
A.eq(codex.unmetered,true,'registry billing metadata is preserved');

const starnet=out.rows.find(r=>r.id==='starnet');
A.eq(starnet.requiresBaseUrl,true,'dynamic endpoint requirement is preserved');
A.eq(starnet.supportsTools,null,'unknown capability remains unknown');

for(const key of ['availabilityInferred','credentialValidityInferred','uptimeInferred','latencyInferred','successRateInferred','healthScoreInferred','mutationsExposed']) {
  A.eq(out.evidence[key],false,key+' must remain false');
}

const serialized=JSON.stringify(out);
for(const forbidden of ['healthy','unhealthy','online','offline','reachable','credentialValid','successRate":1','latencyMs']) {
  A.ok(!serialized.includes(forbidden),'projection must not invent provider health telemetry: '+forbidden);
}
A.report('control-provider-view.test');
