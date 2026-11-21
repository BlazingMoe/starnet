'use strict';
const A=require('./_assert.js');
const fs=require('node:fs');
const path=require('node:path');
const {patchSource}=require('../scripts/apply-provider-control-host.js');
const src=fs.readFileSync(path.join(__dirname,'../sidecar/index.js'),'utf8');

const providerImport="const { makeProviderControlHttp } = require('./control/provider-http.js');   // Moe AI Station: read-only registry + observed quota evidence\n";
const providerBlock=[
  '// Registry metadata and providers/ratelimits remain the only provider-signal truth sources.',
  'const providerControlHttp = makeProviderControlHttp({',
  "  profiles: () => require('./providers/registry.js').listProviderProfiles(),",
  '  rateLimits: () => rateLimits.snapshot(),',
  '  respondJson',
  '});',
  ''
].join('\n');
const providerRoute="  { m: 'GET', exact: '/api/control/providers', h: providerControlHttp.serve },   // Control Mode: registry metadata + actually observed quota evidence\n";

A.ok(/makeProviderControlHttp\s*}\s*=\s*require\('\.\/control\/provider-http\.js'\)/.test(src),'committed host imports provider HTTP composer');
A.ok(/providerControlHttp\s*=\s*makeProviderControlHttp\(\{[\s\S]{0,500}profiles:\s*\(\)\s*=>\s*require\('\.\/providers\/registry\.js'\)\.listProviderProfiles\(\)[\s\S]{0,500}rateLimits:\s*\(\)\s*=>\s*rateLimits\.snapshot\(\)/.test(src),'committed host reuses registry and authoritative rateLimits store');
A.ok(/\{\s*m:\s*'GET',\s*exact:\s*'\/api\/control\/providers',\s*h:\s*providerControlHttp\.serve\s*}/.test(src),'committed GET provider route is wired');
A.ok(!/provider(?:Health|Signals|Status)\s*=\s*new (?:Map|Set)/.test(src),'no parallel provider telemetry store is introduced');
A.ok(!/credentialProbe|healthScore|latencyMs|uptime/.test(src.slice(src.indexOf('const providerControlHttp'),src.indexOf('const providerControlHttp')+700)),'host wiring does not add synthetic health probes');
A.throws(()=>patchSource(src),/wiring already present/,'committed host refuses a second one-shot application');

const unwired=src.replace(providerImport,'').replace(providerBlock,'').replace(providerRoute,'');
A.ok(!unwired.includes("require('./control/provider-http.js')")&&!unwired.includes("exact: '/api/control/providers'"),'fixture reconstructs the pre-wiring host');
const after=patchSource(unwired);
A.ok(after.includes(providerImport.trim()),'one-shot patch restores provider import');
A.ok(after.includes("profiles: () => require('./providers/registry.js').listProviderProfiles()"),'one-shot patch restores registry source');
A.ok(after.includes('rateLimits: () => rateLimits.snapshot()'),'one-shot patch restores authoritative quota source');
A.ok(after.includes("exact: '/api/control/providers', h: providerControlHttp.serve"),'one-shot patch restores provider route');

const drifted=unwired.replace("const { makeCostControlHttp } = require('./control/cost-http.js');   // Moe AI Station: read-only ledger + budget governor overview","const { makeCostControlHttp } = require('./control/cost-http.js');");
A.throws(()=>patchSource(drifted),/missing control import anchor/,'anchor drift fails closed');
const noQuota=unwired.replace("const rateLimits = require('./providers/ratelimits.js').makeRateLimits","const legacyLimits = require('./providers/ratelimits.js').makeRateLimits");
A.throws(()=>patchSource(noQuota),/authoritative rateLimits source not found/,'missing authoritative quota source fails closed');
A.report('control-provider-host-wiring.test');
