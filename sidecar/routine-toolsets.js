/* Restriction-only normalization for routine tool-family input. */
'use strict';

const { toolsetRows } = require('./capability/toolsets.js');
const { CAP_REGISTRY } = require('./capability/registry.js');

function key(value) { return String(value == null ? '' : value).trim().toLocaleLowerCase().replace(/[\s_-]+/g, ' '); }

function staticCatalog() {
  const out = [];
  for (const row of toolsetRows(CAP_REGISTRY)) out.push({ id: row.id, aliases: [row.label].concat(row.tools) });
  // Connector tools are all filtered as the existing `connectors` family by inputpolicy.
  out.push({ id: 'connectors', aliases: ['MCP CONNECTORS', 'CONNECTED SERVICES'] });
  return out;
}

function catalogWithRuntime(catalog, tools, connectorAliases) {
  const out = (catalog || staticCatalog()).map(row => ({ id: String(row.id), aliases: (row.aliases || []).slice() }));
  const byId = new Map(out.map(row => [row.id, row]));
  const connector = byId.get('connectors');
  if (connector) for (const alias of connectorAliases || []) connector.aliases.push(alias);
  for (const tool of tools || []) {
    const cap = String(tool && tool.capability || '');
    // A tool alias is usable only when a live registry definition supplies the real MCP capability.
    if (cap.indexOf('mcp:') !== 0 || !connector) continue;
    const family = 'connectors';
    const row = connector;
    if (tool.name) row.aliases.push(tool.name);
    const match = String(tool.description || '').match(/\(via the (.+?) connector\)/i);
    if (match) row.aliases.push(match[1]);
  }
  return out;
}

function normalize(values, options) {
  options = options || {};
  if (values == null) return null;
  if (!Array.isArray(values)) throw new Error('enabledToolsets must be an array or null');
  if (values.length > 16) throw new Error('enabledToolsets may contain at most 16 entries');
  const catalog = catalogWithRuntime(options.catalog, options.tools, options.connectorAliases);
  const canonical = new Map();
  const aliases = new Map();
  for (const row of catalog) {
    canonical.set(row.id, row.id);
    for (const alias of [row.id].concat(row.aliases)) {
      const aliasKey = key(alias);
      const owners = aliases.get(aliasKey) || new Set();
      owners.add(row.id);
      aliases.set(aliasKey, owners);
    }
  }
  const storedMode = options.mode === 'stored' || (!options.strict && !options.mode);
  const out = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('enabledToolsets entries must be non-empty strings');
    let normalized = canonical.get(value.trim()) || null;
    if (!normalized && storedMode) {
      // Disk repair is deliberately narrower than create/update parsing: only exact canonical IDs
      // are recognized. Unknown or former aliases stay unchanged and therefore cannot become grants.
      normalized = null;
    } else if (!normalized) {
      const owners = aliases.get(key(value.trim()));
      if (owners && owners.size > 1) throw new Error('ambiguous routine toolset alias "' + value.trim() + '"');
      normalized = owners && owners.size === 1 ? Array.from(owners)[0] : null;
    }
    if (normalized) { if (!out.includes(normalized)) out.push(normalized); }
    else if (!storedMode) throw new Error('unknown routine toolset "' + value.trim() + '"');
    // Lenient stored-job reads retain unknown strings verbatim. They cannot match a granted capability;
    // keeping a nonempty list also prevents unknown-only legacy restrictions becoming station defaults.
    else if (!out.includes(value.trim())) out.push(value.trim());
  }
  return out;
}

module.exports = { normalize, staticCatalog, catalogWithRuntime };
