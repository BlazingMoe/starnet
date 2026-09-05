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
// Explanations must agree with the existing assigned-room model and host authority.
const Equipment = require('../frontend/app/equipmenthelp.js');
const WM = require('../frontend/app/worldmodel.js');
const station = WM.create();
station.addRoom({kind:'lab',rect:{x1:20,y1:0,x2:30,y2:10}});
for (const p of [
  {t:'war_intelcab',x:1,y:1,w:1,h:2},
  {t:'comms_dish',x:22,y:1,w:2,h:2},
  {t:'bay',x:4,y:4,w:2,h:2,agentId:'worker'},
  {t:'desk',x:25,y:5,w:2,h:1,agentId:'worker'}
]) A.ok(station.addProp(p).ok, 'explanation fixture prop fits');
const leadFiles = Equipment.inspect(station,'lead','war_intelcab');
const workerFiles = Equipment.inspect(station,'worker','war_intelcab');
A.eq(leadFiles.count,1,'unassigned lead sees the cabinet across the station');
A.eq(workerFiles.count,0,'remote bay does not grant cabinet from a different desk room');
A.ok(workerFiles.placed.includes('dish'),'worker explanation uses its desk room despite remote bay');
A.ok(!workerFiles.placed.includes('cabinet'),'no station-wide grant is invented for a room-bound worker');
const asView = (facts, extra={}) => effectiveToolsets({agentId:'worker',agent:{name:'Worker',approvalMode:'ask',executionProfile:'station-gear'},placed:facts.placed,...extra});
A.ok(Equipment.status(workerFiles,asView(workerFiles)).includes('place one matching prop'),'missing scope produces the matching next action');
A.ok(Equipment.status(workerFiles,asView(workerFiles,{fullAccess:true})).includes('No extra prop needed'),'Full Access never recommends redundant equipment');
A.ok(Equipment.status(leadFiles,asView(leadFiles,{disabled:{cabinet:false}})).includes('switched off'),'disabled toolset is not misdiagnosed as missing equipment');
A.ok(Equipment.status(workerFiles,null).includes('could not be checked'),'unavailable authority is never invented');
A.eq(JSON.stringify(WM.deserialize(station.serialize()).doc()),JSON.stringify(station.doc()),'reading explanations leaves saved station unchanged');
A.report('effective-toolsets');
