/* node test/fs.write-xlsx.test.js — typed, bounded XLSX export through the real fs jail. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { makeDocExtract } = require('../sidecar/tools/builtin/docextract.js');

const ROOT = path.join(os.tmpdir(), 'starnet-xlsx-write-' + process.pid);
const ctx = { agentId: 'xlsxfixture' };
function independentlyReadStoredZip(buf) {
  const out = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  A.ok(eocd >= 0, 'independent parser finds ZIP end record');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    A.eq(buf.readUInt32LE(p), 0x02014b50, 'central directory entry signature');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    A.eq(method, 0, 'writer uses only stored ZIP entries');
    const localNameLen = buf.readUInt16LE(localAt + 26), localExtraLen = buf.readUInt16LE(localAt + 28);
    const start = localAt + 30 + localNameLen + localExtraLen;
    out.set(name, buf.toString('utf8', start, start + size));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  try {
    const doc = makeDocExtract({ inflateRaw: b => zlib.inflateRawSync(b) });
    const tools = makeFsTools({ fsp, pathMod: path, root: ROOT, docExtract: doc, limits: { writeBytes: 1 << 20 } });
    const reg = makeRegistry(); tools.register(reg);
    A.ok(reg.get('fs.write_xlsx'), 'XLSX writer is registered');
    A.eq(reg.get('fs.write_xlsx').requiresConsent, true, 'XLSX writer declares consent requirement');
    const lines = 'first\r\nsecond\nthird\rline';
    const data = { path: 'tables/summary.xlsx', columns: ['Name', 'Amount', 'Ready', 'Empty', 'Formula text', 'Escape-like', 'Line breaks', 'Control'], rows: [['Møe & Co', 42.5, true, null, '=1+1', '_x0041_', lines, 'control:\u0001'], ['<literal>', -2, false, null, ' =SUM(A1:A2)', '_x000A_', 'tabs\tstay', null]] };
    const result = await tools.writeXlsxTool.run(data, ctx);
    A.eq(result.receipt.state, 'read-back-verified', 'writer returns exact read-back verification');
    A.eq(result.receipt.path, data.path, 'receipt identifies the written path');
    A.eq(result.receipt.verifiedBytes, fs.statSync(path.join(ROOT, 'xlsxfixture', data.path)).size, 'receipt byte count matches persisted workbook');
    const bytes = fs.readFileSync(path.join(ROOT, 'xlsxfixture', data.path));
    const sourcePath = path.join(ROOT, 'xlsxfixture', 'tables', 'source.xlsx');
    fs.writeFileSync(sourcePath, bytes);
    const sourceBefore = fs.readFileSync(sourcePath);
    const parts = independentlyReadStoredZip(bytes);
    A.eq(Array.from(parts.keys()), ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml'], 'archive contains only the five minimal OOXML parts');
    const sheet = parts.get('xl/worksheets/sheet1.xml');
    A.ok(sheet.includes('t="inlineStr"><is><t xml:space="preserve">=1+1</t>'), 'formula-looking string stays inline text');
    A.ok(sheet.includes('_x005F_x0041_') && sheet.includes('_x0001_') && !sheet.includes('\u0001'), 'OOXML escape-like strings and XML-illegal controls are encoded safely');
    A.ok(sheet.includes('<c r="B2"><v>42.5</v></c>') && sheet.includes('<c r="C2" t="b"><v>1</v></c>'), 'numbers and booleans use native cell types');
    A.ok(!/<f\b|vbaProject|externalLink/i.test(Array.from(parts.values()).join('\n')), 'no formulas, macro parts, or external link parts');
    const parsed = doc.xlsxRange(bytes, { sheetIndex: 0, startRow: 1, rowCount: 3, startCol: 1, colCount: 8 });
    A.eq(parsed.rows[1].cells.slice(0, 5).map(c => [c.value, c.valueType]), [['Møe & Co','string'],['42.5','number'],[true,'boolean'],[null,null],['=1+1','string']], 'existing XLSX reader recovers text, number, boolean and blank cells with types');
    A.eq(parsed.rows[2].cells[0].value, '<literal>', 'XML special characters round-trip');
    A.eq(parsed.rows[1].cells[5].value, '_x0041_', 'literal OOXML escape-like text is preserved');
    A.eq(parsed.rows[2].cells[5].value, '_x000A_', 'literal linefeed escape-like text is preserved');
    A.eq(parsed.rows[1].cells[6].value, lines, 'CR and LF line breaks round-trip');
    A.eq(parsed.rows[1].cells[7].value, 'control:\u0001', 'OOXML-escaped XML control characters round-trip');

    const before = bytes.length;
    const invalid = [
      [{ columns: [], rows: [] }, 'no columns'],
      [{ columns: Array.from({ length: 65 }, (_, i) => 'c' + i), rows: [] }, 'column limit'],
      [{ columns: Array.from({ length: 64 }, (_, i) => 'c' + i), rows: Array.from({ length: 1000 }, () => Array(64).fill(1)) }, 'total cell limit'],
      [{ columns: ['x'], rows: [[{}]] }, 'invalid cell type'],
      [{ columns: ['x'], rows: [[Infinity]] }, 'non-finite number'],
      [{ columns: ['x'], rows: [[1, 2]] }, 'wrong row width'],
      [{ columns: ['x'], rows: [['\ud800']] }, 'lone high surrogate'],
      [{ columns: ['x'], rows: [['\udc00']] }, 'lone low surrogate'],
      [{ columns: ['x'], rows: [['x'.repeat(8193)]] }, 'overlong cell'],
      [{ columns: ['x'], rows: Array.from({ length: 1001 }, () => ['x']) }, 'row limit'],
      [{ columns: ['x'.repeat(8193)], rows: [] }, 'overlong heading']
    ];
    for (const [table, label] of invalid) {
      let failed = false;
      try { await tools.writeXlsxTool.run({ path: 'tables/rejected.xlsx', ...table }, ctx); } catch (_) { failed = true; }
      A.ok(failed, label + ' is rejected');
      A.ok(!fs.existsSync(path.join(ROOT, 'xlsxfixture', 'tables', 'rejected.xlsx')), label + ' fails before filesystem mutation');
    }
    let escaped = false; try { await tools.writeXlsxTool.run({ ...data, path: '../escape.xlsx' }, ctx); } catch (_) { escaped = true; }
    A.ok(escaped, 'path traversal is rejected');
    A.eq(fs.readFileSync(path.join(ROOT, 'xlsxfixture', data.path)).length, before, 'validation failures leave the valid workbook unchanged');
    A.ok(fs.readFileSync(sourcePath).equals(sourceBefore), 'export leaves an existing source workbook unchanged');

    const tinyRoot = path.join(ROOT, 'byte-limit');
    const tiny = makeFsTools({ fsp, pathMod: path, root: tinyRoot, limits: { writeBytes: 64 } });
    let tooLarge = false;
    try { await tiny.writeXlsxTool.run({ path: 'too-large.xlsx', columns: ['heading'], rows: [['data']] }, ctx); } catch (_) { tooLarge = true; }
    A.ok(tooLarge, 'serialized workbook over the configured byte limit is rejected');
    A.ok(!fs.existsSync(path.join(tinyRoot, 'xlsxfixture', 'too-large.xlsx')), 'byte limit is enforced before any file is created');
    const escapedLimit = makeFsTools({ fsp, pathMod: path, root: path.join(ROOT, 'escaped-byte-limit'), limits: { writeBytes: 8192 } });
    let escapedTooLarge = false;
    try { await escapedLimit.writeXlsxTool.run({ path: 'too-large.xlsx', columns: ['heading'], rows: [['&'.repeat(2000)]] }, ctx); } catch (_) { escapedTooLarge = true; }
    A.ok(escapedTooLarge, 'byte budget includes XML escaping expansion while cells serialize');
    A.ok(!fs.existsSync(path.join(ROOT, 'escaped-byte-limit', 'xlsxfixture', 'too-large.xlsx')), 'escaping-over-budget table fails before filesystem mutation');

    const staleTools = makeFsTools({ fsp, pathMod: path, root: ROOT, docExtract: doc });
    await staleTools.readTool.run({ path: data.path }, ctx);
    const staleAbs = path.join(ROOT, 'xlsxfixture', data.path); fs.appendFileSync(staleAbs, 'drift'); fs.utimesSync(staleAbs, new Date(), new Date(Date.now() + 5000));
    let stale = false; try { await staleTools.writeXlsxTool.run({ ...data, rows: [['overwrite', 1, false, null, '=2', 'ok', 'ok', null]] }, ctx); } catch (e) { stale = /stale write refused/.test(e.message); }
    A.ok(stale, 'freshness guard refuses overwrite after workbook changed since read');
    A.ok(fs.readFileSync(staleAbs).subarray(-5).equals(Buffer.from('drift')), 'stale refusal preserves intervening bytes');
  } finally { fs.rmSync(ROOT, { recursive: true, force: true }); }
  A.report('fs.write-xlsx.test');
})().catch(error => { console.error(error); process.exit(1); });
