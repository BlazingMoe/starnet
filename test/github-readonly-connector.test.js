'use strict';
const assert = require('node:assert/strict');
const catalog = require('../sidecar/mcp/catalog.js');
const { makeMcpClient } = require('../sidecar/mcp/client.js');
const { makeHttpTransport } = require('../sidecar/mcp/transport.http.js');

(async () => {
  const config = catalog.installConfig('github-readonly');
  assert.equal(config.url, 'https://api.githubcopilot.com/mcp/readonly');
  assert.equal(catalog.get(config.id).authType, 'apikey');
  assert.equal(config.token, undefined);
  assert.equal(catalog.installConfig('github').url, 'https://api.githubcopilot.com/mcp');
  const installed = catalog.browse([{ id: 'github', url: catalog.installConfig('github').url }]).connectors;
  assert.equal(installed.find(x => x.id === 'github-readonly').installed, false);
  assert.equal(installed.find(x => x.id === 'github').installed, true);
  const calls = [];
  const transport = makeHttpTransport({ ...config, token: 'synthetic-github-token', fetchImpl: async (url, init) => {
    assert.equal(url, config.url, 'initialize, discovery and calls retain readonly path');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-github-token');
    const req = JSON.parse(init.body); calls.push(req);
    let result;
    if (req.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
    else if (req.method === 'tools/list') result = { tools: [{ name: 'get_file_contents', description: 'Read repository content', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] };
    else if (req.method === 'tools/call') result = { content: [{ type: 'text', text: 'fixture README' }] };
    return { status: req.id === undefined ? 202 : 200, headers: { get: key => key.toLowerCase() === 'content-type' ? 'application/json' : null }, text: async () => req.id === undefined ? '' : JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) };
  } });
  const client = makeMcpClient({ transport });
  try {
    await client.initialize();
    const tools = await client.listTools();
    assert.equal(tools[0].annotations.readOnlyHint, true);
    const result = await client.callTool('get_file_contents', { owner: 'fixture', repo: 'demo', path: 'README.md' });
    assert.equal(result.content[0].text, 'fixture README');
    assert.ok(calls.some(x => x.method === 'tools/call'));
    assert.ok(!JSON.stringify(calls).includes('synthetic-github-token'), 'credential remains outside RPC arguments');
  } finally { client.close(); }
  console.log('github-readonly-connector: PASS (catalog to HTTP/client fixture; no real-account acceptance)');
})().catch(e => { console.error(e); process.exitCode = 1; });
