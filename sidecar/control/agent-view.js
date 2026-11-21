/* sidecar/control/agent-view.js — read-only projection of the authoritative runtime roster.
   The projector never invents hierarchy edges or live state. Organization role comes from
   the derivative org-role compatibility layer; parent links are emitted only when an
   explicit roster field names another live roster member; status comes only from an
   explicit runtime status source or a recognized roster state field. Sensitive identity
   material (system prompts, credentials, keys, base URLs, secrets) is never copied. */
'use strict';

const rolePolicy = require('../orchestration/role-policy.js');
const orgRole = require('../orchestration/org-role.js');

const PARENT_FIELDS = Object.freeze(['parentAgentId', 'managerAgentId', 'leadAgentId']);
const SAFE_STATUS = new Set(['idle', 'active', 'busy', 'running', 'paused', 'error', 'offline', 'stopped']);

function clean(value, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max || 200) : '';
}

function rosterEntries(roster) {
  if (roster instanceof Map) return Array.from(roster.entries());
  if (Array.isArray(roster)) return roster.map((row, i) => [clean(row && (row.agentId || row.id), 200) || String(i), row]);
  if (roster && typeof roster === 'object') return Object.keys(roster).map(id => [id, roster[id]]);
  return [];
}

function statusValue(record, external) {
  let raw = external;
  if (raw && typeof raw === 'object') raw = raw.status || raw.state;
  if (raw == null && record && typeof record === 'object') raw = record.runtimeStatus || record.status || record.state;
  const value = clean(raw, 40).toLowerCase();
  return SAFE_STATUS.has(value) ? value : 'unknown';
}

function explicitParent(record, knownIds) {
  if (!record || typeof record !== 'object') return null;
  for (const field of PARENT_FIELDS) {
    const id = clean(record[field], 200);
    if (id && knownIds.has(id)) return { agentId: id, sourceField: field };
  }
  return null;
}

function externalStatus(statusByAgent, id) {
  if (typeof statusByAgent === 'function') {
    try { return statusByAgent(id); } catch (_) { return null; }
  }
  if (statusByAgent instanceof Map) return statusByAgent.get(id);
  if (statusByAgent && typeof statusByAgent === 'object') return statusByAgent[id];
  return null;
}

function projectAgentOrganization(roster, options) {
  options = options || {};
  const entries = rosterEntries(roster)
    .map(([id, record]) => [clean(id, 200), record && typeof record === 'object' ? record : {}])
    .filter(([id]) => !!id);
  const knownIds = new Set(entries.map(([id]) => id));

  const agents = entries.map(([id, record]) => {
    const role = orgRole.resolveOrgRole(record);
    const parent = explicitParent(record, knownIds);
    return {
      agentId: id,
      name: clean(record.name, 120) || id,
      orgRole: role || 'unclassified',
      rank: role ? rolePolicy.ROLE_RANK[role] : 0,
      parentAgentId: parent ? parent.agentId : null,
      parentSource: parent ? parent.sourceField : null,
      status: statusValue(record, externalStatus(options.statusByAgent, id)),
      model: clean(record.model, 160) || null,
      provider: clean(record.provider, 80) || null,
      reasoningEffort: clean(record.reasoningEffort, 40) || null
    };
  });

  agents.sort((a, b) => (b.rank - a.rank) || a.name.localeCompare(b.name) || a.agentId.localeCompare(b.agentId));

  const groups = rolePolicy.ROLE_ORDER.map(role => ({
    role,
    rank: rolePolicy.ROLE_RANK[role],
    agents: agents.filter(a => a.orgRole === role)
  }));
  const unknown = agents.filter(a => a.orgRole === 'unclassified');
  if (unknown.length) groups.push({ role: 'unclassified', rank: 0, agents: unknown });

  return {
    schemaVersion: 'moe.control-agents.v1',
    total: agents.length,
    agents,
    groups,
    evidence: {
      rosterKnown: roster != null,
      statusSourceKnown: options.statusByAgent != null,
      hierarchyEdgesExplicit: agents.filter(a => !!a.parentAgentId).length,
      hierarchyEdgesInferred: 0
    }
  };
}

module.exports = { PARENT_FIELDS, SAFE_STATUS, projectAgentOrganization };
