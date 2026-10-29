'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { makeFsTools } = require('../sidecar/tools/builtin/fs.js');
const { redact } = require('../sidecar/context.js');

const root = path.join(os.tmpdir(), 'starnet-table-operation-' + process.pid);
const agentRoot = path.join(root, 'agent');
const tools = makeFsTools({ fsp, pathMod: path, root, redact, limits: { writeBytes: 1 << 20 } });
const ctx = { agentId: 'agent' };
async function write(name, body) { await fsp.writeFile(path.join(agentRoot, name), body); }
async function fails(call, pattern, label) {
  try { await call; A.ok(false, label + ' rejects'); }
  catch (error) { A.ok(pattern.test(error.message), label + ' rejects for expected reason'); }
}
async function main() {
  await fsp.mkdir(agentRoot, { recursive: true });
  const grouped = async pathName => JSON.parse((await tools.tableOperationTool.run({ path: pathName, operation: { type: 'group', by: 'group', column: 'amount', aggregate: 'sum' } }, ctx)).content);

  await write('ok.csv', 'group,amount\na,2\na,3\nb,4\n');
  const before = await fsp.readFile(path.join(agentRoot, 'ok.csv'));
  const result = await grouped('ok.csv');
  A.eq(result.rows, [['a', '5'], ['b', '4']], 'tool computes a whole-source grouped result');
  A.eq(result.source.rows, 3, 'source metadata includes complete data row count');
  A.ok(/IEEE-754/.test(result.numericSemantics), 'result discloses numeric approximation semantics');
  A.eq(await fsp.readFile(path.join(agentRoot, 'ok.csv')), before, 'operation preserves source bytes');
  const exportReceipt = await tools.writeCsvTool.run({ path: 'computed.csv', columns: result.headers, rows: result.rows }, ctx);
  A.eq(exportReceipt.mutationReceipt.state, 'read-back-verified', 'computed table output uses the verified CSV writer');
  const exported = await tools.readTool.run({ path: 'computed.csv' }, ctx);
  A.eq(exported.content, 'group,sum_amount\r\na,5\r\nb,4\r\n', 'written CSV contains the actual computed headers and grouped rows');

  await write('pipeline.csv', 'region,amount\nA,3\nA,6\nB,5\nB,1\n');
  const pipelineSource = await fsp.readFile(path.join(agentRoot, 'pipeline.csv'));
  const pipeline = JSON.parse((await tools.tableOperationTool.run({ path: 'pipeline.csv', operations: [
    { type: 'filter', column: 'amount', operator: 'gte', value: '3' },
    { type: 'group', by: 'region', column: 'amount', aggregate: 'sum' },
    { type: 'sort', column: 'sum_amount', mode: 'numeric', direction: 'desc' }
  ] }, ctx)).content);
  A.eq(pipeline.rows, [['A', '9'], ['B', '5']], 'filter-group-sort pipeline applies each step to the prior output');
  A.eq(pipeline.sourceRows, 4, 'sourceRows always reports the original source count');
  A.eq(pipeline.resultRows, 2, 'resultRows reports the final output count');
  A.eq(pipeline.steps, [{ type: 'filter', inputRows: 4, outputRows: 3 }, { type: 'group', inputRows: 3, outputRows: 2 }, { type: 'sort', inputRows: 2, outputRows: 2 }], 'trace records each step input and output counts');
  A.eq(pipeline.filtered, true, 'pipeline retains filtered provenance');
  A.eq(pipeline.resultScope, 'filtered_source_subset', 'group after filter is explicitly limited to the filtered subset');
  const pipelineWrite = await tools.writeCsvTool.run({ path: 'pipeline-result.csv', columns: pipeline.headers, rows: pipeline.rows }, ctx);
  A.eq(pipelineWrite.mutationReceipt.state, 'read-back-verified', 'pipeline uses the verified CSV writer');
  A.eq((await tools.readTool.run({ path: 'pipeline-result.csv' }, ctx)).content, 'region,sum_amount\r\nA,9\r\nB,5\r\n', 'pipeline CSV reads back the computed result');
  A.eq(await fsp.readFile(path.join(agentRoot, 'pipeline.csv')), pipelineSource, 'pipeline leaves its source unchanged');

  await write('collision.csv', 'sum_amount,amount\nkey,2\n');
  const collision = JSON.parse((await tools.tableOperationTool.run({ path: 'collision.csv', operation: { type: 'group', by: 'sum_amount', column: 'amount', aggregate: 'sum' } }, ctx)).content);
  A.eq(collision.headers, ['sum_amount', 'sum_amount [2]'], 'group-generated headers remain unique when a source key collides');
  await fails(tools.tableOperationTool.run({ path: 'pipeline.csv', operations: [] }, ctx), /1 to 8/, 'empty pipeline');
  await fails(tools.tableOperationTool.run({ path: 'pipeline.csv', operations: Array(9).fill({ type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' }) }, ctx), /1 to 8/, 'pipeline above step limit');
  await fails(tools.tableOperationTool.run({ path: 'pipeline.csv', operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' }, operations: [{ type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' }] }, ctx), /exactly one/, 'both operation forms');
  await fails(tools.tableOperationTool.run({ path: 'pipeline.csv' }, ctx), /exactly one/, 'missing operation form');
  await fails(tools.tableOperationTool.run({ path: 'pipeline.csv', operations: [
    { type: 'group', by: 'region', aggregate: 'count' },
    { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' }
  ] }, ctx), /unknown or ambiguous column/, 'missing column after grouping');

  for (const count of [999, 1000]) {
    const rows = Array.from({ length: count }, (_, i) => 'a,' + (i + 1)).join('\n');
    await write('rows.csv', 'group,amount\n' + rows + '\n');
    A.eq((await grouped('rows.csv')).source.rows, count, 'exactly ' + count + ' rows are accepted');
  }
  const rows1001 = Array.from({ length: 1001 }, (_, i) => 'a,' + (i + 1)).join('\n');
  await write('rows.csv', 'group,amount\n' + rows1001 + '\n');
  await fails(grouped('rows.csv'), /1000 data rows/, '1001-row boundary');

  await write('malformed.csv', 'g,v\na,"unterminated');
  await fails(grouped('malformed.csv'), /unclosed_quote/, 'malformed CSV');
  await write('ragged.csv', 'g,v\na,1\nb\n');
  await fails(grouped('ragged.csv'), /well-formed rows/, 'row-width mismatch');
  await write('duplicate.csv', 'g,g\na,1\n');
  await fails(grouped('duplicate.csv'), /unique strings/, 'ambiguous duplicate headers');
  await write('secret.csv', 'g,v\na,sk-ant-123456789012345678901234567890\n');
  await fails(grouped('secret.csv'), /redacted input/, 'credential-pattern redaction');
  await fails(grouped('../outside.csv'), /outside|path/i, 'path traversal');

  await write('large-cell.csv', 'g,v\na,' + 'x'.repeat(65537));
  await fails(grouped('large-cell.csv'), /parser bounds/, 'cell bound');
  await write('wide.csv', Array.from({ length: 257 }, (_, i) => 'c' + i).join(',') + '\n');
  await fails(grouped('wide.csv'), /parser bounds/, 'column bound');
  await write('large.csv', 'g,v\na,' + '1'.repeat(16 * 1024 * 1024));
  await fails(grouped('large.csv'), /16 MiB/, 'byte bound');
  await write('output.csv', 'g,v\n' + Array.from({ length: 5 }, () => 'a,' + 'x'.repeat(60000)).join('\n') + '\n');
  const outputTools = makeFsTools({ fsp, pathMod: path, root, redact, limits: { writeBytes: 1 << 20 } });
  await fails(outputTools.tableOperationTool.run({ path: 'output.csv', operation: { type: 'sort', column: 'v', mode: 'text', direction: 'asc' } }, ctx), /256 KiB/, 'response bound');

  let statCalls = 0;
  const changingFsp = Object.create(fsp);
  changingFsp.open = async (...args) => {
    const handle = await fsp.open(...args);
    return {
      read: handle.read.bind(handle), close: handle.close.bind(handle),
      stat: async () => {
        const stats = await handle.stat();
        if (statCalls++ === 0) return stats;
        const changed = Object.create(stats);
        Object.defineProperty(changed, 'mtimeMs', { value: stats.mtimeMs + 1 });
        return changed;
      }
    };
  };
  const changedTools = makeFsTools({ fsp: changingFsp, pathMod: path, root, redact, limits: { writeBytes: 1 << 20 } });
  await fails(changedTools.tableOperationTool.run({ path: 'ok.csv', operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, ctx), /source changed/, 'source mutation during read');

  const cancelled = new AbortController(); cancelled.abort();
  await fails(tools.tableOperationTool.run({ path: 'ok.csv', operation: { type: 'sort', column: 'amount', mode: 'numeric', direction: 'asc' } }, { ...ctx, signal: cancelled.signal }), /cancelled/, 'cancellation');
  const outside = path.join(os.tmpdir(), 'starnet-table-outside-' + process.pid);
  await fsp.mkdir(outside, { recursive: true });
  await fsp.writeFile(path.join(outside, 'secret.csv'), 'x,y\na,1\n');
  try { await fsp.symlink(path.join(outside, 'secret.csv'), path.join(agentRoot, 'link.csv')); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { console.log('SKIP: symlink escape unverified; this host blocks test symlink creation (' + error.code + ')'); await fsp.rm(outside, { recursive: true, force: true }); await fsp.rm(root, { recursive: true, force: true }); A.report('fs.table-operation.test.js'); return; } throw error; }
  await fails(tools.tableOperationTool.run({ path: 'link.csv', operation: { type: 'sort', column: 'x', mode: 'text', direction: 'asc' } }, ctx), /outside|symlink|such file/i, 'symlink escape');
  await fsp.rm(root, { recursive: true, force: true });
  await fsp.rm(outside, { recursive: true, force: true });
  A.report('fs.table-operation.test.js');
}
main().catch(async error => { try { await fsp.rm(root, { recursive: true, force: true }); } catch {} console.error(error); process.exitCode = 1; });
