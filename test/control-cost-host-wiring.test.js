/* Source-level contract for Control Mode cost/budget wiring. */
'use strict';
const A=require('./_assert.js');
const fs=require('fs');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../sidecar/index.js'),'utf8');
A.ok(/makeCostControlHttp\s*}\s*=\s*require\('\.\/control\/cost-http\.js'\)/.test(src),'sidecar imports cost HTTP composer');
A.ok(/costControlHttp\s*=\s*makeCostControlHttp\(\{[\s\S]{0,700}ledgerRows:\s*\(\)\s*=>\s*ledger\.all\(\)[\s\S]{0,700}budgetStatus:\s*\(\)\s*=>\s*budget\.status\(Date\.now\(\)\)[\s\S]{0,700}caps:\s*\(\)\s*=>\s*Object\.assign\(\{\},\s*effectiveCaps\)/.test(src),'cost view reuses authoritative ledger, governor and effective caps');
A.ok(/\{\s*m:\s*'GET',\s*exact:\s*'\/api\/control\/costs',\s*h:\s*costControlHttp\.serve\s*}/.test(src),'sidecar exposes exactly the read-only cost endpoint');
A.ok(!/\{\s*m:\s*'(?:POST|PUT|PATCH|DELETE)',\s*(?:prefix|exact|qsplit):\s*'\/api\/control\/costs/.test(src),'cost surface has no mutation route');
A.report('control-cost-host-wiring.test');
