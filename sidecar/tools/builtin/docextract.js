/* sidecar/tools/builtin/docextract.js — DOCUMENT-TO-TEXT for fs.read.

   fs.read decoded everything as UTF-8, so a .docx / .xlsx / .ipynb came back as binary noise — the agent could
   see that a file existed and had no way to read it. Those three are the formats a Commander actually keeps
   work in, and all three are readable with what Node already ships: OOXML is a ZIP of XML, and a notebook is
   plain JSON. NO NEW DEPENDENCY — that is a hard constraint here (the desktop bundle is Tauri-shippable and a
   native zip/office dep would cut against it), which is why this file carries its own small ZIP reader.

   DELIBERATELY LOSSY AND HONEST ABOUT IT. This extracts the TEXT a reader would see: paragraphs from a
   document, cells from a sheet, source and text output from a notebook. Styling, images, formulas-as-formulas,
   charts and comments are dropped. A caller that needs fidelity should open the file, not read it.

   makeDocExtract({ inflateRaw }) -> { sniff, extract, _internals }
     inflateRaw(buf) -> Buffer     // zlib.inflateRawSync, injected so this module stays pure + testable
     sniff(nameOrPath, buf?) -> 'docx' | 'xlsx' | 'ipynb' | null
     extract(buf, kind, opts?) -> string        // throws on a malformed container; the caller falls back */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SK = root.SK || {}; root.SK.tools = root.SK.tools || {}; (root.SK.tools.builtin = root.SK.tools.builtin || {}).docextract = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_MAX_CHARS = 200000;
  const MAX_SHEET_ROWS = 5000;      // a spreadsheet can be a million rows; the prompt cannot
  const MAX_ROW_CELLS = 256;
  const MAX_STRUCTURED_ENTRY_BYTES = 16 * 1024 * 1024;
  const MAX_XLSX_SHEETS = 10000;

  const EOCD_SIG = 0x06054b50, CEN_SIG = 0x02014b50, LOC_SIG = 0x04034b50;

  function extOf(nameOrPath) {
    const base = String(nameOrPath == null ? '' : nameOrPath).split(/[\\/]/).pop() || '';
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  }
  // Extension decides, but a ZIP magic check keeps a mislabelled file from being reported as a broken document
  // when it is really just a text file someone named .docx.
  function sniff(nameOrPath, buf) {
    const ext = extOf(nameOrPath);
    if (ext === 'ipynb') return 'ipynb';
    if (ext !== 'docx' && ext !== 'xlsx') return null;
    if (buf && buf.length >= 2 && !(buf[0] === 0x50 && buf[1] === 0x4b)) return null;   // not a ZIP -> not OOXML
    return ext;
  }

  /* ---- the ZIP reader. Central-directory driven (the only authoritative index in the format); the local
     header is consulted purely to find where each entry's bytes actually start, because its name/extra
     lengths can legally differ from the central copy. ---- */
  function findEocd(buf) {
    // The comment field is up to 64k, so the record is not necessarily the last 22 bytes.
    const from = Math.max(0, buf.length - 22 - 0xffff);
    for (let i = buf.length - 22; i >= from; i--) {
      if (buf.readUInt32LE(i) === EOCD_SIG) return i;
    }
    return -1;
  }
  function readEntries(buf) {
    const eocd = findEocd(buf);
    if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    if (p === 0xffffffff) throw new Error('zip64 archives are not supported');
    const out = new Map();
    for (let i = 0; i < count && p + 46 <= buf.length; i++) {
      if (buf.readUInt32LE(p) !== CEN_SIG) break;
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const cmtLen = buf.readUInt16LE(p + 32);
      const localAt = buf.readUInt32LE(p + 42);
      const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
      out.set(name, { method, compSize, localAt });
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return out;
  }
  function entryBytes(buf, e, inflateRaw, maxOutputBytes) {
    if (!e || e.localAt + 30 > buf.length || buf.readUInt32LE(e.localAt) !== LOC_SIG) throw new Error('corrupt zip entry');
    const nameLen = buf.readUInt16LE(e.localAt + 26);
    const extraLen = buf.readUInt16LE(e.localAt + 28);
    const start = e.localAt + 30 + nameLen + extraLen;
    const raw = buf.slice(start, start + e.compSize);
    if (e.method === 0) return raw;                       // stored
    if (e.method === 8) return maxOutputBytes ? inflateRaw(raw, { maxOutputLength:maxOutputBytes }) : inflateRaw(raw);
    throw new Error('unsupported zip compression method ' + e.method);
  }
  const readText = (buf, entries, name, inflateRaw, maxOutputBytes) => {
    const e = entries.get(name);
    return e ? entryBytes(buf, e, inflateRaw, maxOutputBytes).toString('utf8') : null;
  };

  // The XLSX reader below is deliberately a small OOXML subset parser, not a general XML parser. Validate
  // structure first so unsupported namespace-prefixed elements, single-quoted attributes and malformed tags
  // cannot quietly turn into an all-null rectangle.
  function validateXml(xml, rootName, label) {
    const stack=[], tokens=/<[^>]*>/g;
    let cursor=0, roots=0, match;
    while((match=tokens.exec(xml))){
      const text=xml.slice(cursor,match.index);
      if(text.includes('<')||(!stack.length&&text.trim())) throw new Error(label+' XML is malformed');
      cursor=tokens.lastIndex;
      const token=match[0];
      if(token.startsWith('<!--')&&token.endsWith('-->')) continue;
      if(token.startsWith('<?')&&token.endsWith('?>')) continue;
      if(token.startsWith('<!')) throw new Error(label+' XML declaration/DTD/CDATA is unsupported');
      const tag=/^<(\/)?([A-Za-z_][\w.-]*)([\s\S]*?)(\/?)>$/.exec(token);
      if(!tag) throw new Error(label+' XML contains an unsupported tag');
      const closing=!!tag[1], name=tag[2], attrs=tag[3], selfClose=!!tag[4];
      if(name.includes(':')) throw new Error(label+' XML namespace-prefixed elements are unsupported');
      if(closing){ if(attrs.trim()||selfClose||stack.pop()!==name) throw new Error(label+' XML has mismatched tags'); continue; }
      let at=0; const attrRe=/\s+([A-Za-z_:][\w:.-]*)="([^"]*)"/gy; let a;
      while(at<attrs.length){
        if(!attrs.slice(at).trim()) { at=attrs.length; break; }
        attrRe.lastIndex=at; a=attrRe.exec(attrs);
        if(!a) throw new Error(label+' XML has unsupported or malformed attributes');
        if(a[2][0]==="'") throw new Error(label+' XML single-quoted attributes are unsupported');
        at=attrRe.lastIndex;
      }
      if(!stack.length){ roots++; if(name!==rootName) throw new Error(label+' XML root is unsupported'); }
      if(!selfClose) stack.push(name);
    }
    const tail=xml.slice(cursor);
    if(tail.includes('<')||(!stack.length&&tail.trim())||stack.length||roots!==1) throw new Error(label+' XML is malformed or incomplete');
  }

  /* ---- XML, at exactly the depth these two formats need ---- */
  function unescapeXml(s) {
    return String(s)
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; } })
      .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (_) { return ''; } })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');   // LAST: an escaped &amp;lt; must not become '<'
  }
  // Spreadsheet strings use the OOXML ST_Xstring `_xHHHH_` escapes. Decode one pass only:
  // `_x005F_x0041_` is the literal text `_x0041_`, not `A`.
  function unescapeXstring(s) {
    return String(s).replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  const stripTags = (s) => unescapeXml(String(s).replace(/<[^>]*>/g, ''));

  function docxText(buf, entries, inflateRaw) {
    const xml = readText(buf, entries, 'word/document.xml', inflateRaw);
    if (xml == null) throw new Error('not a Word document (no word/document.xml)');
    const withBreaks = xml
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<\/w:p>/g, '\n');       // a paragraph end is the only reliable line boundary in OOXML
    return stripTags(withBreaks).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function sharedStrings(buf, entries, inflateRaw, maxOutputBytes) {
    const xml = readText(buf, entries, 'xl/sharedStrings.xml', inflateRaw, maxOutputBytes);
    if (!xml) return [];
    if(maxOutputBytes) validateXml(xml,'sst','shared strings');
    // Each <si> is one string, possibly split across several <t> runs by formatting — join the runs.
    return (xml.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g) || []).map(si => {
      const runs = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
      return runs.map(t => unescapeXstring(unescapeXml(t.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, '')))).join('');
    });
  }
  function sheetNames(buf, entries, inflateRaw) {
    const wb = readText(buf, entries, 'xl/workbook.xml', inflateRaw);
    if (!wb) return [];
    return (wb.match(/<sheet\b[^>]*\/?>/g) || []).map(s => {
      const m = /name="([^"]*)"/.exec(s);
      return m ? unescapeXml(m[1]) : '';
    });
  }
  function workbookSheets(buf, entries, inflateRaw) {
    const wb = readText(buf, entries, 'xl/workbook.xml', inflateRaw, MAX_STRUCTURED_ENTRY_BYTES);
    if (!wb) throw new Error('not an Excel workbook (no xl/workbook.xml)');
    validateXml(wb,'workbook','workbook');
    if(!/<sheets\b/.test(wb)) throw new Error('workbook XML has no supported sheets element');
    const relsXml = readText(buf, entries, 'xl/_rels/workbook.xml.rels', inflateRaw, MAX_STRUCTURED_ENTRY_BYTES) || '';
    if(relsXml) validateXml(relsXml,'Relationships','workbook relationships');
    const rels = Object.create(null);
    for (const rel of relsXml.match(/<Relationship\b[^>]*\/?\s*>/g) || []) {
      const id = /\bId="([^"]+)"/.exec(rel), target = /\bTarget="([^"]+)"/.exec(rel);
      if (id && target && !/\bTargetMode="External"/i.test(rel)) {
        let t = unescapeXml(target[1]);
        const parts = t.startsWith('/') ? [] : ['xl'];
        for (const part of t.replace(/^\//, '').split('/')) {
          if (!part || part === '.') continue;
          if (part === '..') { if (parts.length) parts.pop(); continue; }
          parts.push(part);
        }
        t = parts.join('/');
        rels[id[1]] = t;
      }
    }
    const nodes=wb.match(/<sheet\b[^>]*\/?\s*>/g)||[];
    if(!nodes.length) throw new Error('workbook contains no worksheet metadata');
    if(nodes.length>MAX_XLSX_SHEETS) throw new Error('workbook exceeds the 10000-sheet access limit');
    return nodes.map((s, i) => {
      const attr = (n) => { const m = new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(s); return m ? unescapeXml(m[1]) : ''; };
      const rid = attr('r:id');
      const name=attr('name'),sheetId=attr('sheetId'),state=attr('state')||'visible';
      if(!name||!sheetId||!rid||!['visible','hidden','veryHidden'].includes(state)) throw new Error('workbook has unsupported worksheet metadata');
      return { name, sheetId, state, path:rels[rid] || null, index:i };
    });
  }
  function columnNumber(letters) {
    let n = 0; for (const c of String(letters).toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
    return n;
  }
  function xlsxSheets(buf, inflateRaw) {
    const entries = readEntries(buf);
    return workbookSheets(buf, entries, inflateRaw).map(s => ({ name:s.name, sheetId:s.sheetId, state:s.state, index:s.index, available:!!(s.path && entries.has(s.path)) }));
  }
  function xlsxRange(buf, inflateRaw, opts) {
    opts = opts || {};
    const entries = readEntries(buf), sheets = workbookSheets(buf, entries, inflateRaw);
    const sheetIndex=opts.sheetIndex == null ? sheets.findIndex(s => s.name === String(opts.sheet || '')) : Number(opts.sheetIndex);
    if (!Number.isSafeInteger(sheetIndex)||sheetIndex<0||sheetIndex>=sheets.length) throw new Error('worksheet selector is unknown');
    const sheet=sheets[sheetIndex];
    if (!sheet.path || !entries.has(sheet.path)) throw new Error('worksheet data is missing');
    const startRow = Number(opts.startRow), rowCount = Number(opts.rowCount), startCol = Number(opts.startCol), colCount = Number(opts.colCount);
    if (!Number.isSafeInteger(startRow) || startRow < 1 || startRow > 1048576 || !Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > 100 || startRow+rowCount-1>1048576) throw new Error('row range must stay within rows 1..1048576 and contain at most 100 rows');
    if (!Number.isSafeInteger(startCol) || startCol < 1 || !Number.isSafeInteger(colCount) || colCount < 1 || colCount > 64 || startCol + colCount - 1 > 16384) throw new Error('column range must stay within columns 1..16384 and contain at most 64 columns');
    const shared = sharedStrings(buf, entries, inflateRaw, MAX_STRUCTURED_ENTRY_BYTES), xml = readText(buf, entries, sheet.path, inflateRaw, MAX_STRUCTURED_ENTRY_BYTES);
    if (xml == null) throw new Error('worksheet XML is missing');
    validateXml(xml,'worksheet','worksheet');
    if(!/<sheetData\b/.test(xml)) throw new Error('worksheet XML has no supported sheetData element');
    const wanted = new Map();
    let inferredRow=0;
    for (const row of xml.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) || []) {
      const rm = /\br="([1-9][0-9]*)"/.exec(row), rnum = rm ? Number(rm[1]) : inferredRow+1;
      if(rnum<1||rnum>1048576) throw new Error('worksheet contains an invalid row coordinate');
      inferredRow=rnum;
      if (rnum < startRow || rnum >= startRow + rowCount) continue;
      if (wanted.has(rnum)) throw new Error('worksheet contains a duplicate row coordinate in the selected range');
      const vals = new Map();
      for (const c of row.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []) {
        const ref = /\br="([A-Z]+)([1-9][0-9]*)"/i.exec(c); if (!ref) throw new Error('worksheet cell without a supported coordinate');
        if(Number(ref[2])!==rnum) throw new Error('worksheet cell coordinate does not match its row');
        const col = columnNumber(ref[1]); if(col<1||col>16384) throw new Error('worksheet contains an invalid column coordinate'); if (col < startCol || col >= startCol + colCount) continue;
        if (vals.has(col)) throw new Error('worksheet contains a duplicate cell coordinate in the selected range');
        const type = (/\bt="([^"]+)"/.exec(c) || [])[1] || 'n', fm = /<f\b[^>]*>([\s\S]*?)<\/f>|<f\b[^>]*\/>/.exec(c);
        const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(c);
        let value = null, valueType=type==='s'?'sharedString':type==='inlineStr'?'string':type==='str'?'string':type==='b'?'boolean':type==='e'?'error':type==='d'?'dateRaw':'number';
        if(!['s','inlineStr','str','b','e','d','n'].includes(type)) throw new Error('worksheet cell type is unsupported');
        if (type === 'inlineStr') { const runs = c.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []; value = runs.map(t => unescapeXstring(unescapeXml(t.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, '')))).join(''); }
        else if (vm) { const raw = unescapeXml(vm[1]); if(type==='s'){const index=Number(raw);if(!Number.isSafeInteger(index)||index<0||index>=shared.length)throw new Error('worksheet shared-string index is invalid');value=shared[index];} else if(type==='b'){if(raw!=='0'&&raw!=='1')throw new Error('worksheet boolean value is invalid');value=raw==='1';}else value=raw; }
        if(type==='inlineStr'&&fm) throw new Error('formula with inline-string cell is unsupported');
        const formula= fm && !/^<f\b[^>]*\/>$/.test(fm[0]) ? unescapeXml(fm[1]) : (fm ? '' : null);
        vals.set(col, { coordinate:ref[1].toUpperCase() + rnum, value, valueType, formula, formulaCache:fm?(vm?'present_unverified':'missing'):'none', cachedValueMissing:!!fm && !vm });
      }
      wanted.set(rnum, vals);
    }
    const rows = [];
    for (let r = startRow; r < startRow + rowCount; r++) {
      const vals = wanted.get(r) || new Map();
      rows.push({ row:r, cells:Array.from({length:colCount}, (_,i) => { const col=startCol+i; let n=col, letters=''; while(n){ const rem=(n-1)%26; letters=String.fromCharCode(65+rem)+letters; n=Math.floor((n-1)/26); } return vals.get(col) || { coordinate:letters+r, value:null, formula:null, cachedValueMissing:false }; }) });
    }
    return { sheet:sheet.name, sheetIndex, range:{startRow,endRow:startRow+rowCount-1,startCol,endCol:startCol+colCount-1}, rows, formulaSemantics:'Formulas are inert text. Stored cached values, when present, may be stale and are not verified or recalculated.', valueSemantics:'Cell types are explicit. Numeric values are raw OOXML text; date serials and ISO dates are not interpreted or formatted.', missingCellSemantics:'Cells absent from worksheet XML are returned with value:null.' };
  }
  function xlsxText(buf, entries, inflateRaw) {
    const shared = sharedStrings(buf, entries, inflateRaw);
    const names = sheetNames(buf, entries, inflateRaw);
    // Sort numerically: sheet10.xml must not sort between sheet1.xml and sheet2.xml.
    const sheets = Array.from(entries.keys()).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => (parseInt(/(\d+)\.xml$/.exec(a)[1], 10) - parseInt(/(\d+)\.xml$/.exec(b)[1], 10)));
    if (!sheets.length) throw new Error('not an Excel workbook (no xl/worksheets/sheet*.xml)');
    const out = [];
    sheets.forEach((sheetName, si) => {
      const xml = readText(buf, entries, sheetName, inflateRaw) || '';
      const rows = xml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || [];
      const lines = [];
      let columnsOmitted = false;
      for (const row of rows.slice(0, MAX_SHEET_ROWS)) {
        const cells = [];
        let nextColumn = 0;
        for (const c of (row.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || [])) {
          const address = (/^<c\b[^>]*\br="([A-Za-z]+)[1-9][0-9]*"/.exec(c) || [])[1];
          let column = nextColumn;
          if (address) {
            column = 0;
            for (const letter of address.toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
            column--;
          }
          nextColumn = column + 1;
          if (column >= MAX_ROW_CELLS) { columnsOmitted = true; continue; }
          while (cells.length <= column) cells.push('');
          cells[column] = (() => {
          const type = (/\bt="([^"]*)"/.exec(c) || [])[1] || 'n';
          if (type === 'inlineStr') {
            const runs = c.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
            return runs.map(t => unescapeXstring(unescapeXml(t.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, '')))).join('');
          }
          const v = /<v>([\s\S]*?)<\/v>/.exec(c);
          if (!v) return '';
          if (type === 's') { const i = parseInt(v[1], 10); return (i >= 0 && i < shared.length) ? shared[i] : ''; }
          return unescapeXml(v[1]);   // numbers, dates-as-serials, booleans, cached formula results
          })();
        }
        // A row that is entirely empty carries nothing a reader would see.
        if (cells.some(c => c !== '')) lines.push(cells.join('\t'));
      }
      if (columnsOmitted) lines.push('[columns beyond ' + MAX_ROW_CELLS + ' omitted]');
      const label = names[si] || ('sheet' + (si + 1));
      out.push('### ' + label + (rows.length > MAX_SHEET_ROWS ? ' (first ' + MAX_SHEET_ROWS + ' of ' + rows.length + ' rows)' : '') + '\n' + lines.join('\n'));
    });
    return out.join('\n\n').trim();
  }

  function ipynbText(buf) {
    let nb;
    try { nb = JSON.parse(buf.toString('utf8')); } catch (_) { throw new Error('not a valid notebook (JSON parse failed)'); }
    const cells = Array.isArray(nb && nb.cells) ? nb.cells : null;
    if (!cells) throw new Error('not a valid notebook (no cells array)');
    const lang = (nb.metadata && nb.metadata.kernelspec && nb.metadata.kernelspec.language) || 'python';
    const src = (s) => Array.isArray(s) ? s.join('') : String(s == null ? '' : s);
    const out = [];
    cells.forEach((cell, i) => {
      const body = src(cell && cell.source).replace(/\s+$/, '');
      const kind = (cell && cell.cell_type) || 'code';
      if (kind === 'markdown') { if (body) out.push(body); return; }
      if (kind === 'raw') { if (body) out.push('```\n' + body + '\n```'); return; }
      out.push('```' + lang + '  # cell ' + (i + 1) + '\n' + body + '\n```');
      // Outputs are why a notebook is worth reading — the RESULT is usually the answer, not the code.
      for (const o of (Array.isArray(cell.outputs) ? cell.outputs : [])) {
        if (!o) continue;
        if (o.output_type === 'stream') { const t = src(o.text).replace(/\s+$/, ''); if (t) out.push('[output]\n' + t); continue; }
        if (o.output_type === 'error') { out.push('[error] ' + String(o.ename || '') + ': ' + String(o.evalue || '')); continue; }
        const d = o.data || {};
        const t = d['text/plain'] ? src(d['text/plain']).replace(/\s+$/, '') : '';
        if (t) out.push('[output]\n' + t);
        else if (Object.keys(d).length) out.push('[output: ' + Object.keys(d).join(', ') + ' — not text, omitted]');
      }
    });
    return out.join('\n\n').trim();
  }

  function makeDocExtract(deps) {
    deps = deps || {};
    const inflateRaw = deps.inflateRaw;
    if (typeof inflateRaw !== 'function') throw new Error('docextract requires { inflateRaw }');

    function extract(buf, kind, opts) {
      opts = opts || {};
      const maxChars = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : DEFAULT_MAX_CHARS;
      if (!buf || !buf.length) return '';
      let text;
      if (kind === 'ipynb') text = ipynbText(buf);
      else {
        const entries = readEntries(buf);
        text = kind === 'docx' ? docxText(buf, entries, inflateRaw) : xlsxText(buf, entries, inflateRaw);
      }
      if (text.length > maxChars) return text.slice(0, maxChars) + '\n…[truncated]';
      return text;
    }

    return { sniff, extract, xlsxSheets:buf => xlsxSheets(buf, inflateRaw), xlsxRange:(buf, opts) => xlsxRange(buf, inflateRaw, opts), _internals: { readEntries, entryBytes, unescapeXml, unescapeXstring, stripTags, docxText, xlsxText, ipynbText, findEocd, workbookSheets, xlsxSheets, xlsxRange } };
  }

  return { makeDocExtract, sniff, _internals: { unescapeXml, stripTags, findEocd } };
});
