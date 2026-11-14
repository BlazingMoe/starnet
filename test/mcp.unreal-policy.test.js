/* node test/mcp.unreal-policy.test.js — Unreal MCP stays loopback-only and discovery/read-only. */
'use strict';
const A = require('./_assert.js');
const policy = require('../sidecar/mcp/unreal-policy.js');
const { makeConnectorManager } = require('../sidecar/mcp/manager.js');

A.eq(policy.configError({ id: 'other', transportKind: 'http', url: 'https://example.test/mcp' }), '', 'other connectors unchanged');
A.ok(policy.configError({ id: 'unreal-mcp', transportKind: 'stdio' }), 'stdio rejected');
A.ok(policy.configError({ id: 'unreal-mcp', transportKind: 'http', url: 'http://localhost:8000/mcp' }), 'localhost alias rejected');
A.ok(policy.configError({ id: 'unreal-mcp', transportKind: 'http', url: 'http://127.0.0.1:8000/mcp?x=1' }), 'query rejected');
A.ok(policy.configError({ id: 'unreal-mcp', transportKind: 'http', url: 'http://127.0.0.1:8000/mcp', token: 'secret' }), 'credential rejected');
A.eq(policy.configError({ id: 'unreal-mcp', transportKind: 'http', url: 'http://127.0.0.1:8000/mcp' }), '', 'exact loopback accepted');
A.eq(policy.toolAllowed({ id: 'unreal-mcp' }, { name: 'list_toolsets' }), true, 'toolset listing allowed');
A.eq(policy.toolAllowed({ id: 'unreal-mcp' }, { name: 'describe_toolset' }), true, 'toolset description allowed');
A.eq(policy.toolAllowed({ id: 'unreal-mcp' }, { name: 'call_tool', annotations: { readOnlyHint: true } }), false, 'generic call meta-tool always blocked');
A.eq(policy.toolAllowed({ id: 'unreal-mcp' }, { name: 'ProgrammaticToolset.execute_tool_script', annotations: { readOnlyHint: true } }), false, 'script execution always blocked');
A.eq(policy.toolAllowed({ id: 'unreal-mcp' }, { name: 'Editor.get_selection', annotations: { readOnlyHint: true } }), true, 'explicit read-only direct tool allowed');
A.eq(policy.toolAllowed({ id: 'unreal-mcp' }, { name: 'Asset.import' }), false, 'unknown mutation blocked');

(async () => {
  let calls = 0;
  const tools = [
    { name: 'list_toolsets' },
    { name: 'call_tool' },
    { name: 'Asset.inspect', annotations: { readOnlyHint: true } },
    { name: 'Asset.import' }
  ];
  const manager = makeConnectorManager({
    makeTransport: () => ({ close() {} }),
    makeClient: () => ({
      serverCapabilities: {}, initialize: async () => ({}), listTools: async () => tools,
      callTool: async () => { calls++; return { content: [] }; }, close() {}
    }),
    makeToolDef: ({ mcpTool }) => ({ name: mcpTool.name }),
    validateConfig: policy.configError,
    toolAllowed: policy.toolAllowed
  });
  const connected = await manager.configure('unreal-mcp', { transport: 'http', url: 'http://127.0.0.1:8000/mcp' });
  A.eq(connected.ok, true, 'safe connector config connects');
  A.eq(manager.status('unreal-mcp').tools.join(','), 'list_toolsets,Asset.inspect', 'status advertises only safe tools');
  A.eq(manager.toolDefsFor('unreal-mcp').map(x => x.name).join(','), 'list_toolsets,Asset.inspect', 'projection includes only safe tools');
  let blocked = '';
  try { await manager.call('unreal-mcp', 'call_tool', {}); } catch (e) { blocked = e.message; }
  A.ok(/not permitted/.test(blocked), 'direct call bypass rejected');
  A.eq(calls, 0, 'blocked call never reaches connector');
  await manager.call('unreal-mcp', 'Asset.inspect', {});
  A.eq(calls, 1, 'explicit read-only tool reaches connector');
  console.log('mcp.unreal-policy: OK (18 assertions)');
})().catch(e => { console.error(e); process.exit(1); });
