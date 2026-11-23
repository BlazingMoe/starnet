/* sidecar/mcp/registry-discovery.js — bounded read-only projection of the official MCP Registry.
   Registry metadata is publisher-supplied discovery evidence, never trust, liveness, installation or
   permission. This module deliberately exposes only fixed HTTPS Streamable-HTTP endpoints that can be
   copied into the existing manual connector form; it never downloads packages or starts processes. */
'use strict';

const ORIGIN = 'https://registry.modelcontextprotocol.io';
const MAX_RESULTS = 10;
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

class RegistryDiscoveryError extends Error {
  constructor(code, message) { super(message); this.name = 'RegistryDiscoveryError'; this.code = code; }
}

function cleanText(value, max) {
  const text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function normalizeQuery(value) {
  const query = String(value == null ? '' : value).trim();
  if (/[\u0000-\u001f\u007f]/.test(query)) throw new RegistryDiscoveryError('INVALID_QUERY', 'registry search cannot contain control characters');
  const length = Array.from(query).length;
  if (length < 3 || length > 80) throw new RegistryDiscoveryError('INVALID_QUERY', 'registry search must be 3-80 characters');
  return query;
}

function safeHttpsUrl(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw || raw.indexOf('{') >= 0 || raw.indexOf('}') >= 0 || raw.length > 2048) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return '';
    return url.toString();
  } catch (_) { return ''; }
}

function officialMeta(record) {
  const meta = record && record._meta && record._meta['io.modelcontextprotocol.registry/official'];
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
}

function suggestedId(name) {
  const tail = String(name || '').split('/').pop() || 'registry-mcp';
  let id = tail.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (!id) id = 'registry-mcp';
  return id;
}

function projectRecord(record) {
  const server = record && record.server;
  const meta = officialMeta(record);
  if (!server || typeof server !== 'object' || Array.isArray(server)) return null;
  if (meta.status !== 'active' || meta.isLatest !== true) return null;
  const name = cleanText(server.name, 200);
  const version = cleanText(server.version, 255);
  if (!/^[A-Za-z0-9.-]+\/[A-Za-z0-9._-]+$/.test(name) || !version) return null;

  const remotes = Array.isArray(server.remotes) ? server.remotes.slice(0, 32) : [];
  let remoteUrl = '';
  let fixedHttpsCount = 0;
  let headerRequiredCount = 0;
  for (const remote of remotes) {
    if (!remote || remote.type !== 'streamable-http') continue;
    const url = safeHttpsUrl(remote.url);
    if (!url) continue;
    fixedHttpsCount++;
    const headers = Array.isArray(remote.headers) ? remote.headers : [];
    if (headers.length) { headerRequiredCount++; continue; }
    if (!remoteUrl) remoteUrl = url;
  }

  let unavailableReason = '';
  if (!remoteUrl) {
    unavailableReason = headerRequiredCount
      ? 'A fixed HTTPS endpoint is listed, but it requires header setup that is not imported automatically.'
      : fixedHttpsCount
        ? 'No header-free endpoint is available for safe prefill.'
        : 'No fixed HTTPS Streamable-HTTP endpoint is listed; package and process installs are not supported here.';
  }
  const repository = server.repository && typeof server.repository === 'object' ? safeHttpsUrl(server.repository.url) : '';
  return {
    name,
    title: cleanText(server.title || name.split('/').pop(), 100),
    description: cleanText(server.description, 500),
    version,
    websiteUrl: safeHttpsUrl(server.websiteUrl),
    repositoryUrl: repository,
    remoteUrl,
    canPrefill: !!remoteUrl,
    unavailableReason,
    suggestedId: suggestedId(name),
    registryStatus: 'active',
    latest: true
  };
}

async function readBoundedBody(response) {
  const advertised = Number(response && response.headers && response.headers.get && response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > MAX_RESPONSE_BYTES) {
    throw new RegistryDiscoveryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeded the size limit');
  }
  if (response && response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
    const chunks = []; let total = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > MAX_RESPONSE_BYTES) throw new RegistryDiscoveryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeded the size limit');
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, total).toString('utf8');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new RegistryDiscoveryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeded the size limit');
  }
  return text;
}

async function search(options) {
  const opts = options || {};
  const query = normalizeQuery(opts.query);
  const fetchImpl = opts.fetchImpl;
  if (typeof fetchImpl !== 'function') throw new RegistryDiscoveryError('REGISTRY_UNAVAILABLE', 'registry fetch is unavailable');
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(15000, Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = ORIGIN + '/v0.1/servers?search=' + encodeURIComponent(query) + '&version=latest&limit=' + MAX_RESULTS;
  let response, payload;
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Moe-AI-Station-registry-discovery' }
    });
    if (!response || !response.ok) throw new RegistryDiscoveryError('REGISTRY_UNAVAILABLE', 'registry search returned HTTP ' + (response ? response.status : 'unknown'));
    payload = JSON.parse(await readBoundedBody(response));
  } catch (error) {
    if (error instanceof RegistryDiscoveryError) throw error;
    if (controller.signal.aborted) throw new RegistryDiscoveryError('REGISTRY_TIMEOUT', 'registry search timed out');
    if (error instanceof SyntaxError) throw new RegistryDiscoveryError('REGISTRY_INVALID_RESPONSE', 'registry returned invalid JSON');
    throw new RegistryDiscoveryError('REGISTRY_UNAVAILABLE', 'registry search failed');
  } finally { clearTimeout(timer); }
  if (!payload || !Array.isArray(payload.servers)) throw new RegistryDiscoveryError('REGISTRY_INVALID_RESPONSE', 'registry response did not contain a server list');
  const entries = payload.servers.slice(0, MAX_RESULTS).map(projectRecord).filter(Boolean);
  return {
    query,
    source: ORIGIN,
    entries,
    count: entries.length,
    moreAvailable: !!(payload.metadata && payload.metadata.nextCursor),
    notice: 'Registry entries are publisher-supplied discovery metadata, not trust or liveness evidence. Prefill never connects a server.'
  };
}

module.exports = {
  ORIGIN, MAX_RESULTS, MAX_RESPONSE_BYTES, RegistryDiscoveryError,
  normalizeQuery, safeHttpsUrl, suggestedId, projectRecord, search
};
