/* STARNET — evidence-based session starters. Context shortcuts reopen the actual
   conversation; recipes require a recent launch. Without evidence, offer editable tasks. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Starters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_CHIPS = 3;
  const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  function defaults() {
    return [
      { kind: 'draft', label: 'Plan a task', description: 'Turn an outcome into practical next steps.', send: 'Help me plan this task. Break it into practical steps and identify what to do first.\n\nThe outcome I want: ' },
      { kind: 'draft', label: 'Compare options', description: 'Weigh the tradeoffs for a decision you need to make.', send: 'Help me compare these options, explain the tradeoffs, and recommend one based on my priorities.\n\nMy options and priorities: ' },
      { kind: 'draft', label: 'Improve a draft', description: 'Bring text or an idea to review and refine.', send: 'Review this draft for clarity and usefulness, then suggest a stronger version.\n\nMy draft: ' }
    ];
  }
  function pick(signals) {
    const s = signals || {};
    const fresh = at => Number.isFinite(at) && Number.isFinite(s.now) && at > 0 && at <= s.now && s.now - at <= MAX_AGE;
    const chips = [], used = new Set();
    const sessions = (Array.isArray(s.sessions) ? s.sessions : [])
      .filter(w => w && w.id && typeof w.title === 'string' && w.title.trim() && !w.archived && !w.busy && w.lane !== 'shipped' && fresh(w.at))
      .sort((a, b) => b.at - a.at);
    for (const w of sessions) {
      if (used.has(w.id)) continue;
      used.add(w.id);
      chips.push({ kind: 'session', sessionId: w.id, label: w.title.trim(), description: 'Open recent conversation · keep its context' });
      if (chips.length === 2) break;
    }
    const recipes = new Map((Array.isArray(s.recipes) ? s.recipes : []).filter(r => r && r.id).map(r => [r.id, r]));
    const recent = (Array.isArray(s.recent) ? s.recent : []).filter(e => e && recipes.has(e.id) && fresh(e.at)).sort((a, b) => b.at - a.at);
    if (recent.length) {
      const recipe = recipes.get(recent[0].id);
      let values = null;
      try { values = typeof s.valuesOf === 'function' ? s.valuesOf(recipe.id) : null; } catch (_) {}
      chips.push({ kind: 'recipe', label: String(recipe.name || recipe.id), recipe, values,
        description: values && Object.keys(values).length ? 'Use again · review your saved inputs' : 'Used recently · set up another task' });
    }
    return chips.length ? chips.slice(0, MAX_CHIPS) : defaults();
  }
  return { pick, defaults, MAX_CHIPS };
});
