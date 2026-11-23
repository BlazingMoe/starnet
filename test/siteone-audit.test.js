'use strict';
const A=require('./_assert.js');
const NET=require('node:net');
const {makeWebTools}=require('../sidecar/tools/builtin/web.js');
const {makeSiteOneAuditTools,_internals}=require('../sidecar/tools/builtin/siteone-audit.js');
const {CAP_REGISTRY}=require('../sidecar/capability/registry.js');

(async()=>{
  const guard=makeWebTools({lookup:null})._internals;
  const target=_internals.validateTarget('https://example.com/path',guard.assertSafeUrl);
  A.eq(target.href,'https://example.com/path','one public HTTPS path is accepted');
  for(const bad of ['http://example.com/','https://example.com/?secret=x','https://user:pass@example.com/','https://127.0.0.1/','https://localhost/','https://example.com:444/'])A.throws(()=>_internals.validateTarget(bad,guard.assertSafeUrl),'unsafe or credential-bearing target is refused');

  const raw=JSON.stringify({crawler:{name:'SiteOne Crawler',version:'2.6.1'},qualityScores:{overall:{score:8.2},categories:[{code:'seo',score:7.5}]},results:[{url:'https://example.com/',status:'200',elapsedTime:0.2,size:123,type:1}],stats:{totalUrls:1,totalSize:123,totalExecutionTime:0.5,countByStatus:{200:1}},summary:{items:[{aplCode:'seo-title',status:'WARNING',text:'Review title'}]},tables:{}});
  const compact=_internals.compactReport(raw,'https://example.com/','a'.repeat(64));
  A.eq(compact.evidenceState,'UNTRUSTED_AUTOMATED_SINGLE_PAGE_REVIEW_REQUIRED','result never becomes an acceptance verdict');
  A.eq(compact.scope,{pages:1,assets:false,followLinks:false,workers:1,maxRequestsPerSecond:1,cache:false,exactHostOnly:true},'reported scope matches fixed low-impact adapter');
  A.eq(compact.findings[0].observation,'Review title','bounded finding is available for human review');
  A.throws(()=>_internals.compactReport('{}','https://example.com/','x'),'unsupported report shape fails closed');

  let spec=null;
  const governor={run:async(id,next)=>{spec={id,next};const args=await next.argsFactory({temp:'C:\\bounded-job'});spec.args=args;return{state:'PROCESS_COMPLETED_UNREVIEWED',files:{report:{bytes:Buffer.byteLength(raw),text:raw}}};}};
  const tools=makeSiteOneAuditTools({governor,assertSafeUrl:guard.assertSafeUrl,assertResolvedSafe:async()=>({address:'203.0.113.10',family:4}),lookup:async()=>[{address:'203.0.113.10',family:4}],hash:()=> 'b'.repeat(64),clock:{now:()=>1700000000000}});
  const output=(await tools.tool.run({url:'https://example.com/'})).content;
  A.ok(output.includes('BEGIN EXTERNAL WEB CONTENT')&&output.includes('siteone-evidence.json'),'adapter returns one fixed fenced evidence filename');
  A.ok(output.includes('2023-11-14T22:13:20.000Z')&&output.includes('one consented exact public HTTPS host'),'host timestamp and exact network boundary are explicit');
  A.eq(spec.id,'siteone','only the fixed governor profile is invoked');
  for(const arg of ['--single-page','--disable-all-assets','--workers=1','--max-reqs-per-sec=1','--max-visited-urls=1','--no-cache'])A.ok(spec.args.includes(arg),arg+' is fixed by host');
  A.ok(spec.args.some(x=>x==='--proxy=127.0.0.1:'+x.split(':').pop()),'crawler is forced through loopback proxy');
  A.ok(spec.next.stageFiles[0].data.includes('Intentionally empty'),'explicit empty config prevents home config discovery');
  A.eq(tools.tool.scope,'execute','external network process is not mislabeled as passive read');
  A.eq(tools.tool.requiresConsent,true,'every crawl requires explicit consent');
  A.eq(tools.tool.network,true,'network reach is declared');
  A.ok(CAP_REGISTRY.dish.some(x=>x.tool==='website.audit.siteone'&&x.scope==='execute'&&x.requiresConsent&&x.network),'dish grant preserves execution consent and network labels');
  A.eq(require('../frontend/app/toolprops.js').toolPropType('website.audit.siteone'),'dish','Ingame UI shows the web capability');
  A.eq(require('../website/app/app/toolprops.js').toolPropType('website.audit.siteone'),'dish','website mirror shows the same capability');
  const recipe=require('../frontend/app/recipe-catalog/business.js').find(x=>x.id==='website-siteone-inspection');
  const mirror=require('../website/app/app/recipe-catalog/business.js').find(x=>x.id==='website-siteone-inspection');
  A.ok(recipe&&recipe.gear.includes('dish')&&recipe.gear.includes('cabinet')&&recipe.task.includes('website.audit.siteone')&&recipe.task.includes('website.audit.pack'),'website workflow connects attended inspection to separately reviewed evidence pack');
  A.eq(mirror,recipe,'website recipe mirror matches the Ingame catalog');
  const index=require('node:fs').readFileSync(require.resolve('../sidecar/index.js'),'utf8');
  A.ok(index.includes('makeSiteOneAuditTools({')&&index.includes('assertSafeUrl: skillWebInternals.assertSafeUrl')&&index.includes('clock: { now: () => Date.now() }'),'production uses the existing public URL guard and host clock');

  let upstreamPort=0;
  const upstream=NET.createServer(socket=>setTimeout(()=>socket.end(),10));
  await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(0,'127.0.0.1',()=>{upstreamPort=upstream.address().port;resolve();});});
  const fakeNet={isIP:NET.isIP,connect:()=>NET.connect({host:'127.0.0.1',port:upstreamPort})};
  const proxy=await _internals.makePinnedProxy({host:'example.com',assertSafeUrl:guard.assertSafeUrl,assertResolvedSafe:async()=>({address:'203.0.113.10',family:4}),lookup:async()=>[{address:'203.0.113.10',family:4}],net:fakeNet});
  async function connect(line){return await new Promise((resolve,reject)=>{const socket=NET.connect({host:'127.0.0.1',port:proxy.port},()=>socket.write('CONNECT '+line+' HTTP/1.1\r\nHost: '+line+'\r\n\r\n'));let text='';socket.on('data',d=>{text+=d;});socket.once('error',reject);socket.once('close',()=>resolve(text));});}
  A.ok((await connect('private.internal:443')).includes('403 Forbidden'),'foreign/private redirect host cannot leave through proxy');
  A.ok((await connect('example.com:443')).includes('200 Connection Established'),'exact validated host can open one pinned tunnel');
  await proxy.close();await new Promise((resolve,reject)=>upstream.close(e=>e?reject(e):resolve()));
  A.report('siteone-audit.test');
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
