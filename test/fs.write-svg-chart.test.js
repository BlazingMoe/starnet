'use strict';
const A=require('./_assert.js'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {makeFsTools}=require('../sidecar/tools/builtin/fs.js'),{makeRegistry}=require('../sidecar/tools/registry.js'),{makeArtifactCollector}=require('../sidecar/artifacts.js'),{createSvgBarChart,_internals}=require('../sidecar/tools/builtin/svg-chart.js');
const ROOT=path.join(os.tmpdir(),'starnet-svg-chart-'+process.pid),ctx={agentId:'chartfixture'};
async function rejects(call,pattern,label){try{await call;A.ok(false,label+' rejects')}catch(error){A.ok(pattern.test(error.message),label+' rejects for expected reason')}}
(async()=>{
 fs.rmSync(ROOT,{recursive:true,force:true});
 try{
  const tools=makeFsTools({fsp,pathMod:path,root:ROOT,limits:{writeBytes:1<<20}}),registry=makeRegistry();tools.register(registry);
  const registered=registry.get('fs.write_svg_chart');
  A.ok(registered,'SVG chart writer is registered');A.eq([registered.capability,registered.scope,registered.requiresConsent],['cabinet','write',true],'SVG chart uses ordinary consent-gated cabinet write authority');
  const chart={path:'reports/quarter.svg',title:'Contribution <plan> & actual',yLabel:'EUR contribution',categories:['January','February','March'],series:[{name:'Plan',values:[1200,-400,0]},{name:'Actual & verified?',values:[900,-200,300]}]};
  const result=await tools.writeSvgChartTool.run(chart,ctx),abs=path.join(ROOT,'chartfixture',chart.path),raw=fs.readFileSync(abs),svg=raw.toString('utf8');
  A.eq(result.receipt.state,'read-back-verified','chart write has exact verified receipt');A.eq(result.receipt.verifiedBytes,raw.length,'chart receipt byte count matches disk');A.eq(result.receipt.sha256,result.receipt.actualSha256,'chart intended and read-back digests match');
  A.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg ')&&svg.endsWith('</svg>\n'),'chart is one complete standalone SVG document');
  A.ok(svg.includes('width="1200" height="675"')&&svg.includes('role="img" aria-labelledby="chart-title chart-desc"'),'chart has fixed bounded canvas and accessible naming');
  A.ok(svg.includes('Contribution &lt;plan&gt; &amp; actual')&&svg.includes('Actual &amp; verified?'),'all model-supplied text is XML escaped');
  A.ok(svg.includes('Static grouped bar chart. Zero baseline is always shown.')&&svg.includes('January — Plan: 1200'),'accessible description preserves exact supplied values and full labels');
  A.ok((svg.match(/<rect data-mark="bar"/g)||[]).length===6,'chart emits exactly one bar per category and series');
  A.ok(svg.includes('stroke="#111827" stroke-width="2"')&&svg.includes('>-500<')&&svg.includes('>2k<'),'negative/positive data uses a visible zero baseline and bounded nice scale');
  A.ok(!/<script|<foreignObject|<animate|\bhref=|url\(|data:/i.test(svg)&&(svg.match(/https?:/g)||[]).length===1,'chart contains only the required SVG namespace and no script, foreign object, animation, link, data URL or external resource');
  A.eq(_internals.PALETTE,['#2563eb','#d97706','#059669','#7c3aed'],'chart uses the fixed reviewed palette');
  const ledger=makeArtifactCollector();ledger.observe({toolName:'fs.write_svg_chart',args:{path:chart.path},result});A.eq(ledger.list(),[{kind:'image',path:chart.path,bytes:raw.length}],'verified chart appears as an image artifact');
  const noReceipt=makeArtifactCollector();noReceipt.observe({toolName:'fs.write_svg_chart',args:{path:chart.path},result:{ok:true}});A.eq(noReceipt.count(),0,'chart is omitted from artifacts without matching verified receipt');
  const smallest=createSvgBarChart({title:'T',categories:['A'],series:[{name:'S',values:[1]}]},1<<20);A.eq(createSvgBarChart({title:'T',categories:['A'],series:[{name:'S',values:[1]}]},smallest.length).length,smallest.length,'exact serialized byte boundary is accepted');
  let short=false;try{createSvgBarChart({title:'T',categories:['A'],series:[{name:'S',values:[1]}]},smallest.length-1)}catch(_){short=true}A.ok(short,'one-byte-short output ceiling is rejected');
  const invalid=[
   [{title:' ',categories:['A'],series:[{name:'S',values:[1]}]},/title/],
   [{title:'T',categories:[],series:[{name:'S',values:[]}]},/categories/],
   [{title:'T',categories:['A','A'],series:[{name:'S',values:[1,2]}]},/unique/],
   [{title:'T',categories:['A'],series:[{name:'S',values:[1]},{name:'S',values:[2]}]},/series names/],
   [{title:'T',categories:['A','B'],series:[{name:'S',values:[1]}]},/match category/],
   [{title:'T',categories:['A'],series:[{name:'S',values:[Infinity]}]},/finite/],
   [{title:'T',categories:['A'],series:[{name:'S',values:[1e13]}]},/within/],
   [{title:'T',categories:['A'],series:[{name:'S',values:[1],color:'#000'}]},/unsupported/],
   [{title:'bad\u0001',categories:['A'],series:[{name:'S',values:[1]}]},/valid Unicode/],
   [{title:'bad\ud800',categories:['A'],series:[{name:'S',values:[1]}]},/valid Unicode/]
  ];
  for(const [input,pattern] of invalid){await rejects(tools.writeSvgChartTool.run({path:'reports/reject.svg',...input},ctx),pattern,'invalid SVG chart');A.ok(!fs.existsSync(path.join(ROOT,'chartfixture','reports','reject.svg')),'invalid chart does not mutate filesystem')}
  await rejects(tools.writeSvgChartTool.run({...chart,path:'reports/not-svg.txt'},ctx),/end in \.svg/,'wrong extension');
  await rejects(tools.writeSvgChartTool.run({...chart,script:'alert(1)',path:'reports/extra.svg'},ctx),/unsupported fields/,'unsupported top-level chart field');
  await rejects(tools.writeSvgChartTool.run({...chart,path:'../escape.svg'},ctx),/outside|path/i,'chart path traversal');
  const tinyRoot=path.join(ROOT,'tiny'),tiny=makeFsTools({fsp,pathMod:path,root:tinyRoot,limits:{writeBytes:200}});await rejects(tiny.writeSvgChartTool.run(chart,ctx),/byte limit/,'chart output above configured ceiling');A.ok(!fs.existsSync(path.join(tinyRoot,'chartfixture','reports','quarter.svg')),'byte-limit refusal precedes mutation');
  const staleTools=makeFsTools({fsp,pathMod:path,root:ROOT});await staleTools.readTool.run({path:chart.path},ctx);fs.appendFileSync(abs,'drift');fs.utimesSync(abs,new Date(),new Date(Date.now()+5000));await rejects(staleTools.writeSvgChartTool.run(chart,ctx),/stale write refused/,'stale chart overwrite');A.ok(fs.readFileSync(abs).subarray(-5).equals(Buffer.from('drift')),'stale refusal preserves changed bytes');
 }finally{fs.rmSync(ROOT,{recursive:true,force:true})}
 A.report('fs.write-svg-chart.test');
})().catch(error=>{console.error(error);process.exit(1)});
