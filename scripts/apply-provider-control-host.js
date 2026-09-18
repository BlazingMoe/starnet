'use strict';

const fs=require('node:fs');
const path=require('node:path');

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0) throw new Error('provider host patch: missing '+label+' anchor');
  if(source.indexOf(needle,first+needle.length)>=0) throw new Error('provider host patch: ambiguous '+label+' anchor');
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

function patchSource(source){
  if(typeof source!=='string'||!source) throw new Error('provider host patch: source required');
  if(source.includes("require('./control/provider-http.js')")||source.includes("exact: '/api/control/providers'")) throw new Error('provider host patch: wiring already present');
  if(!source.includes("const rateLimits = require('./providers/ratelimits.js').makeRateLimits")) throw new Error('provider host patch: authoritative rateLimits source not found');

  const costImport="const { makeCostControlHttp } = require('./control/cost-http.js');   // Moe AI Station: read-only ledger + budget governor overview";
  source=replaceOnce(source,costImport,costImport+"\nconst { makeProviderControlHttp } = require('./control/provider-http.js');   // Moe AI Station: read-only registry + observed quota evidence",'control import');

  const costBlock=[
    'const costControlHttp = makeCostControlHttp({',
    '  ledgerRows: () => ledger.all(),',
    '  roster: () => agentRoster,',
    '  budgetStatus: () => budget.status(Date.now()),',
    '  caps: () => Object.assign({}, effectiveCaps),',
    '  respondJson',
    '});'
  ].join('\n');
  const providerBlock=costBlock+'\n'+[
    '// Registry metadata and providers/ratelimits remain the only provider-signal truth sources.',
    'const providerControlHttp = makeProviderControlHttp({',
    "  profiles: () => require('./providers/registry.js').listProviderProfiles(),",
    '  rateLimits: () => rateLimits.snapshot(),',
    '  respondJson',
    '});'
  ].join('\n');
  source=replaceOnce(source,costBlock,providerBlock,'handler construction');

  const costRoute="  { m: 'GET', exact: '/api/control/costs', h: costControlHttp.serve },   // Control Mode: authoritative spend ledger + budget governor";
  source=replaceOnce(source,costRoute,costRoute+"\n  { m: 'GET', exact: '/api/control/providers', h: providerControlHttp.serve },   // Control Mode: registry metadata + actually observed quota evidence",'route');
  return source;
}

function main(){
  const target=path.join(__dirname,'..','sidecar','index.js');
  const before=fs.readFileSync(target,'utf8');
  fs.writeFileSync(target,patchSource(before));
  process.stdout.write('provider control host wiring applied\n');
}
if(require.main===module) main();
module.exports={patchSource};
