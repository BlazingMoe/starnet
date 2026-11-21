'use strict';
// Explicit synthetic evidence for tests only. Never represents real observed demand or rights approval.
const Studio = require('../../sidecar/tools/builtin/service-studio.js');
const Demo = require('../../sidecar/tools/builtin/visual-assets.js');
function input(lane, now = '2026-11-12T12:00:00.000Z', version = 'v1') {
  const asOf = new Date(Date.parse(now)-60000).toISOString();
  const preparation = {
    projectId:'synthetic-visual-demo', version, lane, asOf, freshnessDays:7,
    title:'Fictional Lumen Cairn demo',customerNeed:'Synthetic fixture for a private technical review',scope:'Only a fixed fictional local geometric asset',exclusions:'No real customer, external asset or platform action',customizationPlan:'Fixed synthetic demonstration, not customer production',humanRefinementPlan:'Human review remains pending for produced assets',aiUse:'none',customerAiPreference:'allowed',
    evidence:[{id:'fixture',kind:'observed-fact',statement:'Synthetic test evidence only; not real demand or legal clearance',sourceUrl:'https://example.test/synthetic-fixture',receipt:'synthetic-fixture-only',checkedAt:asOf,support:'supported'}],
    demandEvidenceIds:['fixture'],policyEvidenceId:'fixture',feeEvidenceId:'fixture',
    assets:[{id:'geometry',license:'Private synthetic fixture only',evidenceId:'fixture',rights:'approved',licensing:'approved',likeness:'approved',privacy:'approved'}],
    deliverables:Studio.lanes[lane].deliverables.map(id=>({id,specification:'Bounded fictional demonstration specification'})),
    qa:Object.keys(Studio.lanes[lane].qa).map(id=>({id,plan:'Synthetic preparation plan; finished output still needs review',decision:'approved',evidenceId:'fixture'})),
    review:Object.fromEntries(Studio.gates.map(k=>[k,{decision:'approved',evidenceId:'fixture'}])),
    duplicate:{workId:'synthetic-work',priorState:'none',reconciliation:'confirmed-new',evidenceId:'fixture'},revisionCap:0,revisionsUsed:0,supportWindowDays:0,supportPlan:'No customer support; private review only',refundPlan:'No sale or payment',
    economics:{currency:'EUR',costCurrency:'EUR',quotedPriceMinor:'1000',costsMinor:Object.fromEntries(Studio.costs.map(k=>[k,'0'])),minutes:{acquisition:1,sales:1,production:1,revisions:0,support:0},evidenceId:'fixture'}
  };
  const preparationSha256=Demo.hash(Demo.json(Studio.prepare(preparation)));
  return {destination:'visual-demos/'+preparationSha256,preparation,operatorRequest:{action:'produce-fixed-fictional-demo-after-private-review',lane,preparationSha256,requestedAt:now}};
}
module.exports={input};
