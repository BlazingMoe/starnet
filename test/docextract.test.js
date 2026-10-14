/* node test/docextract.test.js — DOCUMENT-TO-TEXT for fs.read (.docx / .xlsx / .ipynb).

   fs.read decoded everything as UTF-8, so the three formats a Commander actually keeps work in came back as
   binary noise: the agent could see the file existed and had no way to read it. OOXML is a ZIP of XML and a
   notebook is plain JSON, so all three are readable with what Node already ships — NO new dependency, which
   is a hard constraint (a native zip/office dep cuts against the Tauri-shippable desktop bundle).

   The ZIP fixtures here are BUILT BYTE BY BYTE rather than checked in: a real central directory, real local
   headers, and both storage methods (stored and deflate), so the reader is proven against the actual format
   instead of against a blob someone once generated. */
'use strict';
const A = require('./_assert.js');
const zlib = require('node:zlib');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { makeDocExtract } = require('../sidecar/tools/builtin/docextract.js');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');

const doc = makeDocExtract({ inflateRaw: zlib.inflateRawSync });

/* ---- a minimal but REAL zip writer, so the reader is tested against the format, not against itself ---- */
function zip(files, opts) {
  opts = opts || {};
  const locals = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const deflate = opts.store !== true;
    const body = deflate ? zlib.deflateRawSync(data) : data;
    const method = deflate ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt32LE(0, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(method, 10); ch.writeUInt32LE(0, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const localBuf = Buffer.concat(locals), centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22 + (opts.comment ? opts.comment.length : 0));
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  if (opts.comment) { eocd.writeUInt16LE(opts.comment.length, 20); Buffer.from(opts.comment).copy(eocd, 22); }
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

const DOCX = (body) => zip({ '[Content_Types].xml': '<x/>', 'word/document.xml': '<?xml version="1.0"?><w:document><w:body>' + body + '</w:body></w:document>' });

(async () => {
  // ---- 1. DOCX: paragraphs become lines, runs inside a paragraph join, entities decode ----
  {
    const buf = DOCX('<w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p>' +
                     '<w:p><w:r><w:t>Tom &amp; Jerry &lt;3</w:t></w:r></w:p>' +
                     '<w:p><w:r><w:t>a</w:t></w:r><w:tab/><w:r><w:t>b</w:t></w:r></w:p>');
    A.eq(doc.sniff('report.docx', buf), 'docx', 'a .docx with ZIP magic sniffs as docx');
    const text = doc.extract(buf, 'docx');
    A.eq(text.split('\n')[0], 'Hello world', 'runs inside one paragraph join into one line');
    A.eq(text.split('\n')[1], 'Tom & Jerry <3', 'XML entities decode (and &amp; resolves LAST, not into a tag)');
    A.eq(text.split('\n')[2], 'a\tb', 'a w:tab becomes a real tab');
  }

  // ---- 2. XLSX: shared strings resolve, inline strings work, sheets are NAMED, empty rows vanish ----
  {
    const buf = zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="Q3 Actuals" sheetId="1"/><sheet name="Notes" sheetId="2"/></sheets></workbook>',
      'xl/sharedStrings.xml': '<sst><si><t>Region</t></si><si><t>Rev</t></si><si><t>EM</t><t>EA</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1250.5</v></c></row>' +
        '<row r="3"><c r="A3"/><c r="B3"/></row>' +
        '<row r="4"><c r="A4" t="inlineStr"><is><t>inline!</t></is></c></row>' +
        '</sheetData></worksheet>',
      'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData></worksheet>'
    });
    const text = doc.extract(buf, 'xlsx');
    A.ok(/^### Q3 Actuals$/m.test(text), 'the sheet is labelled with its real NAME from workbook.xml');
    A.ok(/^Region\tRev$/m.test(text), 'shared-string cells resolve and a row is tab separated');
    A.ok(/^EMEA\t1250\.5$/m.test(text), 'a multi-run shared string joins, and a numeric cell passes through');
    // The empty <row r="3"> must vanish entirely: the Q3 block holds exactly its three real rows.
    const q3 = text.split('### ')[1].split('\n').slice(1).filter(Boolean);
    A.eq(q3.length, 3, 'a fully empty row is dropped rather than emitted as a line of blank tabs');
    A.ok(/inline!/.test(text), 'an inlineStr cell is read');
    A.ok(/^### Notes$/m.test(text), 'the second sheet is present, under its own name');
  }

  // Sparse Excel rows must retain their column positions, including explicit empty cells.
  {
    const buf = zip({
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Cost</t></is></c><c r="C1" t="inlineStr"><is><t>Count</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Paper</t></is></c><c r="C2"><v>9</v></c></row>' +
        '<row r="3"><c r="A3"/><c r="C3"><v>4</v></c></row>' +
        '<row r="4"><c r="AA4"><v>27</v></c></row>' +
        '<row r="5"><c r="XFD5"><v>16384</v></c><c r="B5"><v>2</v></c></row>' +
        '</sheetData></worksheet>'
    });
    const text = doc.extract(buf, 'xlsx');
    A.ok(text.includes('Paper\t\t9'), 'omitted B cell does not shift C beneath Cost');
    A.ok(text.includes('\n\t\t4\n'), 'self-closing empty cell does not swallow the next value');
    A.ok(text.includes('\n' + '\t'.repeat(26) + '27\n'), 'multi-letter column AA retains its index');
    A.ok(text.includes('\n\t2\n'), 'out-of-order in-range cells remain readable after a far column');
    A.ok(text.includes('[columns beyond 256 omitted]'), 'column bound is disclosed');
    A.ok(!text.includes('16384'), 'far columns do not create unbounded output');
  }

  // ---- 3. IPYNB: source AND outputs — the RESULT is usually the answer, not the code ----
  // Structured, bounded sheet discovery and coordinate reads retain workbook relationships and formula limits.
  {
    const buf = zip({
      'xl/workbook.xml':'<workbook><sheets><sheet name="Sales &amp; Ops" sheetId="4" state="hidden" r:id="rId1"/><sheet name="Broken" sheetId="5" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet7.xml"/><Relationship Id="rId2" Target="worksheets/gone.xml"/></Relationships>',
      'xl/sharedStrings.xml':'<sst><si><t>Shared</t></si></sst>',
      'xl/worksheets/sheet7.xml':'<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" t="inlineStr"><is><t>Inline</t></is></c><c r="D2"><f>A2+1</f><v>7</v></c><c r="E2"><f>1+1</f></c><c r="F2" t="b"><v>1</v></c><c r="G2" t="e"><v>#N/A</v></c><c r="H2" t="d"><v>2026-01-02T00:00:00Z</v></c></row></sheetData></worksheet>'
    });
    const sheets=doc.xlsxSheets(buf);
    A.eq(sheets[0].name,'Sales & Ops','worksheet names resolve XML entities');
    A.eq(sheets[0].state,'hidden','worksheet visibility state is discovered');
    A.eq(sheets[0].available,true,'worksheet relation resolves its actual XML target');
    A.eq(sheets[1].available,false,'a missing worksheet part is reported explicitly');
    const page=doc.xlsxRange(buf,{sheet:'Sales & Ops',startRow:2,rowCount:1,startCol:1,colCount:8});
    A.eq(page.rows[0].cells[0].value,'Shared','shared string is resolved');
    A.eq(page.rows[0].cells[1].value,null,'missing B2 stays null with its coordinate');
    A.eq(page.rows[0].cells[2].value,'Inline','inline string is resolved');
    A.eq(page.rows[0].cells[3].value,'7','cached formula value is returned as stored text');
    A.eq(page.rows[0].cells[3].formula,'A2+1','formula is surfaced as inert text');
    A.eq(page.rows[0].cells[3].formulaCache,'present_unverified','present cached formula values are explicitly unverified');
    A.eq(page.rows[0].cells[4].value,null,'formula without cache has no invented result');
    A.eq(page.rows[0].cells[4].cachedValueMissing,true,'missing formula cache is flagged');
    A.eq(page.rows[0].cells[5].valueType,'boolean','boolean cell types remain distinct');
    A.eq(page.rows[0].cells[5].value,true,'boolean cell value is decoded');
    A.eq(page.rows[0].cells[6].valueType,'error','error cell type remains distinct from numeric data');
    A.eq(page.rows[0].cells[7].valueType,'dateRaw','ISO date cell is explicitly raw');
    A.eq(page.rows[0].cells[7].value,'2026-01-02T00:00:00Z','date values are not interpreted or formatted');
    let bad=false; try { doc.xlsxRange(buf,{sheet:'Broken',startRow:1,rowCount:1,startCol:1,colCount:1}); } catch (_) { bad=true; }
    A.ok(bad,'reading a named sheet whose part is missing fails explicitly');
    bad=false; try { doc.xlsxSheets(zip({'other.xml':'<x/>'})); } catch (_) { bad=true; }
    A.ok(bad,'a ZIP without workbook metadata is malformed, not an empty workbook');
    bad=false; try { doc.xlsxRange(buf,{sheet:'Sales & Ops',startRow:1,rowCount:101,startCol:1,colCount:1}); } catch (_) { bad=true; }
    A.ok(bad,'row-page bounds are enforced by the extractor API');
    bad=false; try { doc.xlsxRange(buf,{sheetIndex:0,startRow:1048576,rowCount:2,startCol:1,colCount:1}); } catch (_) { bad=true; }
    A.ok(bad,'the final worksheet row cannot overflow into an unbounded range');
    A.eq(doc.xlsxRange(buf,{sheetIndex:0,startRow:1048576,rowCount:1,startCol:1,colCount:1}).range.endRow,1048576,'the final legal worksheet row can be read');
    const malformed=zip({'xl/workbook.xml':'<workbook><sheets><sheet name="Data" sheetId="1" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1"><v>5</c></row></sheetData></worksheet>'});
    bad=false; try { doc.xlsxRange(malformed,{sheetIndex:0,startRow:1,rowCount:1,startCol:1,colCount:1}); } catch (_) { bad=true; }
    A.ok(bad,'malformed worksheet XML fails closed instead of synthesizing empty cells');
    const namespaced=zip({'xl/workbook.xml':'<workbook><sheets><sheet name="Data" sheetId="1" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<x:worksheet><x:sheetData/></x:worksheet>'});
    bad=false; try { doc.xlsxRange(namespaced,{sheetIndex:0,startRow:1,rowCount:1,startCol:1,colCount:1}); } catch (_) { bad=true; }
    A.ok(bad,'namespace-prefixed worksheet elements fail explicitly as unsupported');
    const rowBoundary=zip({'xl/workbook.xml':'<workbook><sheets><sheet name="Data" sheetId="1" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"/><row r="2"><c r="A2"><v>5</v></c></row></sheetData></worksheet>'});
    A.eq(doc.xlsxRange(rowBoundary,{sheetIndex:0,startRow:2,rowCount:1,startCol:1,colCount:1}).rows[0].cells[0].value,'5','a self-closing row cannot consume the following populated row');
    const spacedEquals=zip({'xl/workbook.xml':'<workbook><sheets><sheet name = "Data" sheetId="1" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r = "1"><c r="A1"><v>5</v></c></row></sheetData></worksheet>'});
    bad=false; try { doc.xlsxRange(spacedEquals,{sheetIndex:0,startRow:1,rowCount:1,startCol:1,colCount:1}); } catch (_) { bad=true; }
    A.ok(bad,'whitespace around structured XML attribute equals is rejected rather than silently dropping coordinates');
    const singleQuoted=zip({'xl/workbook.xml':"<workbook><sheets><sheet name='Data' sheetId='1' r:id='r1'/></sheets></workbook>"});
    bad=false; try { doc.xlsxSheets(singleQuoted); } catch (_) { bad=true; }
    A.ok(bad,'single-quoted XML attributes fail explicitly instead of yielding an empty sheet list');
    const bomb=zip({'xl/workbook.xml':'<workbook><sheets><sheet name="Data" sheetId="1" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'x'.repeat(16*1024*1024+1)});
    bad=false; try { doc.xlsxRange(bomb,{sheet:'Data',startRow:1,rowCount:1,startCol:1,colCount:1}); } catch (_) { bad=true; }
    A.ok(bad,'a compressed ZIP entry cannot expand beyond the per-entry output bound');
  }

  // ---- 3. IPYNB: source AND outputs — the RESULT is usually the answer, not the code ----
  {
    const nb = Buffer.from(JSON.stringify({
      metadata: { kernelspec: { language: 'python' } },
      cells: [
        { cell_type: 'markdown', source: ['# Title\n', 'some prose'] },
        { cell_type: 'code', source: 'print(2+2)\n', outputs: [{ output_type: 'stream', text: ['4\n'] }] },
        { cell_type: 'code', source: 'df.head()', outputs: [{ output_type: 'execute_result', data: { 'text/plain': '   a\n0  1' } }] },
        { cell_type: 'code', source: 'boom()', outputs: [{ output_type: 'error', ename: 'ValueError', evalue: 'nope' }] },
        { cell_type: 'code', source: 'plot()', outputs: [{ output_type: 'display_data', data: { 'image/png': 'BASE64' } }] }
      ]
    }), 'utf8');
    A.eq(doc.sniff('analysis.ipynb'), 'ipynb', '.ipynb sniffs without needing the bytes');
    const text = doc.extract(nb, 'ipynb');
    A.ok(/# Title\nsome prose/.test(text), 'markdown cells come through as prose');
    A.ok(/```python  # cell 2\nprint\(2\+2\)\n```/.test(text), 'code cells are fenced and numbered');
    A.ok(/\[output\]\n4/.test(text), 'stream output is kept — it is usually the answer');
    A.ok(/\[output\]\n {3}a\n0 {2}1/.test(text), 'a text/plain execute_result is kept');
    A.ok(/\[error\] ValueError: nope/.test(text), 'an error output is surfaced, not silently dropped');
    A.ok(/not text, omitted/.test(text), 'a non-text output is NAMED as omitted rather than pretended away');
  }

  // ---- 4. THE ZIP READER against the real format: stored entries, and a trailing archive comment ----
  {
    const stored = zip({ 'word/document.xml': '<w:p><w:r><w:t>stored</w:t></w:r></w:p>' }, { store: true });
    A.eq(doc.extract(stored, 'docx'), 'stored', 'an UNCOMPRESSED (method 0) entry reads');
    const commented = zip({ 'word/document.xml': '<w:p><w:r><w:t>commented</w:t></w:r></w:p>' }, { comment: 'x'.repeat(300) });
    A.eq(doc.extract(commented, 'docx'), 'commented', 'the EOCD is found past a 300-byte archive comment (not just the last 22 bytes)');
  }

  // The structured XLSX entry bound is opt-in: historic fs.read document extraction retains its prior cap.
  {
    const expanded=DOCX('<w:p><w:r><w:t>'+'x'.repeat(16*1024*1024+1)+'</w:t></w:r></w:p>');
    A.ok(doc.extract(expanded,'docx',{maxChars:32}).endsWith('…[truncated]'),'the XLSX structured ZIP bound does not reduce existing fs.read DOCX extraction');
  }

  // ---- 5. HONEST FAILURE. A malformed or mislabelled document must not be reported as empty content. ----
  {
    let threw = false;
    try { doc.extract(Buffer.from('PK\x03\x04 not really a zip'), 'docx'); } catch (_) { threw = true; }
    A.ok(threw, 'a corrupt archive throws instead of returning silence');
    try { doc.extract(zip({ 'other.xml': '<x/>' }), 'docx'); threw = true; } catch (_) { threw = true; }
    A.ok(threw, 'a zip with no word/document.xml is not a Word document');
    try { doc.extract(Buffer.from('{not json'), 'ipynb'); } catch (_) { threw = true; }
    A.ok(threw, 'an unparseable notebook throws');
    A.eq(doc.sniff('notes.docx', Buffer.from('just text, honest')), null,
      'a file merely NAMED .docx that is not a ZIP is not claimed as a document');
  }

  // ---- 6. END TO END through fs.read — including the fall-through that keeps a mislabelled file readable ----
  {
    const ROOT = path.join(os.tmpdir(), 'starnet-docx-test-' + process.pid);
    const fsTools = makeFsTools({ fsp, pathMod: path, root: ROOT, docExtract: doc, redact:s=>String(s).replace(/secret@domain\.test|hidden/g,'[REDACTED]'), limits: { readReturn: 100000 } });
    const { readTool } = fsTools;
    const CTX = { agentId: 'ag', emit: () => {} };
    await fsp.mkdir(path.join(ROOT, 'ag'), { recursive: true });
    try {
      await fsp.writeFile(path.join(ROOT, 'ag', 'r.docx'), DOCX('<w:p><w:r><w:t>from disk</w:t></w:r></w:p>'));
      const r = await readTool.run({ path: 'r.docx' }, CTX);
      A.eq(r.content, 'from disk', 'fs.read returns extracted TEXT for a .docx, not binary noise');
      A.ok(/docx/.test(r.summary), 'the summary says the file was extracted');

      const book=zip({
        'xl/workbook.xml':'<workbook><sheets><sheet name="secret@domain.test" sheetId="secret@domain.test" state="hidden" r:id="r1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>secret@domain.test</t></is></c></row></sheetData></worksheet>'
      });
      await fsp.writeFile(path.join(ROOT,'ag','data.xlsx'),book);
      const tools=fsTools;
      const listed=JSON.parse((await tools.xlsxSheetsTool.run({path:'data.xlsx'},CTX)).content);
      A.eq(listed.sheets[0].name,'[REDACTED]','cabinet sheet listing redacts workbook names');
      A.eq(listed.sheets[0].sheetId,'[REDACTED]','cabinet sheet listing redacts worksheet IDs');
      A.eq(listed.sheets[0].state,'[REDACTED]','cabinet sheet listing redacts worksheet state metadata');
      A.ok(!JSON.stringify(listed).includes('secret@domain.test'),'no raw worksheet metadata escapes in the sheet listing');
      const sheetNodes=Array.from({length:101},(_,i)=>'<sheet name="'+(i===0?'n'.repeat(400):'S'+i)+'" sheetId="'+(i+1)+'" r:id="r'+i+'"/>').join('');
      await fsp.writeFile(path.join(ROOT,'ag','many-sheets.xlsx'),zip({'xl/workbook.xml':'<workbook><sheets>'+sheetNodes+'</sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships></Relationships>'}));
      const sheetPage=JSON.parse((await tools.xlsxSheetsTool.run({path:'many-sheets.xlsx'},CTX)).content);
      A.eq(sheetPage.status,'partial','worksheet metadata is paged with an explicit partial status');
      A.eq(sheetPage.sheets.length,100,'worksheet metadata page count is bounded');
      A.eq(sheetPage.omitted.after.end,100,'omitted worksheet indexes are explicit');
      A.eq(sheetPage.sheets[0].nameTruncated,true,'clipped worksheet names are marked');
      A.ok((await tools.xlsxSheetsTool.run({path:'many-sheets.xlsx'},CTX)).content.length<60000,'worksheet metadata output stays within its character cap');
      const sheetPage2=JSON.parse((await tools.xlsxSheetsTool.run({path:'many-sheets.xlsx',offset:100,limit:100},CTX)).content);
      A.eq(sheetPage2.sheets[0].sheetIndex,100,'sheet metadata pagination continues by stable index');
      A.eq(sheetPage2.status,'partial','a later metadata page reports partial coverage of the full workbook');
      A.eq(sheetPage2.omitted.before.start,0,'earlier omitted metadata indexes remain explicit');
      const page=JSON.parse((await tools.xlsxRangeTool.run({path:'data.xlsx',sheetIndex:0,startRow:1,rowCount:1,startCol:1,colCount:2},CTX)).content);
      A.eq(page.sheet,'[REDACTED]','range response redacts selected worksheet metadata');
      A.eq(page.rows[0].cells[0].value,'[REDACTED]','XLSX cell values pass through configured secret-pattern redaction');
      A.eq(page.rows[0].cells[1].coordinate,'B1','the requested missing coordinate is returned');
      A.eq(page.rows[0].cells[1].value,null,'the missing coordinate is explicitly null');
      A.ok((await fsp.readFile(path.join(ROOT,'ag','data.xlsx'))).equals(book),'read-only XLSX tools leave source bytes unchanged');
      const manyRows=[];
      const columnName=n=>{let out='';while(n){const rem=(n-1)%26;out=String.fromCharCode(65+rem)+out;n=Math.floor((n-1)/26);}return out;};
      for(let rr=1;rr<=100;rr++) manyRows.push('<row r="'+rr+'">'+Array.from({length:64},(_,ci)=>'<c r="'+columnName(ci+1)+rr+'" t="inlineStr"><is><t>'+('v'.repeat(500))+'</t></is></c>').join('')+'</row>');
      const largeBook=zip({'xl/workbook.xml':'<workbook><sheets><sheet name="Data" sheetId="1" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData>'+manyRows.join('')+'</sheetData></worksheet>'});
      await fsp.writeFile(path.join(ROOT,'ag','large.xlsx'),largeBook);
      const limited=JSON.parse((await tools.xlsxRangeTool.run({path:'large.xlsx',sheetIndex:0,startRow:1,rowCount:100,startCol:1,colCount:64},CTX)).content);
      A.eq(limited.status,'partial','an oversized page is marked partial instead of silently clipped');
      A.eq(limited.omitted.reason,'output_limit','the output-limit reason is explicit');
      A.eq(limited.omitted.range.startRow,1,'the omitted requested range is preserved as evidence');
      A.eq(limited.rows.length,0,'the tool returns no misleading partial subset of the requested rectangle');
      await fsp.writeFile(path.join(ROOT,'ag','too-large.xlsx'),Buffer.alloc(16*1024*1024+1));
      let rejected=false; try { await tools.xlsxSheetsTool.run({path:'too-large.xlsx'},CTX); } catch (_) { rejected=true; }
      A.ok(rejected,'the archive size cap rejects oversized input before parsing');

      // A file someone named .docx that is really text must still be readable — the extractor falls through.
      await fsp.writeFile(path.join(ROOT, 'ag', 'fake.docx'), 'actually plain text', 'utf8');
      const f = await readTool.run({ path: 'fake.docx' }, CTX);
      A.eq(f.content, 'actually plain text', 'a mislabelled document falls through to the plain read');

      // And an ordinary text file is completely untouched by any of this.
      await fsp.writeFile(path.join(ROOT, 'ag', 'plain.txt'), 'hello', 'utf8');
      A.eq((await readTool.run({ path: 'plain.txt' }, CTX)).content, 'hello', 'ordinary text reads exactly as before');

      // Unwired extractor = the historic behavior, byte for byte.
      const bare = makeFsTools({ fsp, pathMod: path, root: ROOT, limits: { readReturn: 100000 } });
      const b = await bare.readTool.run({ path: 'r.docx' }, CTX);
      A.ok(b.content.indexOf('from disk') < 0, 'with no docExtract wired, a .docx still decodes as raw bytes (unchanged)');
    } finally { await fsp.rm(ROOT, { recursive: true, force: true }); }
  }

  A.report('docextract.test');
})().catch(e => { console.log('FAIL: docextract.test threw -- ' + (e && e.stack || e)); process.exit(1); });
