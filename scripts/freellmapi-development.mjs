#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export const REVIEWED_VERSION = '0.16.37';
export const ROUTES = Object.freeze([
  Object.freeze({ id: 'mechanical', profile: 'moe-fast', model: 'auto:fast', purpose: 'bounded repetitive edits and prescribed checks' }),
  Object.freeze({ id: 'implementation', profile: 'moe-balanced', model: 'auto:balanced', purpose: 'ordinary integrated feature work' }),
  Object.freeze({ id: 'architecture-review', profile: 'moe-smart', model: 'auto:smart', purpose: 'architecture, security, diagnosis, and independent review' })
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
    return Object.freeze({ baseUrl: url, ...summary, routes: ROUTES });
  } finally {
    clearTimeout(timer);
  }
}

function plan(baseUrl) {
  return { reviewedVersion: REVIEWED_VERSION, baseUrl: normalizeBaseUrl(baseUrl), routes: ROUTES, setupPreviewCommands: setupCommands(baseUrl) };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const probe = argv.includes('--probe');
  const baseUrl = env.FREELLMAPI_URL || 'http://127.0.0.1:3001';
  const output = probe
    ? await checkGateway({ baseUrl, apiKey: env.FREELLMAPI_API_KEY })
    : plan(baseUrl);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`freellmapi-development: ${error.message}\n`);
    process.exitCode = 1;
  });
}
