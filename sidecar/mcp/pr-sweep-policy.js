'use strict';

const catalog = require('./catalog.js');

const CONNECTOR_ID = 'github-readonly';
const ALLOWED = new Set([
  'mcp__github-readonly__list_pull_requests',
  'mcp__github-readonly__pull_request_read'
]);
const READ_METHODS = new Set(['get', 'get_diff', 'get_files', 'get_status', 'get_check_runs']);
const PAGED_READ_METHODS = new Set(['get_files', 'get_check_runs']);
const MAX_READ_PAGE_SIZE = 50;

function boundedRepo(args) {
  return !!args
    && typeof args.owner === 'string' && args.owner.length >= 1 && args.owner.length <= 100
    && typeof args.repo === 'string' && args.repo.length >= 1 && args.repo.length <= 100;
}

function exactKeys(args, allowed) {
  return !!args && Object.keys(args).every(key => allowed.has(key));
}

function firstPage(args, max) {
  return typeof args.page === 'number' && Number.isInteger(args.page) && args.page === 1
    && typeof args.perPage === 'number' && Number.isInteger(args.perPage)
    && args.perPage >= 1 && args.perPage <= max;
}

function connectorIds(objects) {
  const ids = new Set();
  for (const obj of objects || []) {
    if (!obj || obj.objectType !== 'connector') continue;
    const id = obj.connectorId || (obj.binding && obj.binding.connectorId);
    if (id) ids.add(String(id));
  }
  return ids;
}

function readiness(connectors, objects) {
  const ids = connectorIds(objects);
  if (!ids.has(CONNECTOR_ID)) return { ok: false, error: 'Remote PR review is unavailable: connect “GitHub (read-only)” from the Connectors catalog, then retry. The full-access GitHub connector is not used for PR Sweep.' };
  const expected = catalog.installConfig(CONNECTOR_ID);
  const status = connectors && connectors.status(CONNECTOR_ID);
  if (!expected || !status || status.enabled !== true || status.state !== 'up' || status.transport !== 'http' || status.url !== expected.url) {
    return { ok: false, error: 'Remote PR review is unavailable: the catalog “GitHub (read-only)” connector is not connected to its verified read-only endpoint. Open Connectors, reconnect that catalog entry, and retry.' };
  }
  const advertised = ['list_pull_requests', 'pull_request_read'];
  for (const name of advertised) {
    const info = connectors.toolInfo(CONNECTOR_ID, name);
    if (!info || info.state !== 'up' || !info.readOnlyHint) {
      return { ok: false, error: 'Remote PR review is unavailable: GitHub (read-only) does not expose the required read-only pull request tools. Check its connection and tool list in Connectors, then retry.' };
    }
  }
  return { ok: true };
}

function selectTools(connectors, objects, defs) {
  const ready = readiness(connectors, objects);
  if (!ready.ok) return { ...ready, tools: [] };
  const tools = [];
  for (const candidate of defs || []) {
    if (!ALLOWED.has(candidate && candidate.name) || candidate.readOnly !== true || typeof candidate.run !== 'function') continue;
    let def = candidate;
    const toolName = def.name.slice('mcp__github-readonly__'.length);
    const info = connectors.toolInfo(CONNECTOR_ID, toolName);
    if (!info || !info.readOnlyHint) continue;
    if (toolName === 'list_pull_requests') {
      const run = def.run;
      def = Object.assign({}, def, { run: async (args, ctx) => {
        if (!boundedRepo(args) || !exactKeys(args, new Set(['owner', 'repo', 'state', 'page', 'perPage']))
          || args.state !== 'open' || !firstPage(args, 10)) {
          throw new Error('PR Sweep allows only the first page of open pull requests, limited to 10 results.');
        }
        return run(args, ctx);
      } });
    } else if (toolName === 'pull_request_read') {
      const run = def.run;
      def = Object.assign({}, def, { run: async (args, ctx) => {
        const method = args && args.method;
        const common = new Set(['owner', 'repo', 'pullNumber', 'method']);
        const allowedKeys = PAGED_READ_METHODS.has(method)
          ? new Set([...common, 'page', 'perPage'])
          : common;
        if (!boundedRepo(args) || !Number.isInteger(args.pullNumber) || args.pullNumber < 1
          || !READ_METHODS.has(method) || !exactKeys(args, allowedKeys)
          || (PAGED_READ_METHODS.has(method) && !firstPage(args, MAX_READ_PAGE_SIZE))) {
          throw new Error('PR Sweep allows only bounded pull_request_read methods get, get_diff, get_files, get_status, and get_check_runs; paged reads require page 1 and at most 50 results.');
        }
        return run(args, ctx);
      } });
    }
    tools.push(def);
  }
  if (!tools.some(t => t.name === 'mcp__github-readonly__list_pull_requests') || !tools.some(t => t.name === 'mcp__github-readonly__pull_request_read')) {
    return { ok: false, error: 'Remote PR review is unavailable: GitHub (read-only) is missing one of the required review tools. Check its connection and tool list in Connectors, then retry.', tools: [] };
  }
  return { ok: true, tools };
}

module.exports = { CONNECTOR_ID, readiness, selectTools, _internals: { ALLOWED, READ_METHODS, PAGED_READ_METHODS, MAX_READ_PAGE_SIZE, boundedRepo, exactKeys, firstPage, connectorIds } };
