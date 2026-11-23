'use strict';
const A=require('./_assert.js');
const fs=require('node:fs'),fsp=require('node:fs/promises'),P=require('node:path'),OS=require('node:os');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {makeExternalToolGovernor}=require('../sidecar/external-tool-governor.js');
const {makeExternalToolTools}=require('../sidecar/tools/builtin/external-tools.js');

(async()=>{
  const root=await fsp.mkdtemp(P.join(OS.tmpdir(),'starnet-external-tools-'));
  await fsp.mkdir(P.join(root,'siteone'),{recursive:true});
  await fsp.writeFile(P.join(root,'siteone','siteone.exe'),'fixture');
  const fakeOs={freemem:()=>4*1024*1024*1024,totalmem:()=>8*1024*1024*1024,cpus:()=>[{},{},{},{}]};
  let launches=0,lastOptions=null,release=null;
  function spawn(exe,args,options){launches++;lastOptions={exe,args,options};const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.emit('close',null,'SIGTERM');};release=()=>{child.stdout.end('bounded result');child.stderr.end('review me');child.emit('close',0,null);};return child;}
  const testClock={now:(()=>{let n=1700000000000;return()=>++n;})()};
  const testRng={bytes:()=>Buffer.from('010203040506','hex')};
  const governor=makeExternalToolGovernor({root,os:fakeOs,spawn,clock:testClock,rng:testRng});
  const view=governor.inspect();
  A.eq(view.policy.maxConcurrentExternalJobs,1,'all optional external production is serialized');
  A.eq(view.policy.automaticInstallOrDownload,false,'inspection never installs or downloads');
  A.eq(view.tools.find(x=>x.id==='siteone').state,'AVAILABLE_NOT_RUNNING','exact in-root executable is detected');
  A.eq(view.tools.find(x=>x.id==='blender').state,'NOT_INSTALLED','missing heavyweight program remains optional');
  A.eq(governor.preflight('blender').gaps.includes('NOT_INSTALLED'),true,'missing program cannot pass preflight');
  A.eq(governor.preflight('siteone',{inputBytes:33*1024*1024}).gaps.includes('INPUT_TOO_LARGE'),true,'per-tool input ceiling is enforced before launch');

  process.env.STARNET_TEST_EXTERNAL_SECRET='must-not-leak';
  const running=governor.run('siteone',{args:['--help'],inputBytes:10});
  while(!release) await new Promise(r=>setImmediate(r));
  const busy=governor.preflight('siteone');
  A.eq(busy.gaps.includes('EXTERNAL_JOB_ACTIVE'),true,'a second external job is refused while one owns the slot');
  A.eq(lastOptions.options.shell,false,'external process never receives a shell');
  A.eq(lastOptions.options.env.STARNET_TEST_EXTERNAL_SECRET,undefined,'ambient secrets are not copied to external tools');
  A.eq(lastOptions.options.env.HF_HUB_OFFLINE,'1','model download is disabled during a job');
  A.eq(lastOptions.options.env.OMP_NUM_THREADS,'2','weak-PC worker hint is bounded');
  A.ok(P.relative(root,lastOptions.options.env.HF_HOME).indexOf('..')!==0,'model cache stays under external root');
  release();
  const result=await running;
  A.eq(result.state,'PROCESS_COMPLETED_UNREVIEWED','zero exit remains explicitly unreviewed');
  A.eq(result.qualityReviewRequired,true,'process success never becomes quality acceptance');
  A.eq(result.stdout,'bounded result','bounded stdout is retained');
  A.eq(governor.inspect().active,null,'exclusive slot is released after exit');
  A.eq(fs.existsSync(P.join(root,'.tmp',result.jobId)),false,'per-job temporary files are removed');

  const mkdirFailure=makeExternalToolGovernor({root,os:fakeOs,spawn,fsp:{mkdir:async()=>{throw Error('disk unavailable');},rm:async()=>{}},clock:testClock,rng:testRng});
  let setupFailed=false;try{await mkdirFailure.run('siteone',{args:['--help']});}catch(e){setupFailed=/disk unavailable/.test(String(e&&e.message));}
  A.eq(setupFailed,true,'temporary-directory setup failure is reported');
  A.eq(mkdirFailure.inspect().active,null,'setup failure releases the exclusive slot');

  let registered=null;
  const tools=makeExternalToolTools({governor});tools.register({register(t){registered=t;}});
  const inspected=JSON.parse((await registered.run({})).content);
  A.eq(registered.name,'external.tools.inspect','model receives inspection only');
  A.eq(registered.scope,'read','inspection has no mutation scope');
  A.eq(launches,1,'setup failure and inspection did not launch another process');
  A.eq(inspected.mode,'LOW_RESOURCE_OPTIONAL_TOOLS','inspection explains the active policy');
  await fsp.rm(root,{recursive:true,force:true});
  delete process.env.STARNET_TEST_EXTERNAL_SECRET;
  A.report('external-tool-governor.test');
})().catch(e=>{console.log('FAIL: external-tool-governor — '+(e&&e.stack||e));process.exit(1);});
