'use strict';
const A=require('./_assert.js'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const {makeFsTools}=require('../sidecar/tools/builtin/fs.js'),{makeRegistry}=require('../sidecar/tools/registry.js'),{makeDocExtract}=require('../sidecar/tools/builtin/docextract.js'),{makeArtifactCollector}=require('../sidecar/artifacts.js'),{createDocxReport}=require('../sidecar/tools/builtin/docx-report.js');
const ROOT=path.join(os.tmpdir(),'starnet-docx-write-'+process.pid),ctx={agentId:'docxfixture'};
(async()=>{
 fs.rmSync(ROOT,{recursive:true,force:true});
 try{
  const extract=makeDocExtract({inflateRaw:b=>zlib.inflateRawSync(b)}),tools=makeFsTools({fsp,pathMod:path,root:ROOT,docExtract:extract,limits:{writeBytes:1<<20}}),reg=makeRegistry();tools.register(reg);
  A.ok(reg.get('fs.write_docx'),'DOCX writer registered');A.eq(reg.get('fs.write_docx').requiresConsent,true,'DOCX requires consent');
  const doc={path:'reports/summary.docx',title:'Quarterly & Review',blocks:[{type:'heading',text:'Findings <today>'},{type:'paragraph',text:'Revenue = 42\r\nVerified\t& complete.'},{type:'bullet',text:'No formulas: =1+1'}]};
  const result=await tools.writeDocxTool.run(doc,ctx),abs=path.join(ROOT,'docxfixture',doc.path),bytes=fs.readFileSync(abs);
  A.eq(result.receipt.state,'read-back-verified','write has exact verified receipt');A.eq(result.receipt.verifiedBytes,bytes.length,'receipt byte size matches file');
  const read=await tools.readTool.run({path:doc.path},ctx);A.ok(read.content.includes('Quarterly & Review')&&read.content.includes('Findings <today>')&&read.content.includes('Revenue = 42\nVerified\t& complete.')&&read.content.includes('No formulas: =1+1'),'existing DOCX reader extracts text with explicit line breaks and tabs');
  const entries=extract._internals.readEntries(bytes),rawXml=extract._internals.entryBytes(bytes,entries.get('word/document.xml'),zlib.inflateRawSync).toString('utf8'),styleXml=extract._internals.entryBytes(bytes,entries.get('word/styles.xml'),zlib.inflateRawSync).toString('utf8');
  A.eq(Array.from(entries.keys()),['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml','word/_rels/document.xml.rels'],'package contains only document, styles and required OOXML relationship parts');
  A.ok(rawXml.includes('<w:br/>')&&rawXml.includes('<w:tab/>')&&rawXml.includes('&lt;today&gt;')&&rawXml.includes('\u2022'),'raw document XML encodes line breaks, tabs, bullet and escaped text as intended');
  A.ok(!/vbaProject|externalLink|<w:hyperlink|<w:object|<w:tbl|<w:f\b/i.test(rawXml)&&!Array.from(entries.keys()).some(k=>/vbaProject|externalLink|embeddings|oleObject/i.test(k)),'raw OOXML has no macros, links, embedded objects, tables or formulas');
  A.ok(/<w:sz w:val="32"\/><\/w:rPr>/.test(styleXml)&&/w:color w:val="000000"/.test(styleXml)&&!styleXml.includes('ListBullet'),'title and headings have real black type styling and no dangling list numbering style');
  const smallest=createDocxReport({title:'T',blocks:[]},1<<20);
  A.eq(createDocxReport({title:'T',blocks:[]},smallest.length).length,smallest.length,'serialized byte boundary accepts exact resulting size');
  let oneByteShort=false;try{createDocxReport({title:'T',blocks:[]},smallest.length-1)}catch(_){oneByteShort=true}A.ok(oneByteShort,'serialized byte boundary rejects a document one byte too large');
  const ledger=makeArtifactCollector();ledger.observe({toolName:'fs.write_docx',args:{path:doc.path},result});A.eq(ledger.list(),[{kind:'file',path:doc.path,bytes:bytes.length}],'verified DOCX appears as downloadable file artifact');
  const noReceipt=makeArtifactCollector();noReceipt.observe({toolName:'fs.write_docx',args:{path:doc.path},result:{ok:true}});A.eq(noReceipt.count(),0,'artifact omitted without matching verified receipt');
  const invalid=[{title:'bad',blocks:[{type:'paragraph',text:'\ud800'}]},{title:'bad',blocks:[{type:'paragraph',text:'bad\u0001control'}]},{title:'bad',blocks:[{type:'paragraph',text:'x'.repeat(8193)}]},{title:'bad',blocks:Array.from({length:301},()=>({type:'paragraph',text:'x'}))},{title:'bad',blocks:[{type:'script',text:'x'}]}];
  for(const d of invalid){let failed=false;try{await tools.writeDocxTool.run({path:'reports/reject.docx',...d},ctx)}catch(_){failed=true}A.ok(failed,'invalid DOCX input rejected');A.ok(!fs.existsSync(path.join(ROOT,'docxfixture','reports','reject.docx')),'invalid DOCX does not mutate filesystem');}
  let traversal=false;try{await tools.writeDocxTool.run({...doc,path:'../escape.docx'},ctx)}catch(_){traversal=true}A.ok(traversal,'jail rejects DOCX path traversal');
  const tinyRoot=path.join(ROOT,'tiny'),tiny=makeFsTools({fsp,pathMod:path,root:tinyRoot,limits:{writeBytes:120}});let tooLarge=false;try{await tiny.writeDocxTool.run(doc,ctx)}catch(_){tooLarge=true}A.ok(tooLarge,'DOCX over configured byte limit rejected');A.ok(!fs.existsSync(path.join(tinyRoot,'docxfixture','reports','summary.docx')),'byte-limit rejection precedes filesystem mutation');
  const staleTools=makeFsTools({fsp,pathMod:path,root:ROOT,docExtract:extract});await staleTools.readTool.run({path:doc.path},ctx);fs.appendFileSync(abs,'drift');fs.utimesSync(abs,new Date(),new Date(Date.now()+5000));let stale=false;try{await staleTools.writeDocxTool.run(doc,ctx)}catch(e){stale=/stale write refused/.test(e.message)}A.ok(stale,'freshness guard refuses changed document');A.ok(fs.readFileSync(abs).subarray(-5).equals(Buffer.from('drift')),'stale refusal preserves changed bytes');
 }finally{fs.rmSync(ROOT,{recursive:true,force:true})}
 A.report('fs.write-docx.test');
})().catch(e=>{console.error(e);process.exit(1)});
