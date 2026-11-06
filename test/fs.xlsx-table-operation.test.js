'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { createXlsxTable, _internals } = require('../sidecar/tools/builtin/xlsx-table.js');
const { makeDocExtract } = require('../sidecar/tools/builtin/docextract.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { resolveTools } = require('../sidecar/capability/resolve.js');
const { makeCapCtx } = require('../sidecar/capability/capGate.js');
const { redact } = require('../sidecar/context.js');

const root = path.join(os.tmpdir(), 'starnet-xlsx-table-operation-' + process.pid);
const agentRoot = path.join(root, 'agent');
const docExtract = makeDocExtract({ inflateRaw: zlib.inflateRawSync });
const tools = makeFsTools({ fsp, pathMod: path, root, redact, docExtract, limits: { writeBytes: 1 << 20 } });
const ctx = { agentId: 'agent' };
const rect = { path: 'source.xlsx', sheetIndex: 0, startRow: 1, rowCount: 5, startCol: 1, colCount: 3 };
async function fail(call, pattern, label) {
  try { await call; A.ok(false, label + ' rejects'); }
  catch (error) { A.ok(pattern.test(error.message), label + ' rejects for expected reason'); }
}
async function main() {
  await fsp.mkdir(agentRoot, { recursive: true });
  const registered = [];
  tools.register({ register: tool => registered.push(tool) });
  A.ok(registered.includes(tools.xlsxTableOperationTool), 'XLSX operation is registered in the built-in file toolset');
  A.eq([tools.xlsxTableOperationTool.scope, tools.xlsxTableOperationTool.readOnly, tools.xlsxTableOperationTool.requiresConsent], ['read', true, false], 'tool is read-only and requires no mutation consent');
  const registry = makeRegistry();
  tools.register(registry);
  const stationFor = objects => ({ agents: { agent: { id: 'agent', room: 'office' } }, rooms: { office: { id: 'office', objects: objects.map((objectType, i) => ({ instanceId: objectType + i, objectType })) } } });
  const capability = objects => makeCapCtx(resolveTools('agent', stationFor(objects)));
  await fsp.writeFile(path.join(agentRoot, 'source.xlsx'), createXlsxTable(['region', 'amount', 'note'], [['A', 3, 'x'], ['A', 6, 'y'], ['B', 5, 'z'], ['B', 1, 'w']], 1 << 20));
  const before = await fsp.readFile(path.join(agentRoot, 'source.xlsx'));
  const result = JSON.parse((await tools.xlsxTableOperationTool.run({ ...rect, operations: [
    { type: 'filter', column: 'amount', operator: 'gte', value: '3' },
    { type: 'group', by: 'region', column: 'amount', aggregate: 'sum' },
    { type: 'sort', column: 'sum_amount', mode: 'numeric', direction: 'desc' }
  ] }, ctx)).content);
  A.eq(result.rows, [['A', '9'], ['B', '5']], 'XLSX filter-group-sort pipeline reuses shared operation semantics');
  A.eq(result.steps, [{ type: 'filter', inputRows: 4, outputRows: 3 }, { type: 'group', inputRows: 3, outputRows: 2 }, { type: 'sort', inputRows: 2, outputRows: 2 }], 'XLSX pipeline reports each step count');
  A.eq(result.provenance.scope, 'explicit_selected_xlsx_rectangle_only', 'provenance explicitly limits scope to selected rectangle');
  A.eq(result.provenance.workbookScope, 'not_whole_workbook', 'result cannot be confused with whole-workbook coverage');
  A.eq(result.provenance.filteredRangeSubset, true, 'result states it summarizes a filtered range subset');
  A.eq(result.provenance.selected, { sheetIndex: 0, sheet: 'Data', startRow: 1, endRow: 5, startCol: 1, endCol: 3, rowCount: 5, columnCount: 3, headerRow: 1, dataRows: 4 }, 'result retains selected coordinates and header/data row counts');
  A.ok(/raw XLSX numeric text/.test(result.numericSemantics), 'result discloses raw numeric/date semantics');
  A.eq(result.source.sha256.length, 64, 'source identity includes digest');
  A.eq(result.source.bytes, before.length, 'source identity includes byte size');
  A.eq(await fsp.readFile(path.join(agentRoot, 'source.xlsx')), before, 'source workbook bytes are unchanged');
  const dispatched = await registry.dispatch({ name: 'fs.xlsx_table_operation', args: { ...rect, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } } }, { ...capability(['computer', 'cabinet']), agentId: 'agent' });
  A.ok(dispatched.ok && JSON.parse(dispatched.content).rows[0][1] === '1', 'real registry dispatch runs XLSX operation with resolved cabinet capability');
  const capDenied = await registry.dispatch({ name: 'fs.xlsx_table_operation', args: { ...rect, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } } }, { ...capability(['computer']), agentId: 'agent' });
  A.ok(!capDenied.ok && /capability denied/.test(capDenied.content), 'real registry denies XLSX operation without cabinet capability');
  const schemaDenied = await registry.dispatch({ name: 'fs.xlsx_table_operation', args: { path: 'source.xlsx', sheetIndex: 0, startRow: 1, rowCount: 5, startCol: 1, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } } }, { ...capability(['computer', 'cabinet']), agentId: 'agent' });
  A.ok(!schemaDenied.ok && /invalid arguments/.test(schemaDenied.content), 'real registry validates required rectangle coordinates before tool execution');
  const writeDenied = await registry.dispatch({ name: 'fs.write_csv', args: { path: 'denied.csv', columns: ['x'], rows: [['y']] } }, { ...capability(['computer', 'cabinet']), agentId: 'agent', consent: async () => ({ allow: false, reason: 'fixture denial' }) });
  A.ok(!writeDenied.ok && /consent denied/.test(writeDenied.content), 'real registry denies output write without consent');
  A.ok(!fs.existsSync(path.join(agentRoot, 'denied.csv')), 'denied output write creates no file');
  const receipt = await tools.writeCsvTool.run({ path: 'computed.csv', columns: result.headers, rows: result.rows }, ctx);
  A.eq(receipt.mutationReceipt.state, 'read-back-verified', 'computed output goes through verified CSV exporter');
  A.eq((await tools.readTool.run({ path: 'computed.csv' }, ctx)).content, 'region,sum_amount\r\nA,9\r\nB,5\r\n', 'exported CSV reads back with computed result');

  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c><c r="B1" t="inlineStr"><is><t>amount</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>secret</t></is></c><c r="B2"><f>1+2</f><v>3</v></c></row></sheetData></worksheet>' }
  ];
  const archiveForSheet = sheet => _internals.zipStore(files.map(file => file.name === 'xl/worksheets/sheet1.xml' ? { ...file, data: sheet } : file));
  await fsp.writeFile(path.join(agentRoot, 'formula.xlsx'), _internals.zipStore(files));
  await fail(tools.xlsxTableOperationTool.run({ path: 'formula.xlsx', sheetIndex: 0, startRow: 1, rowCount: 2, startCol: 1, colCount: 2, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, ctx), /formula cells/, 'formula with cached result');
  const sparseSheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    '<row r="1"><c r="A1" t="inlineStr"><is><t>outside header</t></is></c><c r="D1"><v>900</v></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>ignored</t></is></c><c r="B2" t="inlineStr"><is><t>region</t></is></c><c r="C2" t="inlineStr"><is><t>amount</t></is></c><c r="D2"><v>901</v></c></row>' +
    '<row r="3"><c r="A3"><v>902</v></c><c r="B3" t="inlineStr"><is><t>a</t></is></c><c r="C3"><v>2</v></c><c r="D3"><v>903</v></c></row>' +
    '<row r="4"><c r="B4" t="inlineStr"><is><t>a</t></is></c></row>' +
    '<row r="5"><c r="B5" t="inlineStr"><is><t>b</t></is></c><c r="C5"/></row></sheetData></worksheet>';
  await fsp.writeFile(path.join(agentRoot, 'sparse.xlsx'), archiveForSheet(sparseSheet));
  const sparse = JSON.parse((await tools.xlsxTableOperationTool.run({ path: 'sparse.xlsx', sheetIndex: 0, startRow: 2, rowCount: 4, startCol: 2, colCount: 2, operation: { type: 'group', by: 'region', column: 'amount', aggregate: 'sum' } }, ctx)).content);
  A.eq(sparse.rows, [['a', '2'], ['b', '']], 'shifted rectangle ignores outside cells and absent/empty numeric cells contribute no aggregate');
  A.eq(sparse.provenance.selected, { sheetIndex: 0, sheet: 'Data', startRow: 2, endRow: 5, startCol: 2, endCol: 3, rowCount: 4, columnCount: 2, headerRow: 2, dataRows: 3 }, 'shifted range provenance is exact');
  const duplicateRow = sparseSheet.replace('<row r="4"><c r="B4" t="inlineStr"><is><t>a</t></is></c></row>', '<row r="4"><c r="B4" t="inlineStr"><is><t>a</t></is></c></row><row r="4"><c r="B4" t="inlineStr"><is><t>other</t></is></c></row>');
  await fsp.writeFile(path.join(agentRoot, 'duplicate-row.xlsx'), archiveForSheet(duplicateRow));
  await fail(tools.xlsxTableOperationTool.run({ path: 'duplicate-row.xlsx', sheetIndex: 0, startRow: 2, rowCount: 4, startCol: 2, colCount: 2, operation: { type: 'sort', column: 'region', mode: 'text', direction: 'asc' } }, ctx), /duplicate row coordinate/, 'duplicate selected row coordinates');
  const duplicateCell = sparseSheet.replace('<c r="B4" t="inlineStr"><is><t>a</t></is></c>', '<c r="B4" t="inlineStr"><is><t>a</t></is></c><c r="B4" t="inlineStr"><is><t>other</t></is></c>');
  await fsp.writeFile(path.join(agentRoot, 'duplicate-cell.xlsx'), archiveForSheet(duplicateCell));
  await fail(tools.xlsxTableOperationTool.run({ path: 'duplicate-cell.xlsx', sheetIndex: 0, startRow: 2, rowCount: 4, startCol: 2, colCount: 2, operation: { type: 'sort', column: 'region', mode: 'text', direction: 'asc' } }, ctx), /duplicate cell coordinate/, 'duplicate selected cell coordinates');
  const errorSheet = sparseSheet.replace('<c r="C3"><v>2</v></c>', '<c r="C3" t="e"><v>#VALUE!</v></c>');
  await fsp.writeFile(path.join(agentRoot, 'error-cell.xlsx'), archiveForSheet(errorSheet));
  await fail(tools.xlsxTableOperationTool.run({ path: 'error-cell.xlsx', sheetIndex: 0, startRow: 2, rowCount: 4, startCol: 2, colCount: 2, operation: { type: 'group', by: 'region', column: 'amount', aggregate: 'sum' } }, ctx), /error cells/, 'present error cell');
  const unsupportedSheet = sparseSheet.replace('<c r="C3"><v>2</v></c>', '<c r="C3" t="z"><v>2</v></c>');
  await fsp.writeFile(path.join(agentRoot, 'unsupported-cell.xlsx'), archiveForSheet(unsupportedSheet));
  await fail(tools.xlsxTableOperationTool.run({ path: 'unsupported-cell.xlsx', sheetIndex: 0, startRow: 2, rowCount: 4, startCol: 2, colCount: 2, operation: { type: 'group', by: 'region', column: 'amount', aggregate: 'sum' } }, ctx), /unsupported/, 'unsupported cell type');
  await fsp.writeFile(path.join(agentRoot, 'duplicate.xlsx'), createXlsxTable(['group', 'group'], [['a', '1']], 1 << 20));
  await fail(tools.xlsxTableOperationTool.run({ ...rect, path: 'duplicate.xlsx', rowCount: 2, colCount: 2, operation: { type: 'sort', column: 'group', mode: 'text', direction: 'asc' } }, ctx), /unique, unambiguous/, 'duplicate headers');
  await fsp.writeFile(path.join(agentRoot, 'empty-header.xlsx'), createXlsxTable(['', 'amount'], [['a', '1']], 1 << 20));
  await fail(tools.xlsxTableOperationTool.run({ ...rect, path: 'empty-header.xlsx', rowCount: 2, colCount: 2, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, ctx), /nonempty headers/, 'empty header');
  await fsp.writeFile(path.join(agentRoot, 'credential.xlsx'), createXlsxTable(['name', 'token'], [['account', 'sk-ant-123456789012345678901234567890']], 1 << 20));
  await fail(tools.xlsxTableOperationTool.run({ ...rect, path: 'credential.xlsx', rowCount: 2, colCount: 2, operation: { type: 'sort', column: 'name', mode: 'text', direction: 'asc' } }, ctx), /credential-pattern-redacted/, 'credential-pattern redaction');
  await fail(tools.xlsxTableOperationTool.run({ ...rect, path: '../outside.xlsx', operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, ctx), /outside|path/i, 'path traversal');
  await fail(tools.xlsxTableOperationTool.run({ ...rect, startRow: 0, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, ctx), /coordinate/, 'invalid explicit coordinates');
  await fail(tools.xlsxTableOperationTool.run({ ...rect, rowCount: 101, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, ctx), /coordinate/, 'rectangle row bound');
  await fail(tools.xlsxTableOperationTool.run({ ...rect }, ctx), /exactly one/, 'missing operation');
  await fail(tools.xlsxTableOperationTool.run({ ...rect, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' }, operations: [{ type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' }] }, ctx), /exactly one/, 'both operation forms');
  await fail(tools.xlsxTableOperationTool.run({ ...rect, operations: Array(9).fill({ type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' }) }, ctx), /1 to 8/, 'pipeline above step limit');
  const aborted = new AbortController(); aborted.abort();
  await fail(tools.xlsxTableOperationTool.run({ ...rect, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, { ...ctx, signal: aborted.signal }), /cancelled/, 'aborted XLSX operation');
  const afterLoadAbort = new AbortController(), abortingFsp = Object.create(fsp);
  abortingFsp.open = async (...args) => {
    const handle = await fsp.open(...args);
    return { stat: handle.stat.bind(handle), close: handle.close.bind(handle), read: async (...readArgs) => { const value = await handle.read(...readArgs); afterLoadAbort.abort(); return value; } };
  };
  const abortingTools = makeFsTools({ fsp: abortingFsp, pathMod: path, root, redact, docExtract });
  await fail(abortingTools.xlsxTableOperationTool.run({ ...rect, operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, { ...ctx, signal: afterLoadAbort.signal }), /cancelled/, 'abort noticed after source snapshot load');
  await fsp.rm(root, { recursive: true, force: true });
  A.report('fs.xlsx-table-operation.test.js');
}
main().catch(async error => { try { await fsp.rm(root, { recursive: true, force: true }); } catch {} console.error(error); process.exitCode = 1; });
