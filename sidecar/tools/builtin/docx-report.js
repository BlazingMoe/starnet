'use strict';

const { _internals } = require('./xlsx-table.js');

const esc = s => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
const TEXT_OPEN = '<w:r><w:t xml:space="preserve">';
const TEXT_CLOSE = '</w:t></w:r>';
function textRuns(s) {
  const out=[]; let start=0, i=0;
  while(i<s.length) {
    const c=s[i]; if(c!=='\r'&&c!=='\n'&&c!=='\t'){i++;continue;}
    if(i>start)out.push(TEXT_OPEN+esc(s.slice(start,i))+TEXT_CLOSE);
    if(c==='\t') { out.push('<w:r><w:tab/></w:r>'); i++; }
    else { out.push('<w:r><w:br/></w:r>'); i += c==='\r'&&s[i+1]==='\n' ? 2 : 1; }
    start=i;
  }
  if(i>start||!out.length)out.push(TEXT_OPEN+esc(s.slice(start))+TEXT_CLOSE);
  return out.join('');
}
function textRunBytes(s) {
  let bytes=0,start=0,i=0;
  while(i<s.length){const c=s[i];if(c!=='\r'&&c!=='\n'&&c!=='\t'){i++;continue;}
    if(i>start)bytes+=Buffer.byteLength(TEXT_OPEN+esc(s.slice(start,i))+TEXT_CLOSE,'utf8');
    if(c==='\t'){bytes+=Buffer.byteLength('<w:r><w:tab/></w:r>','utf8');i++;}
    else{bytes+=Buffer.byteLength('<w:r><w:br/></w:r>','utf8');i+=c==='\r'&&s[i+1]==='\n'?2:1;}start=i;
  }
  if(i>start||bytes===0)bytes+=Buffer.byteLength(TEXT_OPEN+esc(s.slice(start))+TEXT_CLOSE,'utf8');
  return bytes;
}
function text(s, label) {
  if (typeof s !== 'string') throw new Error(label + ' must be a string');
  if (s.length > 8192) throw new Error(label + ' exceeds 8192 characters');
  for (let i=0;i<s.length;i++) {
    const c=s.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff){if(!(s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff))throw new Error(label+' contains a malformed Unicode surrogate');i++;}
    else if(c>=0xdc00&&c<=0xdfff)throw new Error(label+' contains a malformed Unicode surrogate');
  }
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(s)) throw new Error(label+' contains an unsupported XML character');
  return s;
}
function createDocxReport(doc, maxBytes) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('write byte limit must be a positive safe integer');
  if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error('document must be an object');
  const title=text(doc.title,'title');
  if(!Array.isArray(doc.blocks)||doc.blocks.length>300)throw new Error('blocks must contain at most 300 items');
  const para=(s,style)=>'<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>'+textRuns(s)+'</w:p>';
  const accepted=[];
  function encodedLength(s,style){return Buffer.byteLength('<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>','utf8')+textRunBytes(s)+Buffer.byteLength('</w:p>','utf8');}
  let bodyBytes=encodedLength(title,'Title');
  for(let i=0;i<doc.blocks.length;i++){
    const b=doc.blocks[i]; if(!b||typeof b!=='object'||!['heading','paragraph','bullet'].includes(b.type))throw new Error('block '+(i+1)+' type must be heading, paragraph, or bullet');
    const value=text(b.text,'block '+(i+1)+' text');
    const rendered=b.type==='bullet'?'\u2022 '+value:value, style=b.type==='heading'?'Heading1':'Normal';
    bodyBytes+=encodedLength(rendered,style); accepted.push({text:rendered,style});
  }
  const files=[
    {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'},
    {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
    {name:'word/document.xml',data:''},
    {name:'word/styles.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri"/><w:color w:val="000000"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri"/><w:color w:val="000000"/><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri"/><w:color w:val="000000"/><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>'},
    {name:'word/_rels/document.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'}
  ];
  // Reserve archive headers and static XML before creating the aggregate ZIP buffer.
  const overhead=22+files.reduce((n,f)=>n+30+46+Buffer.byteLength(f.name,'utf8')*2,0);
  const staticBytes=files.reduce((n,f)=>n+Buffer.byteLength(f.data,'utf8'),0)-Buffer.byteLength(files[2].data,'utf8');
  const section='<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  const fixed='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+section+'</w:body></w:document>';
  if(overhead+staticBytes+Buffer.byteLength(fixed,'utf8')+bodyBytes>maxBytes)throw new Error('DOCX file too large: serialized document exceeds '+maxBytes+' bytes');
  const body=[para(title,'Title'),...accepted.map(b=>para(b.text,b.style))];
  files[2].data='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body.join('')+section+'</w:body></w:document>';
  const out=_internals.zipStore(files);
  if(out.length>maxBytes)throw new Error('DOCX file too large ('+out.length+' > '+maxBytes+' bytes)');
  return out;
}
module.exports={createDocxReport};
