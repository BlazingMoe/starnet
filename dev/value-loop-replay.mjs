#!/usr/bin/env node
/* Local-only deterministic provider for exercising the real first-value run and deliverable path.
 * Run from the candidate checkout: node dev/value-loop-replay.mjs [--port=8964]
 * Open the printed URL, Work → first draft, paste SAMPLE below or approve the printed source folder.
 * This is labeled fixture evidence, not a model-quality evaluation. No external account is used.
 */
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { materializeSeedWorkspace, bootSeededSidecar, waitUp } from '../scripts/lib/seed.mjs';
import { messageContentText } from '../scripts/lib/message-content.mjs';

export const MODEL = 'replay/value-loop-fixture';
export const SAMPLE = 'VALUE_LOOP_FIXTURE — synthetic client notes\nCompleted: homepage draft delivered.\nBlocker: client approval is pending.\nNext step: revise the draft after client feedback.\nOwner and deadline: not recorded.';
export const DRAFT = '# Weekly client update — replay fixture\n\n## Progress\nThe homepage draft was delivered.\n\n## Blocker\nClient approval is pending.\n\n## Next step\nRevise the draft after client feedback.\n\n## Missing facts\nOwner and deadline were not recorded. The source does not establish a reporting date range.\n\n## Evidence\nSynthetic source: “Completed: homepage draft delivered.” “Blocker: client approval is pending.” “Next step: revise the draft after client feedback.”\n\nThis draft was produced by a deterministic local replay for application verification.\n';

export function replayTurn(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const user = [...messages].reverse().find(m => m.role === 'user');
  const text = messageContentText(user?.content);
  if (!text.includes('Task: Draft a weekly client update')) return { text: 'Local replay fixture: no background suggestion.' };
  const tools = (body.tools || []).map(t => t.function?.name).filter(Boolean);
  const named = pattern => tools.find(t => pattern.test(t));
  const priorCalls = messages.flatMap(m => m.role === 'assistant' && Array.isArray(m.tool_calls) ? m.tool_calls : []);
  const called = pattern => priorCalls.some(t => pattern.test(t.function?.name || ''));
  const results = messages.filter(m => m.role === 'tool');
  const lastResult = results.length ? messageContentText(results[results.length - 1].content) : '';
  // A rejected real tool call is never narrated as a successful write by this fixture.
  if (/"(?:ok|success)"\s*:\s*false|"error"\s*:|^Error:/i.test(lastResult)) return { text: 'Local replay stopped after a tool error: ' + lastResult.slice(0, 600) };
  const proceed = named(/^brief[_.]proceed$/);
  if (proceed && !called(/^brief[_.]proceed$/)) return { tool: proceed, args: { objective: 'Draft a weekly client update from the supplied replay fixture notes.' } };
  const folderMatch = text.match(/approved folder: ("(?:[^"\\]|\\.)*")/);
  if (folderMatch) {
    const read = named(/^fs[_.]read$/);
    if (!called(/^fs[_.]read$/)) {
      if (!read) return { text: 'Local replay needs the real file-read tool for a folder source. No file was read.' };
      return { tool: read, args: { path: join(JSON.parse(folderMatch[1]), 'weekly-notes.md') } };
    }
    if (!results.some(m => messageContentText(m.content).includes('VALUE_LOOP_FIXTURE'))) return { text: 'The selected folder did not return the replay fixture. No draft was fabricated.' };
  } else if (!text.includes('VALUE_LOOP_FIXTURE')) return { text: 'Paste the printed VALUE_LOOP_FIXTURE notes to exercise this deterministic provider.' };
  const write = named(/^fs[_.]write$/);
  if (write && !called(/^fs[_.]write$/)) return { tool: write, args: { path: 'weekly-client-update.md', content: DRAFT } };
  return { text: DRAFT + (called(/^fs[_.]write$/) ? '\nSaved deliverable: weekly-client-update.md' : '\nThe file-write tool was unavailable; the complete draft is above.') };
}

export function startReplayProvider() {
  return new Promise(resolveProvider => {
    const requests = [];
    const server = http.createServer((req, res) => {
      if (req.url?.includes('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: MODEL, name: 'Local replay fixture', context_length: 32768, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }] }));
      }
      if (!req.url?.includes('/chat/completions')) { res.writeHead(404); return res.end(); }
      let raw = '';
      req.on('data', chunk => { raw += chunk; if (raw.length > 2 * 1024 * 1024) req.destroy(); });
      req.on('end', () => {
        let body;
        try { body = JSON.parse(raw); } catch { res.writeHead(400); return res.end(); }
        const turn = replayTurn(body);
        requests.push({ at: Date.now(), model: body.model, tool: turn.tool || null, result: turn.tool ? 'tool-request' : 'text' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        const delta = turn.tool ? { tool_calls: [{ index: 0, id: 'fixture_' + requests.length, type: 'function', function: { name: turn.tool, arguments: JSON.stringify(turn.args) } }] } : { content: turn.text };
        res.write('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n');
        res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: turn.tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }) + '\n\n');
        res.end('data: [DONE]\n\n');
      });
    });
    server.listen(0, '127.0.0.1', () => resolveProvider({ server, requests, base: 'http://127.0.0.1:' + server.address().port + '/api/v1' }));
  });
}

async function main() {
  const arg = process.argv.find(v => v.startsWith('--port='));
  const port = Number(arg ? arg.slice(7) : 8964);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose an unprivileged local port.');
  const url = 'http://127.0.0.1:' + port + '/';
  // Refuse an occupied port: verification must not quietly attach to somebody else's running station.
  try { const res = await fetch(url, { signal: AbortSignal.timeout(700) }); if (res) throw new Error('PORT_OCCUPIED'); }
  catch (e) { if (e.message === 'PORT_OCCUPIED') throw new Error('Port ' + port + ' is already in use.'); }
  const scratch = mkdtempSync(join(tmpdir(), 'starnet-value-replay-'));
  const workspace = join(scratch, 'workspace'), source = join(scratch, 'client-notes');
  materializeSeedWorkspace(workspace, MODEL);
  mkdirSync(source); writeFileSync(join(source, 'weekly-notes.md'), SAMPLE + '\n');
  const mock = await startReplayProvider();
  const child = bootSeededSidecar({ port, model: MODEL, key: 'local-replay-placeholder-not-a-credential', scratchDir: workspace, env: {
    SKYNET_OPENROUTER_BASE: mock.base, STARNET_OPENROUTER_BASE: mock.base,
    STARNET_OPENROUTER_KEY: 'local-replay-placeholder-not-a-credential',
    SKYNET_QUEST_REFRESH: '0', SKYNET_SCOUT: '0'
  } });
  let stopping = false;
  function stop() { if (stopping) return; stopping = true; child.kill(); mock.server.close(); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  child.once('exit', () => { stop(); });
  if (!await waitUp(url)) { stop(); throw new Error('Seeded sidecar did not start.'); }
  console.log('LOCAL REPLAY FIXTURE — not a production model or quality evaluation');
  console.log('App: ' + url + '\nSource folder (approve explicitly in app): ' + source + '\nWorkspace: ' + workspace);
  console.log('Sample to paste:\n' + SAMPLE);
  console.log('Stop with Ctrl+C. The scratch workspace is retained for inspection.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
