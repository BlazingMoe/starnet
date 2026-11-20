#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const REVIEWED_VERSION = '0.16.37';
export const ROUTES = Object.freeze([
  Object.freeze({ id: 'mechanical', profile: 'moe-fast', model: 'mistral-small-3.2-24b', fallbackModel: 'auto:fast', purpose: 'bounded repetitive edits and prescribed checks' }),
  Object.freeze({ id: 'implementation', profile: 'moe-balanced', model: 'llama-3.3-70b', fallbackModel: 'auto:balanced', purpose: 'ordinary integrated feature work' }),
  Object.freeze({ id: 'architecture-review', profile: 'moe-smart', model: 'nemotron-3-ultra-550b', fallbackModel: 'auto:smart', purpose: 'architecture, security, diagnosis, and independent review' })
]);

export function normalizeBaseUrl(input = 'http://127.0.0.1:3001') {
  let parsed;
  try { parsed = new URL(String(input)); }
  catch { throw new Error('FREELLMAPI_URL must be a valid URL'); }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1' || parsed.hostname === '[::1]';
  if (parsed.protocol !== 'http:' || !loopback || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('FreeLLMAPI development gateway must be a credential-free loopback HTTP URL');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/v1$/, '') || '/';
  return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname);
}

export function setupCommands(baseUrl = 'http://127.0.0.1:3001') {
  const url = normalizeBaseUrl(baseUrl);
  return ROUTES.map(route => `npx freellmapi@${REVIEWED_VERSION} setup-codex --url ${url} --profile ${route.profile} --model ${route.model} --dry-run`);
}

export function summarizeCatalog(body) {
  if (!body || !Array.isArray(body.data)) throw new Error('FreeLLMAPI returned a malformed model catalog');
  const rows = body.data.filter(row => row && typeof row.id === 'string');
  const real = rows.filter(row => !/^(?:auto(?::|$)|fusion$|claude-(?:opus|sonnet|haiku))/i.test(row.id));
  const ready = real.filter(row => row.execution_status === 'ready' || row.available === true);
  return Object.freeze({ catalogModels: real.length, readyModels: ready.length, readyIds: ready.map(row => row.id).sort() });
}

export function routeReadiness(summary) {
  const ready = new Set(summary.readyIds);
  return ROUTES.map(route => Object.freeze({
    ...route,
    preferredReady: ready.has(route.model),
    selectedModel: ready.has(route.model) ? route.model : route.fallbackModel
  }));
}

export async function desktopApiKey({ baseUrl, fetchImpl = fetch } = {}) {
  const url = normalizeBaseUrl(baseUrl);
  const sessionResponse = await fetchImpl(`${url}/api/auth/desktop-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  if (!sessionResponse.ok) throw new Error(`FreeLLMAPI desktop session failed with HTTP ${sessionResponse.status}`);
  const session = await sessionResponse.json();
  if (!session || typeof session.token !== 'string' || !session.token) throw new Error('FreeLLMAPI returned a malformed desktop session');
  const keyResponse = await fetchImpl(`${url}/api/settings/api-key`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (!keyResponse.ok) throw new Error(`FreeLLMAPI unified-key lookup failed with HTTP ${keyResponse.status}`);
  const body = await keyResponse.json();
  if (!body || typeof body.apiKey !== 'string' || !body.apiKey) throw new Error('FreeLLMAPI returned a malformed unified key');
  return body.apiKey;
}

export async function requestDraft({ routeId, prompt, baseUrl, apiKey, fetchImpl = fetch, maxTokens = 4096 } = {}) {
  const route = ROUTES.find(candidate => candidate.id === routeId);
  if (!route) throw new Error(`Unknown FreeLLMAPI route: ${routeId || '<missing>'}`);
  if (!prompt || !String(prompt).trim()) throw new Error('A non-empty prompt is required');
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 16384) throw new Error('maxTokens must be an integer from 1 to 16384');
  const readiness = await checkGateway({ baseUrl, apiKey, fetchImpl });
  const selected = readiness.routes.find(candidate => candidate.id === route.id);
  const response = await fetchImpl(`${readiness.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${String(apiKey).trim()}`,
      'content-type': 'application/json',
      'x-freellm-task-type': 'code'
    },
    body: JSON.stringify({
      model: selected.selectedModel,
      messages: [{ role: 'user', content: String(prompt) }],
      max_tokens: maxTokens,
      temperature: 0.1
    })
  });
  if (!response.ok) throw new Error(`FreeLLMAPI draft request failed with HTTP ${response.status}`);
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('FreeLLMAPI returned an empty or malformed draft');
  return Object.freeze({
    route: route.id,
    requestedModel: selected.selectedModel,
    routedVia: response.headers?.get?.('x-routed-via') ?? null,
    content,
    usage: body.usage ?? null,
    untrustedDraft: true
  });
}

export async function checkGateway({ baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const url = normalizeBaseUrl(baseUrl);
  if (!apiKey || !String(apiKey).trim()) throw new Error('FREELLMAPI_API_KEY is required for the readiness check');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(`${url}/v1/models?execution_status=ready`, {
      headers: { authorization: `Bearer ${String(apiKey).trim()}` },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`FreeLLMAPI readiness check failed with HTTP ${response.status}`);
    const summary = summarizeCatalog(await response.json());
    if (summary.readyModels < 1) throw new Error('FreeLLMAPI reports zero ready real models');
    return Object.freeze({ baseUrl: url, ...summary, routes: routeReadiness(summary) });
  } finally {
    clearTimeout(timer);
  }
}

function plan(baseUrl) {
  return { reviewedVersion: REVIEWED_VERSION, baseUrl: normalizeBaseUrl(baseUrl), routes: ROUTES, setupPreviewCommands: setupCommands(baseUrl) };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const probe = argv.includes('--probe');
  const askIndex = argv.indexOf('--ask');
  const promptFileIndex = argv.indexOf('--prompt-file');
  const baseUrl = env.FREELLMAPI_URL || 'http://127.0.0.1:31415';
  let apiKey = env.FREELLMAPI_API_KEY;
  if (!apiKey && argv.includes('--desktop-session')) apiKey = await desktopApiKey({ baseUrl });
  let output;
  if (askIndex >= 0) {
    if (promptFileIndex < 0 || !argv[promptFileIndex + 1]) throw new Error('--ask requires --prompt-file <path>');
    const prompt = await readFile(argv[promptFileIndex + 1], 'utf8');
    output = await requestDraft({ routeId: argv[askIndex + 1], prompt, baseUrl, apiKey });
  } else if (probe) {
    output = await checkGateway({ baseUrl, apiKey });
  } else {
    output = plan(baseUrl);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`freellmapi-development: ${error.message}\n`);
    process.exitCode = 1;
  });
}
