'use strict';
const A=require('./_assert.js');
const fs=require('node:fs');
const path=require('node:path');
const {patchSource}=require('../scripts/apply-provider-control-host.js');
const src=fs.readFileSync(path.join(__dirname,'../sidecar/index.js'),'utf8');
const after=patchSource(src);

A.ok(/makeProviderControlHttp\s*}\s*=\s*require\('\.\/control\/provider-http\.js'\)/.test(after),'provider HTTP composer is imported');
A.ok(/providerControlHttp\s*=\s*makeProviderControlHttp\(\{[\s\S]{0,500}profiles:\s*\(\)\s*=>\s*require\('\.\/providers\/registry\.js'\)\.listProviderProfiles\(\)[\s\S]{0,500}rateLimits:\s*\(\)\s*=>\s*rateLimits\.snapshot\(\)/.test(after),'host reuses registry and authoritative rateLimits store');
A.ok(/\{\s*m:\s*'GET',\s*exact:\s*'\/api\/control\/providers',\s*h:\s*providerControlHttp\.serve\s*}/.test(after),'GET provider route is wired');
A.ok(!/provider(?:Health|Signals|Status)\s*=\s*new (?:Map|Set)/.test(after),'no parallel provider telemetry store is introduced');
A.ok(!/credentialProbe|healthScore|latencyMs|uptime/.test(after.slice(after.indexOf('const providerControlHttp'),after.indexOf('const providerControlHttp')+700)),'host wiring does not add synthetic health probes');
A.throws(()=>patchSource(after),/wiring already present/,'patch is one-shot');

const drifted=src.replace("const { makeCostControlHttp } = require('./control/cost-http.js');   // Moe AI Station: read-only ledger + budget governor overview","const { makeCostControlHttp } = require('./control/cost-http.js');");
A.throws(()=>patchSource(drifted),/missing control import anchor/,'anchor drift fails closed');
const noQuota=src.replace("const rateLimits = require('./providers/ratelimits.js').makeRateLimits","const legacyLimits = require('./providers/ratelimits.js').makeRateLimits");
A.throws(()=>patchSource(noQuota),/authoritative rateLimits source not found/,'missing authoritative quota source fails closed');
A.report('control-provider-host-wiring.test');
