/* Minimal, dependency-free XLSX table serializer. Values are emitted as inline strings,
   numeric cells, booleans, or absent cells; formulas, macros, links and styles are absent. */
'use strict';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function validateUnicode(value, label) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(label + ' contains a malformed Unicode surrogate');
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error(label + ' contains a malformed Unicode surrogate');
  }
}
function xmlText(value) {
  // ST_Xstring uses _xHHHH_ for XML-illegal controls, and _x005F_ to preserve a literal
  // string that already resembles one of those escapes. Do this before XML entity escaping.
  return String(value)
    .replace(/_x([0-9a-fA-F]{4})_/g, '_x005F_x$1_')
    .replace(/[\u0000-\u001f]/g, c => '_x' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + '_')
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}
function colName(n) {
  let out = '';
  while (n) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}
function zipStore(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8'), data = Buffer.from(file.data, 'utf8'), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function createXlsxTable(columns, rows, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('write byte limit must be a positive safe integer');
  if (!Array.isArray(columns) || columns.length < 1 || columns.length > 64) throw new Error('columns must contain 1-64 names');
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('rows must contain at most 1000 records');
  if ((rows.length + 1) * columns.length > 64000) throw new Error('table exceeds 64000 cells');
  const MAX_CELL = 8192;
  const cleanText = (value, label) => {
    if (typeof value !== 'string') throw new Error(label + ' must be a string');
    if (value.length > MAX_CELL) throw new Error(label + ' exceeds ' + MAX_CELL + ' characters');
    validateUnicode(value, label);
    if (/[\ufffe\uffff]/.test(value)) throw new Error(label + ' contains an unsupported XML character');
    return value;
  };
  columns.forEach((v, i) => cleanText(v, 'column ' + (i + 1)));
  rows.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== columns.length) throw new Error('row ' + (i + 1) + ' must contain exactly ' + columns.length + ' cells');
    row.forEach((v, j) => {
      if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new Error('invalid cell at row ' + (i + 1) + ', column ' + (j + 1) + ': use string, finite number, boolean, or null');
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('non-finite number at row ' + (i + 1) + ', column ' + (j + 1));
      if (typeof v === 'string') cleanText(v, 'cell at row ' + (i + 1) + ', column ' + (j + 1));
    });
  });
  const cell = (value, ref) => {
    if (value === null) return '';
    if (typeof value === 'string') return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlText(value) + '</t></is></c>';
    if (typeof value === 'boolean') return '<c r="' + ref + '" t="b"><v>' + (value ? '1' : '0') + '</v></c>';
    return '<c r="' + ref + '"><v>' + String(value) + '</v></c>';
  };
  const names = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml'];
  const staticFiles = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: names[4], data: '' }
  ];
  const sheetPrefix = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  const sheetSuffix = '</sheetData></worksheet>';
  // Account for every fixed XML byte and every local/central ZIP header before formatting any cells.
  const archiveOverhead = 22 + names.reduce((n, name) => n + 30 + 46 + Buffer.byteLength(name, 'utf8') * 2, 0);
  const staticBytes = archiveOverhead + Buffer.byteLength(sheetPrefix + sheetSuffix, 'utf8')
    + staticFiles.slice(0, 4).reduce((n, f) => n + Buffer.byteLength(f.data, 'utf8'), 0);
  let bodyBytes = 0;
  const sheetRows = [];
  for (let ri = 0; ri < rows.length + 1; ri++) {
    const row = ri === 0 ? columns : rows[ri - 1];
    const cells = [];
    let rowBytes = Buffer.byteLength('<row r="' + (ri + 1) + '"></row>', 'utf8');
    for (let ci = 0; ci < row.length; ci++) {
      const serialized = cell(row[ci], colName(ci + 1) + (ri + 1));
      rowBytes += Buffer.byteLength(serialized, 'utf8');
      if (staticBytes + bodyBytes + rowBytes > maxBytes) {
        throw new Error('XLSX file too large: serialized table exceeds ' + maxBytes + ' bytes');
      }
      cells.push(serialized);
    }
    bodyBytes += rowBytes;
    sheetRows.push('<row r="' + (ri + 1) + '">' + cells.join('') + '</row>');
  }
  const files = staticFiles.slice(0, 4).concat({
    name: names[4], data: sheetPrefix + sheetRows.join('') + sheetSuffix
  });
  const out = zipStore(files);
  if (out.length > maxBytes) throw new Error('XLSX file too large (' + out.length + ' > ' + maxBytes + ' bytes)');
  return out;
}

module.exports = { createXlsxTable, _internals: { crc32, zipStore, colName } };
