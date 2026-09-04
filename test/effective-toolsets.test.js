'use strict';
const A = require('./_assert.js');
const { effectiveToolsets } = require('../sidecar/capability/effective-toolsets.js');
const row = (v, id) => v.toolsets.find(t => t.id === id);
const base = { agentId: 'nova', agent: { approvalMode: 'ask', executionProfile: 'station-gear' }, placed: [], disabled: { web: false } };
const ask = effectiveToolsets(base);
A.eq(row(ask, 'web').available, false, 'ASK respects missing placement and disabled switch');
const placed = effectiveToolsets({ ...base, placed: ['dish'], disabled: {} });
A.eq(row(placed, 'web').available, true, 'ASK plus prop grants capability');
A.eq(row(placed, 'web').consentGated, true, 'ASK retains registry consent policy');
for (const extra of [{ fullAccess: true }, { masterBypass: true }, { agent: { approvalMode: 'full', executionProfile: 'safe-cell' } }]) {
  const full = effectiveToolsets({ ...base, ...extra });
  A.eq(row(full, 'web').available, true, 'each real Full Access source overrides missing prop/disabled switch');
  A.eq(row(full, 'web').enabled, false, 'saved switch state remains inspectable');
  A.eq(row(full, 'web').switchEffective, false, 'UI cannot advertise the override as a working kill switch');
  A.eq(row(full, 'web').consentGated, false, 'Full Access does not claim asks first');
  A.eq(full.authority.filesystemLabel, 'Whole local computer', 'Full Access projects host scope independent of narrower profile');
}
for (const profile of ['safe-cell', 'remote-ssh', 'trusted-project', 'this-computer']) {
  const view = effectiveToolsets({ ...base, agent: { approvalMode: 'ask', executionProfile: profile } });
  A.eq(row(view, 'cabinet').available, true, 'profile grants cabinet without a prop: ' + profile);
  A.eq(row(view, 'cabinet').profileGranted, true, 'profile provenance disclosed: ' + profile);
  A.eq(view.authority.unrestricted, false, 'profile alone never becomes Full Access: ' + profile);
}
A.eq(effectiveToolsets({ ...base, fullAccess: true, masterBypass: true }).authority.source, 'environment', 'highest still-active override determines revoke guidance');
A.report('effective-toolsets');
