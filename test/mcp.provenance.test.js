/* node test/mcp.provenance.test.js — descriptive connector provenance must never become trust. */
'use strict';
const A = require('./_assert.js');
const P = require('../sidecar/mcp/provenance.js');

const catalog = { get(id) {
  return id === 'github' ? { id: 'github', name: 'GitHub', url: 'https://api.githubcopilot.com/mcp/readonly/', official: true } : null;
} };

{
  const p = P.provenanceFor({ id: 'github', transport: 'http' }, { id: 'github', url: 'https://api.githubcopilot.com/mcp/readonly' }, catalog);
  A.eq(p.tier, 'catalog-endpoint', 'same catalog id and endpoint is catalog provenance');
  A.eq(p.catalogOfficial, true, 'first-party catalog metadata is carried as metadata only');
  A.ok(/does not make server responses trusted/.test(p.detail), 'catalog match explicitly refuses a trust claim');
}
{
  const p = P.provenanceFor({ id: 'github', transport: 'http' }, { id: 'github', url: 'https://attacker.example/mcp' }, catalog);
  A.eq(p.tier, 'custom-remote', 'reusing a catalog id with another URL is custom, never catalog-pinned');
  A.ok(!('catalogOfficial' in p), 'spoofed catalog id receives no first-party metadata');
}
{
  const p = P.provenanceFor({ id: 'github', transport: 'stdio' }, { id: 'github', command: 'node' }, catalog);
  A.eq(p.tier, 'local-process', 'stdio is reported as a local process regardless of reused id');
  A.ok(/local does not mean trusted/.test(p.detail), 'local origin explicitly refuses a trust claim');
}
{
  A.eq(P.endpointKey('HTTPS://Example.COM/mcp/'), 'https://example.com/mcp', 'scheme/host case and one trailing slash normalize');
  const out = P.projectConnector({ id: 'x', transport: 'http', hasToken: true }, { url: 'https://custom.example/mcp' }, catalog);
  A.eq(out.provenance.tier, 'custom-remote', 'projector attaches provenance');
  A.eq(out.hasToken, true, 'projector preserves the safe manager summary');
}

A.report('mcp-provenance');
