/* Honest, host-derived connector provenance for the operator UI.
   This is descriptive metadata only: it grants no authority and never turns a catalog row,
   an "official" flag, localhost, or a remote server's annotations into a trust decision. */
'use strict';

function endpointKey(value) {
  const raw = String(value == null ? '' : value).trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    return u.toString().replace(/\/+$/, '');
  } catch (_) { return raw; }
}

function provenanceFor(summary, config, catalog) {
  const row = summary || {};
  const cfg = config || {};
  if (row.transport === 'stdio') return {
    tier: 'local-process',
    label: 'LOCAL PROCESS',
    detail: 'Local process in an agent Safe Cell; local does not mean trusted.'
  };

  const entry = catalog && typeof catalog.get === 'function' ? catalog.get(row.id) : null;
  const configured = endpointKey(cfg.url);
  const canonical = endpointKey(entry && entry.url);
  if (entry && configured && canonical && configured === canonical) return {
    tier: 'catalog-endpoint',
    label: 'CATALOG ENDPOINT',
    catalogName: String(entry.name || entry.id || row.id || ''),
    catalogOfficial: entry.official === true,
    detail: 'Endpoint matches the catalog entry; catalog metadata does not make server responses trusted.'
  };
  return {
    tier: 'custom-remote',
    label: 'CUSTOM REMOTE',
    detail: 'Custom remote endpoint; review its operator, requested permissions, and returned content.'
  };
}

function projectConnector(summary, config, catalog) {
  return Object.assign({}, summary || {}, { provenance: provenanceFor(summary, config, catalog) });
}

module.exports = { endpointKey, provenanceFor, projectConnector };
