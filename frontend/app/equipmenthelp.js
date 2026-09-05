/* Read-only explanations of the existing equipment model. Never grants access. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EquipmentHelp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PURPOSE = {
    computer: 'A desk gives an agent a place to work.',
    cabinet: 'Read, create and search files.', dish: 'Search the web and use a browser.',
    workbench: 'Run commands, build software and check the results.',
    notebook: 'Keep notes and remember useful information.',
    studio: 'Create and inspect images.', jukebox: 'Use your connected Spotify account.',
    orchestrator: 'Let the lead delegate work to other agents.',
    connector: 'Use tools from a connected service.'
  };
  function inspect(station, agentId, propType) {
    const cap = station.capForProp(propType);
    const roomId = station.agentRoomId(agentId);
    const props = station.props();
    const room = roomId && station.roomById(roomId);
    const within = p => !roomId || station.roomAt(p.x, p.y) === roomId;
    const equivalents = cap ? props.filter(p => within(p) && station.capForProp(p.t) === cap) : [];
    const objects = roomId ? station.bayObjects(agentId) : props.map(p => ({ objectType: station.capForProp(p.t) }));
    const placed = [...new Set(objects.map(o => typeof o === 'string' ? o : o.objectType).filter(Boolean))];
    return { cap, placed, roomId, scope: roomId ? (room && (room.name || room.label) || 'the agent’s desk room') : 'the station',
      purpose: PURPOSE[cap] || '', count: equivalents.length,
      duplicates: cap === 'computer' ? 'Each workflow agent needs its own assigned desk.'
        : cap === 'connector' ? 'Each portal can represent a different connected service.'
        : cap ? 'One of each ability is enough in this scope. Matching badges provide the same ability; extra copies do not add more tools.'
        : 'Decoration changes the look of your station, not its tools.' };
  }
  function status(facts, view) {
    if (!facts.cap) return facts.duplicates;
    if (facts.cap === 'computer') return facts.duplicates;
    if (!view || !view.authority || !Array.isArray(view.toolsets)) return 'Current access could not be checked. Open Abilities to inspect it.';
    const row = view.toolsets.find(t => t.object === facts.cap);
    if (!row) return 'See Abilities for this service’s connection and access.';
    if (row.available) return 'Already available to ' + view.authority.name + ' · ' + row.grantSource + '. No extra prop needed.';
    if (!row.enabled) return 'This toolset is switched off. Open Abilities to enable it; placing another prop will not enable the switch.';
    return 'To add this ability, place one matching prop in ' + facts.scope + '. Actions still follow this agent’s access settings.';
  }
  return { inspect, status, PURPOSE };
});
