'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const Demo=require('../sidecar/tools/builtin/visual-assets.js');
const Studio=require('../sidecar/tools/builtin/service-studio.js');
const {input}=require('./helpers/visual-demo-fixture.js');
const {makeRegistry}=require('../sidecar/tools/registry.js');
const {makeArtifactCollector}=require('../sidecar/artifacts.js');
const {CAP_REGISTRY}=require('../sidecar/capability/registry.js');
const {resolveTools}=require('../sidecar/capability/resolve.js');
const {makeCapCtx}=require('../sidecar/capability/capGate.js');
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
  let assertions=0; const check=(a,b)=>{assert.deepEqual(a,b);assertions++;};
  const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'starnet-visual-assets-'));
  try {
    const now=Date.parse(input('logo').operatorRequest.requestedAt), tools=Demo.makeVisualAssetTools({fsp,pathMod:path,root:tmp,clock:()=>now});
    const reg=makeRegistry();tools.register(reg);
    const agentId='visual-test', station={agents:{[agentId]:{id:agentId,room:'office'}},rooms:{office:{id:'office',objects:[{instanceId:'studio',objectType:'studio'}]}}};
    const resolved=resolveTools(agentId,station); const ctx={...makeCapCtx(resolved,{consent:async()=>({allow:true})}),agentId};
    for(const name of ['visual.demo.plan','visual.demo.export','visual.demo.validate']) {
      assert(resolved.tools.includes(name));assert(CAP_REGISTRY.studio.some(x=>x.tool===name&&x.network===false));
      check(require('../frontend/app/toolprops.js').toolPropType(name),'studio');check(require('../website/app/app/toolprops.js').toolPropType(name),'studio');
    }
    check(reg.get('visual.demo.export').requiresConsent,true);check(reg.get('visual.demo.export').scope,'write');
    assert(!resolveTools(agentId,{agents:station.agents,rooms:{office:{id:'office',objects:[{instanceId:'cabinet',objectType:'cabinet'}]}}}).tools.includes('visual.demo.export'));
    const dispatch=(name,args,c=ctx)=>reg.dispatch({id:'visual-call',name,args},c);
    const refused=await dispatch('visual.demo.export',input('logo'),{...ctx,consent:async()=>({allow:false,reason:'denied'})});check(refused.ok,false);check(fs.existsSync(path.join(tmp,agentId)),false);
    const artifacts=makeArtifactCollector();
    for(const lane of Demo.LANES) {
      const args=input(lane), before=JSON.stringify(args), pack=Demo.build(args);
      check(Demo.build(args),pack);check(JSON.stringify(args),before);
      const name=Object.keys(pack.files)[0];check(Object.keys(pack.files),[name,'review.html','README.md','manifest.json']);
      const manifest=JSON.parse(pack.files['manifest.json']);
      check(manifest.identity,'Lumen Cairn');check(manifest.provenance.externalInputs,[]);check(manifest.provenance.provider,null);check(manifest.provenance.network,false);check(manifest.provenance.commercialUseApproved,false);
      check(manifest.reviews,{technical:'VALIDATED_FIXED_DEMO_ONLY',visualHumanReview:'PENDING',originalityRightsLicenceReview:'PENDING',platformEngineAcceptance:'NOT_TESTED',customerAcceptance:'NOT_ASSESSED'});
      for(const entry of manifest.inventory) {check(entry.sha256,Demo.hash(pack.files[entry.name]));check(entry.bytes,pack.files[entry.name].length);}
      if(lane==='youtube-thumbnail') {check([pack.checks.width,pack.checks.height,pack.checks.transparentPixels],[1280,720,0]);check(pack.checks.textSafeArea,[64,64,1216,656]);assert(pack.files[name].length<2*1024*1024);}
      if(lane==='game-assets-2d') {check([pack.checks.width,pack.checks.height],[128,128]);assert(pack.checks.transparentPixels>0&&pack.checks.visiblePixels>0);}
      if(lane==='game-assets-3d') {check([pack.checks.vertices,pack.checks.triangles,pack.checks.watertight],[6,8,true]);check([pack.checks.min,pack.checks.max],[[-.5,-1,-.5],[.5,1,.5]]);}
      if(lane==='logo') {assert(pack.files[name].toString().includes('viewBox="0 0 256 256"'));assert(!/<script|<image|<text|href=|url\(/.test(pack.files[name].toString()));}
      const planned=await dispatch('visual.demo.plan',{preparation:args.preparation});check(planned.ok,true);check(JSON.parse(planned.content).preparationSha256,args.operatorRequest.preparationSha256);check(JSON.parse(planned.content).reviews.technical,'NOT_PRODUCED');
      check(JSON.parse(planned.content).destination,args.destination);
      const result=await dispatch('visual.demo.export',args);assert(result.ok,result.content);check(result.receipt.files.length,4);
      artifacts.observe({toolName:'visual.demo.export',args,result});
      for(const receipt of result.receipt.files) {check(receipt.state,'read-back-verified');check(receipt.sha256,Demo.hash(fs.readFileSync(path.join(tmp,agentId,receipt.path))));check(receipt.sha256,receipt.actualSha256);}
      const validate=await dispatch('visual.demo.validate',args);assert(validate.ok,validate.content);check(JSON.parse(validate.content).state,'TECHNICALLY_VALIDATED_PRIVATE_DEMO');
      const duplicate=await dispatch('visual.demo.export',args);check(duplicate.ok,false);assert(duplicate.content.includes('already exists'));
      const primary=path.join(tmp,agentId,args.destination,name), original=await fsp.readFile(primary);
      await fsp.writeFile(primary,original.subarray(0,original.length-1));check((await dispatch('visual.demo.validate',args)).ok,false);
      await fsp.writeFile(primary,original);const altered=Buffer.from(original);altered[altered.length-2]^=1;await fsp.writeFile(primary,altered);check((await dispatch('visual.demo.validate',args)).ok,false);
      await fsp.writeFile(primary,original);await fsp.writeFile(path.join(tmp,agentId,args.destination,'extra.txt'),'unexpected');check((await dispatch('visual.demo.validate',args)).ok,false);
      await fsp.unlink(path.join(tmp,agentId,args.destination,'extra.txt'));await fsp.rename(primary,primary+'.missing');check((await dispatch('visual.demo.validate',args)).ok,false);await fsp.rename(primary+'.missing',primary);
    }
    check(artifacts.list().length,16);
    const replay=input('logo');replay.destination='visual-demos/'+'f'.repeat(64);assert.throws(()=>Demo.build(replay),/Destination must bind/);check((await dispatch('visual.demo.export',replay)).ok,false);
    const concurrent=input('logo',undefined,'concurrent');
    const raced=await Promise.all([dispatch('visual.demo.export',concurrent),dispatch('visual.demo.export',concurrent)]);
    check(raced.filter(r=>r.ok).length,1);check((await dispatch('visual.demo.validate',concurrent)).ok,true);
    const abort=new AbortController();abort.abort();const cancelled=input('logo',undefined,'cancelled');
    await assert.rejects(()=>tools.exportTool.run(cancelled,{...ctx,signal:abort.signal}),/cancelled/);check(fs.existsSync(path.join(tmp,agentId,cancelled.destination)),false);
    const fake=makeArtifactCollector();fake.observe({toolName:'visual.demo.export',args:input('logo'),result:{ok:true,receipt:{operation:'visual-demo-export',state:'read-back-verified',path:input('logo').destination,files:[]}}});check(fake.list(),[]);
    // Exact bounded canonical bytes remove ambiguity: malformed files, forged manifest reviews and swapped lanes never validate.
    const logoArgs=input('logo'), manifestPath=path.join(tmp,agentId,logoArgs.destination,'manifest.json'), manifestBytes=await fsp.readFile(manifestPath);
    const forged=JSON.parse(manifestBytes);forged.reviews.originalityRightsLicenceReview='APPROVED';await fsp.writeFile(manifestPath,Demo.json(forged));check((await dispatch('visual.demo.validate',logoArgs)).ok,false);await fsp.writeFile(manifestPath,manifestBytes);
    for(const change of [x=>x.destination='../escape',x=>x.destination='C:/escape',x=>x.destination='visual-demos/a/b',x=>x.destination='visual-demos/A',x=>x.content='arbitrary',x=>x.operatorRequest.action='go',x=>x.operatorRequest.lane='logo',x=>x.operatorRequest.preparationSha256='0'.repeat(64),x=>x.operatorRequest.requestedAt=x.preparation.asOf,x=>x.operatorRequest.requestedAt='2026-12-01T12:00:00.000Z',x=>x.preparation.review.rights.decision='unknown',x=>x.preparation.version='v2',x=>x.preparation.evidence.push(x.preparation.evidence[0]),x=>x.preparation.duplicate.priorState='delivered',x=>x.preparation.evidence[0].checkedAt='2020-01-01T00:00:00.000Z',x=>delete x.operatorRequest]) {
      const args=input('youtube-thumbnail');change(args);assert.throws(()=>Demo.build(args));check((await dispatch('visual.demo.export',args)).ok,false);
    }
    const wrongLane=input('crm-prototype');check((await dispatch('visual.demo.plan',{preparation:wrongLane.preparation})).ok,false);assert.throws(()=>Demo.build(wrongLane));
    const stale=Demo.makeVisualAssetTools({fsp,pathMod:path,root:tmp,clock:()=>now+86400001});await assert.rejects(()=>stale.exportTool.run(logoArgs,ctx),/Stale/);check(JSON.parse((await stale.validateTool.run(logoArgs,ctx)).content).state,'TECHNICALLY_VALIDATED_PRIVATE_DEMO');
    const future=Demo.makeVisualAssetTools({fsp,pathMod:path,root:tmp,clock:()=>now-1});await assert.rejects(()=>future.exportTool.run(logoArgs,ctx),/future/);
    const oldEvidence=input('logo');oldEvidence.preparation.evidence[0].checkedAt=new Date(now-7*86400000-1).toISOString();oldEvidence.operatorRequest.preparationSha256=Demo.hash(Demo.json(Studio.prepare(oldEvidence.preparation)));oldEvidence.destination='visual-demos/'+oldEvidence.operatorRequest.preparationSha256;assert.throws(()=>Demo.build(oldEvidence),/stale/);
    const pendingArgs=input('logo',undefined,'pending');await fsp.mkdir(path.join(tmp,agentId,pendingArgs.destination+'.pending'));check((await dispatch('visual.demo.export',pendingArgs)).ok,false);
    // Fault injection: failed writes cannot advertise success or completed artifacts; staging survives for reconciliation.
    const faultArgs=input('logo',undefined,'fault');
    const broken=new Proxy(fsp,{get(target,key){if(key==='rename')return async()=>{throw Error('injected rename failure');};return target[key];}});
    const brokenReg=makeRegistry();Demo.makeVisualAssetTools({fsp:broken,pathMod:path,root:tmp,clock:()=>now}).register(brokenReg);
    const fail=await brokenReg.dispatch({id:'fault',name:'visual.demo.export',args:faultArgs},ctx);check(fail.ok,false);assert(fail.content.includes('injected rename failure'));check(fs.existsSync(path.join(tmp,agentId,faultArgs.destination)),false);check(fs.existsSync(path.join(tmp,agentId,faultArgs.destination+'.pending')),true);artifacts.observe({toolName:'visual.demo.export',args:faultArgs,result:fail});check(artifacts.list().length,16);
    const corruptArgs=input('logo',undefined,'corrupt');
    const corrupt=new Proxy(fsp,{get(target,key){if(key==='open')return async(file,flags)=>{const h=await target.open(file,flags);if(flags!=='wx')return h;return{writeFile:bytes=>h.writeFile(Buffer.alloc(bytes.length)),sync:()=>h.sync(),close:()=>h.close()};};return target[key];}});
    const corruptReg=makeRegistry();Demo.makeVisualAssetTools({fsp:corrupt,pathMod:path,root:tmp,clock:()=>now}).register(corruptReg);
    const corruptResult=await corruptReg.dispatch({id:'corrupt',name:'visual.demo.export',args:corruptArgs},ctx);check(corruptResult.ok,false);assert(corruptResult.content.includes('byte/hash mismatch'));check(fs.existsSync(path.join(tmp,agentId,corruptArgs.destination)),false);check(fs.existsSync(path.join(tmp,agentId,corruptArgs.destination+'.pending')),true);
    // Directory junctions are realpath-checked by the same fs jail, even without project context.
    const other=path.join(tmp,'outside');await fsp.mkdir(other);const linked=input('logo',undefined,'linked'),link=path.join(tmp,agentId,linked.destination);await fsp.symlink(other,link,process.platform==='win32'?'junction':'dir');
    check((await dispatch('visual.demo.export',linked)).ok,false);check((await dispatch('visual.demo.validate',linked)).ok,false);check(await fsp.readdir(other),[]);await fsp.unlink(link);
    const png=Demo.build(input('youtube-thumbnail')).files['thumbnail.png'];for(const bytes of [png.subarray(0,20),Buffer.concat([png,Buffer.from([0])]),Buffer.from(png)]) { if(bytes.length===png.length)bytes[40]^=1;assert.throws(()=>Demo.inspectPNG(bytes,1280,720,false)); }
    assert.throws(()=>Demo.inspectPNG(png,720,1280,false));assert.throws(()=>Demo.inspectOBJ(Buffer.from('v 0 0 0\nf 1 1 1\n')));
    const source=fs.readFileSync(require.resolve('../sidecar/tools/builtin/visual-assets.js'),'utf8');
    const allowed={'node:crypto':require('node:crypto'),'node:zlib':require('node:zlib'),'./service-studio.js':{...Studio,prepare:value=>Studio.prepare(clone(value))},'./fs.js':{makeFsTools(){throw Error('I/O forbidden during build');}}};
    const isolated={module:{exports:{}},Buffer,URL,Date,Object,JSON,require(name){if(!Object.hasOwn(allowed,name))throw Error('No provider/network/process imports');return allowed[name];},fetch(){throw Error('network forbidden');}};
    vm.runInNewContext(source,isolated); // JSON roundtrip inside realm avoids prototype mismatch in strict input checks.
    isolated.serialized=JSON.stringify(logoArgs);check(vm.runInNewContext('module.exports.hash(module.exports.build(JSON.parse(serialized)).files["logo.svg"])',isolated),Demo.hash(Demo.build(logoArgs).files['logo.svg']));
    assert(!/fetch\(|https:\/\/(?!www\.w3\.org)|child_process|process\.|setInterval|image_generate/.test(source));
    const recipe=require('../frontend/app/recipe-catalog/business.js').find(x=>x.id==='digital-service-studio');
    for(const text of ['VISUAL ASSET DEMO:','separate explicit operator request','visual.demo.plan','visual.demo.export','visual.demo.validate','four independent read-back-verified','stop for human private review','Launch remains off','NOT_TESTED','No network/provider calls']) assert(recipe.task.includes(text),text);
    assert(recipe.gear.includes('studio'));
    check(fs.readFileSync(require.resolve('../frontend/app/recipe-catalog/business.js'),'utf8'),fs.readFileSync(require.resolve('../website/app/app/recipe-catalog/business.js'),'utf8'));
    assert(fs.readFileSync(require.resolve('../sidecar/index.js'),'utf8').includes('makeVisualAssetTools({ fsp, pathMod: path, root: WORKSPACES, clock: () => Date.now() }).register(registry)'));
    console.log('visual-assets.test: PASS ('+assertions+' equality checks plus rejection, structure, no-network and gate assertions)');
  } finally {await fsp.rm(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
