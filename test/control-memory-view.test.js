'use strict';
const A = require('./_assert.js');
const { projectMemoryOverview } = require('../sidecar/control/memory-view.js');

const out = projectMemoryOverview([
  { agentId:'agent', name:'Commander', records:[
    { id:'m1', kind:'fact', title:'SECRET TITLE', body:'SECRET BODY', content:'SECRET CONTENT', scope:'global', sourceRunId:'run-1', origin:'commander', createdAt:10, useCount:3, trust:.8, effectiveTrust:.6, pinned:true },
    { id:'m2', kind:'note', scope:'project', sourceRunId:null, origin:'schedule', createdAt:20, trust:.4, effectiveTrust:.3 }
  ]},
  { agentId:'worker', name:'Worker', records:null }
], { perAgentLimit:1 });

A.eq(out.schemaVersion, 'moe.control-memory.v1', 'memory projection is versioned');
A.eq(out.totals.agents, 2, 'all roster agents are represented');
A.eq(out.totals.knownAgents, 1, 'known memory stores are counted');
A.eq(out.totals.unknownAgents, 1, 'unavailable memory stores remain unknown');
A.eq(out.totals.records, 2, 'known record count is exact');
A.eq(out.totals.pinned, 1, 'pinned count is exact');
A.eq(out.totals.withSourceRun, 1, 'provenance count uses explicit sourceRunId only');
A.eq(out.agents[0].records.length, 1, 'per-agent record metadata is bounded');
A.eq(out.agents[0].records[0].id, 'm2', 'bounded metadata keeps newest record first');
A.eq(out.agents[1].total, null, 'unknown agent memory is null rather than fake zero');
A.eq(out.evidence.contentIncluded, false, 'projection declares that content is excluded');
const json = JSON.stringify(out);
A.ok(!json.includes('SECRET TITLE'), 'memory titles do not cross Control Mode boundary');
A.ok(!json.includes('SECRET BODY'), 'memory bodies do not cross Control Mode boundary');
A.ok(!json.includes('SECRET CONTENT'), 'memory content does not cross Control Mode boundary');
A.report('control-memory-view.test');
