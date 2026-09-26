'use strict';
const A = require('./_assert.js');
const { projectAgentOrganization } = require('../sidecar/control/agent-view.js');

const roster = new Map([
  ['cmd', { name: 'Commander', role: 'orchestrator', model: 'm1', provider: 'p1', system: 'TOP SECRET', apiKey: 'sk-nope' }],
  ['mgr', { name: 'Manager', orgRole: 'manager', parentAgentId: 'cmd', status: 'idle', reasoningEffort: 'high', baseUrl: 'https://secret.invalid' }],
  ['spec', { name: 'Specialist', role: 'specialist', managerAgentId: 'mgr', state: 'busy' }],
  ['worker', { name: 'Worker', orgRole: 'worker', leadAgentId: 'missing-parent', status: 'made-up' }],
  ['mystery', { name: 'Mystery', role: 'custom', parentAgentId: 'cmd' }]
]);

const out = projectAgentOrganization(roster, { statusByAgent: { cmd: { status: 'running' }, worker: 'paused' } });
A.eq(out.schemaVersion, 'moe.control-agents.v1', 'projection is versioned');
A.eq(out.total, 5, 'all authoritative roster members are present');
A.eq(out.evidence.hierarchyEdgesInferred, 0, 'projection never invents hierarchy edges');
A.eq(out.evidence.hierarchyEdgesExplicit, 3, 'only explicit valid parent links are counted');

const byId = Object.fromEntries(out.agents.map(a => [a.agentId, a]));
A.eq(byId.cmd.orgRole, 'commander', 'legacy orchestrator resolves to commander');
A.eq(byId.mgr.orgRole, 'manager', 'explicit manager role is preserved');
A.eq(byId.spec.orgRole, 'specialist', 'legacy specialist resolves correctly');
A.eq(byId.worker.orgRole, 'worker', 'explicit worker role is preserved');
A.eq(byId.mystery.orgRole, 'unclassified', 'unknown role stays unclassified');
A.eq(byId.mgr.parentAgentId, 'cmd', 'explicit live parent is preserved');
A.eq(byId.mgr.parentSource, 'parentAgentId', 'parent provenance names its source field');
A.eq(byId.spec.parentAgentId, 'mgr', 'managerAgentId is accepted as explicit hierarchy evidence');
A.eq(byId.worker.parentAgentId, null, 'missing parent target is not fabricated into the tree');
A.eq(byId.cmd.status, 'running', 'explicit runtime status source wins');
A.eq(byId.worker.status, 'paused', 'external live state is projected');
A.eq(byId.mgr.status, 'idle', 'recognized roster status is used when no external state exists');
A.eq(byId.mystery.status, 'unknown', 'absence of live state remains unknown');
A.eq(out.groups[0].role, 'commander', 'groups follow hierarchy order');
A.eq(out.groups[1].role, 'manager', 'manager is second hierarchy tier');
A.eq(out.groups[2].role, 'specialist', 'specialist is third hierarchy tier');
A.eq(out.groups[3].role, 'worker', 'worker is fourth hierarchy tier');

const serialized = JSON.stringify(out);
A.ok(!serialized.includes('TOP SECRET'), 'system prompts never leave the projector');
A.ok(!serialized.includes('sk-nope'), 'credentials never leave the projector');
A.ok(!serialized.includes('secret.invalid'), 'base URLs never leave the projector');

const absent = projectAgentOrganization(null);
A.eq(absent.total, 0, 'absent roster does not invent agents');
A.eq(absent.evidence.rosterKnown, false, 'absent roster is represented as unknown evidence');

A.report('control-agent-view.test');
