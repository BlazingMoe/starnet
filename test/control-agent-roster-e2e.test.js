/* node test/control-agent-roster-e2e.test.js — real roster metadata path into Control Mode. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const { SidecarFixture } = require('./helpers/sidecar-fixture.js');

(async () => {
  const fixture = SidecarFixture.create({
    prefix: 'mo-control-roster-',
    env: { OPENROUTER_KEY: '', STARNET_OPENROUTER_KEY: '', SKYNET_OPENROUTER_KEY: '' }
  });
  try {
    await fixture.start();
    const pushed = await fixture.json('POST', '/api/roster', {
      updatedAt: 1700000000000,
      agents: [
        { agentId: 'agent', name: 'Commander', role: 'Coordinates the station', orgRole: 'commander' },
        { agentId: 'research_mgr', name: 'Research Manager', role: 'Plans research work', orgRole: 'manager', parentAgentId: 'agent' },
        { agentId: 'evidence_worker', name: 'Evidence Worker', role: 'Collects evidence', orgRole: 'worker', parentAgentId: 'research_mgr' },
        { agentId: 'legacy_spec', name: 'Legacy Specialist', role: 'specialist' }
      ]
    });
    A.eq(pushed.status, 200, 'authoritative roster push is accepted');
    A.eq(pushed.body.ok, true, 'roster push reports durable success');

    let view = await fixture.json('GET', '/api/control/agents');
    A.eq(view.status, 200, 'Control Mode agent endpoint is reachable');
    const byId = Object.fromEntries(view.body.organization.agents.map(a => [a.agentId, a]));
    A.eq(byId.agent.orgRole, 'commander', 'descriptive roster role does not hide explicit commander metadata');
    A.eq(byId.research_mgr.orgRole, 'manager', 'explicit manager metadata reaches Control Mode');
    A.eq(byId.research_mgr.parentAgentId, 'agent', 'manager keeps its explicit creation parent');
    A.eq(byId.evidence_worker.orgRole, 'worker', 'explicit worker metadata reaches Control Mode');
    A.eq(byId.evidence_worker.parentAgentId, 'research_mgr', 'multi-level explicit hierarchy survives projection');
    A.eq(byId.legacy_spec.orgRole, 'specialist', 'exact inherited specialist role remains backward compatible');
    A.eq(byId.legacy_spec.parentAgentId, null, 'legacy roster members receive no invented parent edge');
    A.eq(view.body.organization.evidence.hierarchyEdgesExplicit, 2, 'only supplied parent edges are counted');
    A.eq(view.body.organization.evidence.hierarchyEdgesInferred, 0, 'Control Mode never infers hierarchy from history or activity');

    const file = JSON.parse(fs.readFileSync(path.join(fixture.workspace, 'agent.roster.json'), 'utf8'));
    const saved = Object.fromEntries(file.agents.map(a => [a.agentId, a]));
    A.eq(saved.research_mgr.orgRole, 'manager', 'orgRole is durable roster metadata');
    A.eq(saved.evidence_worker.parentAgentId, 'research_mgr', 'parentAgentId is durable roster metadata');
    A.eq(saved.legacy_spec.parentAgentId, null, 'durable migration does not synthesize legacy parents');

    await fixture.restart();
    view = await fixture.json('GET', '/api/control/agents');
    const afterRestart = Object.fromEntries(view.body.organization.agents.map(a => [a.agentId, a]));
    A.eq(afterRestart.research_mgr.orgRole, 'manager', 'org role survives restart before browser re-push');
    A.eq(afterRestart.evidence_worker.parentAgentId, 'research_mgr', 'explicit hierarchy survives restart');
    A.eq(afterRestart.legacy_spec.parentAgentId, null, 'restart still does not invent legacy hierarchy');
  } finally {
    await fixture.dispose();
  }
  A.report('control-agent-roster-e2e.test');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
