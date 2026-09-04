'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');
const requests = [];
const server = http.createServer((req, res) => {
  if (req.url.includes('/models')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'test/model', context_length: 128000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }] })); }
  let raw = ''; req.on('data', d => raw += d); req.on('end', () => {
    const b = JSON.parse(raw); requests.push(b);
    const toolMessages = (b.messages || []).filter(m => m.role === 'tool');
    const sys = (b.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
    const isQA = sys.includes('IDENTITY_QA');
    const tools = (b.tools || []).map(t => t.function.name);
    let call;
    const used = name => (b.messages || []).some(m => (m.tool_calls || []).some(c => c.function.name === name));
    if (tools.includes('brief_proceed') && !used('brief_proceed')) call = ['brief_proceed', { objective: 'Build and review a shared report', deliverable: 'reviewed report', assumptions: ['Use the group workspace'] }];
    else if (!isQA && !used('fs_write')) call = ['fs_write', { path: 'group-result.md', content: 'EXACT_SHARED_VERSION_1' }];
    else if (!isQA && !used('group_publish')) call = ['group_publish', { path: 'group-result.md' }];
    else if (!isQA && !used('group_handoff')) call = ['group_handoff', { agentId: 'qa', request: 'Read the exact shared artifact and review it' }];
    else if (isQA && !used('group_read')) {
      const ctx = b.messages.find(m => m.role === 'user')?.content || '';
      const artifacts = ctx.match(/Shared files: (.*)\nCurrent USER/);
      const file = artifacts && JSON.parse(artifacts[1])[0];
      if (file) call = ['group_read', { artifactId: file.id }];
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = call ? { tool_calls: [{ index: 0, id: 'call_' + requests.length, type: 'function', function: { name: call[0], arguments: JSON.stringify(call[1]) } }] }
      : { content: isQA ? 'Reviewed exact version: ' + toolMessages.map(m => m.content).join('\n') : 'Shared the file and asked QA to review.' };
    res.write('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n');
    res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  const fixture = SidecarFixture.create({ prefix: 'group-http-', timeoutMs: 20000,
    env: { SKYNET_OPENROUTER_BASE: base, STARNET_OPENROUTER_BASE: base,
      SKYNET_OPENROUTER_KEY: 'sk-or-v1-group-test', STARNET_OPENROUTER_KEY: 'sk-or-v1-group-test', SKYNET_DEFAULT_MODEL: 'test/model', STARNET_DEFAULT_MODEL: 'test/model' } });
  try {
    await fixture.start();
    const request = async (method, query, b) => {
      const r = await fixture.request('/api/groups' + query, { method, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
      const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result.result;
    };
    await fixture.json('POST', '/api/roster', { updatedAt: Date.now(), agents: ['agent', 'qa'].map(agentId => ({ agentId, name: agentId, model: 'test/model', provider: 'openrouter', approvalMode: 'full', system: agentId === 'qa' ? 'IDENTITY_QA' : 'IDENTITY_ENGINEER' })) });
    const g = await request('POST', '', { op: 'create', members: ['agent', 'qa'], title: 'Integration group' });
    await request('POST', '', { op: 'send', id: g.id, key: 'origin', text: 'Build a report and ask QA to review the exact artifact.' });
    let state;
    for (let n = 0; n < 200; n++) {
      state = await request('GET', '?id=' + g.id);
      if (state.turns.length && state.turns.every(t => ['completed', 'failed', 'held', 'stopped'].includes(t.state))) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(state.turns.length, 2, JSON.stringify(state));
    assert.ok(state.turns.every(t => t.state === 'completed'), JSON.stringify(state));
    assert.equal(state.artifacts.length, 1);
    assert.match(state.messages.at(-1).content, /EXACT_SHARED_VERSION_1/);
    assert.ok(requests.some(r => (r.tools || []).some(t => t.function.name === 'group_handoff')));
    assert.ok(requests.every(r => !(r.tools || []).some(t => t.function.name === 'team_dispatch')));
    const download = await fixture.request('/api/groups?id=' + g.id + '&file=' + state.artifacts[0].id);
    assert.equal(await download.text(), 'EXACT_SHARED_VERSION_1');
    await fixture.restart();
    state = await request('GET', '?id=' + g.id);
    assert.equal(state.turns.length, 2); assert.equal(state.messages.filter(m => m.author !== 'user').length, 2);
    console.log('group HTTP: actual runOnce -> fs.write -> immutable publish -> peer handoff -> exact file review -> restart PASS');
  } finally { await fixture.dispose(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
