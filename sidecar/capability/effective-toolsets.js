/* Read-only disclosure of host authority and profile projection used by runOnce.
   Describes capability grants, not service availability or a particular run's task policy. */
'use strict';
const { toolsetRows } = require('./toolsets.js');
const profiles = require('../execution-profiles.js');
function effectiveToolsets({ registry, agentId, agent, placed = [], disabled = {}, fullAccess = false, masterBypass = false, backendId = 'local' } = {}) {
  agent = agent || {};
  const source = fullAccess ? 'environment' : masterBypass ? 'station' : agent.approvalMode === 'full' ? 'agent' : null;
  const unrestricted = !!source;
  const profile = profiles.resolve(agent.executionProfile, { approvalMode: agent.approvalMode, backendId });
  const onFloor = new Set(placed);
  const projected = new Set(profile.capabilityObjects);
  return {
    authority: { agentId: agentId || null, name: agent.name || agentId || 'Station defaults', unrestricted, source,
      profile: profile.id, profileLabel: profile.label, filesystemLabel: unrestricted ? 'Whole local computer' : profile.filesystemLabel,
      approvalLabel: unrestricted ? 'FULL ACCESS — no StarNet approval prompts' : 'ASK — standing grants apply',
      revoke: source === 'environment' ? 'Clear SKYNET_FULL_ACCESS in the launch environment and restart.' : source === 'station' ? 'Turn off the station master bypass in Settings → Permissions; individual Full Access agents stay unrestricted.' : source === 'agent' ? 'Set this agent to ASK in its dossier.' : 'Revoke standing grants in Settings → Permissions.' },
    toolsets: toolsetRows(registry).map(r => {
      const enabled = disabled[r.id] !== false;
      const placedHere = !!(r.object && onFloor.has(r.object));
      const profileGranted = projected.has(r.object);
      return Object.assign({}, r, { toolCount: r.tools.length, enabled, placed: placedHere, profileGranted,
        available: unrestricted || (enabled && (placedHere || profileGranted)),
        grantSource: unrestricted ? 'Full Access' : profileGranted ? profile.label : placedHere ? 'station prop' : null,
        switchEffective: !unrestricted, consentGated: !unrestricted && r.consentGated });
    })
  };
}
module.exports = { effectiveToolsets };
