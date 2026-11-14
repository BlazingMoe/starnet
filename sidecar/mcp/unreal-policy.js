/* sidecar/mcp/unreal-policy.js — fail-closed policy for the optional official Unreal MCP connector.
   The editor server is privileged and experimental.  This first increment is discovery/read-only only;
   mutation/import stays unavailable until a real editor is installed and a dedicated typed adapter exists. */
'use strict';

const CONNECTOR_ID = 'unreal-mcp';
const SAFE_META_TOOLS = new Set(['list_toolsets', 'describe_toolset']);
const NEVER_EXPOSE = /(^|[._])(?:call_tool|execute_tool_script)$/i;

function applies(cfg) {
  return String((cfg && cfg.id) || '') === CONNECTOR_ID;
}

function configError(cfg) {
  if (!applies(cfg)) return '';
  if (cfg.transportKind !== 'http') return 'unreal-mcp requires the HTTP transport';
  if (cfg.token || cfg.tokenProvider) return 'unreal-mcp does not accept stored credentials';
  if (cfg.headers && Object.keys(cfg.headers).length) return 'unreal-mcp does not accept custom headers';
  let url;
  try { url = new URL(String(cfg.url || '')); } catch (_) { return 'unreal-mcp requires an exact loopback MCP URL'; }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/mcp' || url.search || url.hash || url.username || url.password) {
    return 'unreal-mcp requires http://127.0.0.1:<port>/mcp with no credentials, query or fragment';
  }
  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return 'unreal-mcp requires an explicit unprivileged port';
  return '';
}

function toolAllowed(cfg, tool) {
  if (!applies(cfg)) return true;
  const name = String((tool && tool.name) || '');
  if (!name || NEVER_EXPOSE.test(name)) return false;
  if (SAFE_META_TOOLS.has(name.toLowerCase())) return true;
  return !!(tool && tool.annotations && tool.annotations.readOnlyHint === true);
}

module.exports = { CONNECTOR_ID, configError, toolAllowed, _internals: { applies, NEVER_EXPOSE, SAFE_META_TOOLS } };
