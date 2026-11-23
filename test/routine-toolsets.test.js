const A = require('./_assert.js');
const { normalize, staticCatalog } = require('../sidecar/routine-toolsets.js');

A.eq(normalize(null), null, 'omitted and null preserve station defaults');
A.eq(normalize([]), [], 'explicit empty list remains a deny-all restriction');
A.eq(normalize(['web', 'WEB & BROWSER', 'web_search'], { strict: true }), ['web'], 'family id, display label and tool name normalize and deduplicate');
A.eq(normalize(['Calendar', 'mcp__calendar__list'], { strict: true, connectorAliases: ['calendar'], tools: [
  { capability: 'mcp:calendar', name: 'mcp__calendar__list', description: 'List events (via the Calendar connector)' }
]}), ['connectors'], 'dynamic connector display label and names map to the existing connectors restriction');
A.throws(() => normalize(['typo'], { strict: true }), /unknown routine toolset/, 'strict input rejects unknown families');
A.throws(() => normalize(['mcp:unconfigured'], { strict: true }), /unknown routine toolset/, 'arbitrary MCP capability strings are not accepted');
A.throws(() => normalize(['mcp__calendar__list'], { strict: true }), /unknown routine toolset/, 'unverified MCP tool names are not accepted');
A.eq(normalize(['mcp__calendar__list'], { strict: true, tools: [
  { capability: 'mcp:calendar', name: 'mcp__calendar__list' }
]}), ['connectors'], 'an MCP tool alias is accepted only with actual runtime tool metadata');
A.eq(normalize(['cabinet'], { strict: true, connectorAliases: ['cabinet'] }), ['cabinet'], 'exact canonical IDs win over colliding dynamic names');
A.throws(() => normalize(['Cabinet'], { strict: true, connectorAliases: ['cabinet'] }), /ambiguous routine toolset alias/, 'case-folded collision between a canonical family and dynamic alias is rejected');
A.throws(() => normalize(['other'], { strict: true, catalog: [{ id: 'calendar', aliases: [] }], connectorAliases: ['other'] }), /unknown routine toolset/, 'custom catalog without connectors safely declines connector aliases');
A.eq(normalize(['typo']), ['typo'], 'legacy unknown is retained as a nonmatching restriction');
A.eq(normalize(['typo', 'web']), ['typo', 'web'], 'unknown legacy entry cannot widen other restrictions');
A.eq(normalize(['WEB & BROWSER', 'future-family'], { mode: 'stored' }), ['WEB & BROWSER', 'future-family'], 'stored aliases are not upgraded into grants');
A.ok(staticCatalog().some(x => x.id === 'cabinet'), 'catalog is derived from the existing toolset registry');
A.report('routine-toolsets');
