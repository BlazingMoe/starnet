/* STARNET — recipe-catalog/index.js : THE CATALOG AGGREGATE — every built-in recipe, from every module.

   recipes.js consumes THIS (never the individual modules) as the raw built-in array, then normalizes + freezes.
   Structure is deliberately trivial so adding a persona catalog (R4: dev.js / research.js / creator.js / ops.js)
   is a ONE-LINE add: `require`/read the module below, then drop it into the MODULES concat. Nothing else changes.

   Duplicate ids across modules are dropped (first module wins) so a stray copy-paste in a persona file can never
   silently shadow a core recipe or crash the freeze pass — it just doesn't register twice.

   UMD-light: a `RecipeCatalog` global in the browser (reads the sibling *Core globals off root); module.exports
   (the aggregated raw array) under node (requires the sibling modules). */
'use strict';
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.RecipeCatalog = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function mod(nodePath, globalName) {
    if (typeof require === 'function' && typeof module !== 'undefined') {
      try { return require(nodePath); } catch (_) { return []; }
    }
    const g = root[globalName];
    return Array.isArray(g) ? g : [];
  }

  // Moe AI Station private-use extension. Keep this in the existing catalog truth path rather than inventing
  // a second workflow registry. It can move into its own statically loaded catalog module if that loader grows.
  const MOE_RECIPES = [
    {
      id: 'opportunity-discovery', name: 'Opportunity Discovery', emoji: '◇', tagline: 'Find what is worth testing before building it',
      accent: '#d9a85a',
      blurb: 'Researches legitimate ways to earn, compares evidence and economics, then recommends the smallest useful validation experiment.',
      tags: { research: 0.7, general: 0.3 },
      params: [
        { key: 'goal', label: 'What outcome do you want?', placeholder: 'e.g. find a realistic side-income opportunity I can start online', required: false, default: 'find a realistic legitimate opportunity to create additional income' },
        { key: 'constraints', label: 'Constraints', placeholder: 'budget, time, skills, location, platforms to include/exclude', required: false, default: 'use what you know about my available resources; keep the first validation cheap and reversible' }
      ],
      task: 'Find and compare legitimate opportunities for {goal}, subject to {constraints}. Start broad instead of assuming the answer is a specific platform or product type: consider digital products, marketplace or shop products, productized services, content or tool assets, and other lawful models that fit the constraints. Research current external evidence from multiple independent sources for actual demand, competition, buyer pain, typical pricing, platform economics and obvious compliance or operational risks. For every material claim, preserve the source and date. Separate OBSERVED FACTS from ESTIMATES and ASSUMPTIONS. Never present estimated demand, revenue, sales, conversion, margin or profit as an actual metric; when the evidence cannot support a number, say unknown instead of inventing one. Build a candidate table and score each option on demand evidence, differentiation, setup cost, time to first validation, plausible margin, operational complexity, reversibility, and platform/compliance risk. Explain the evidence behind every score. Keep rejected candidates too, with the reason they lost, so the decision can be audited later. Recommend the strongest shortlist and then the single smallest low-cost experiment that would most efficiently falsify or validate the leading opportunity before significant time or money is committed. Define that experiment before execution with a falsifiable hypothesis, the exact exposure or action to test, the measurement window, the authoritative data source for each result, the minimum success threshold, explicit failure and stop criteria, and the maximum time and money at risk. Never infer experiment results from the recommendation itself: until observed outcome data exists, mark the opportunity UNTESTED; after the window, classify it only as VALIDATED, FALSIFIED or INCONCLUSIVE from the recorded evidence. End with a structured handoff containing the opportunity, target buyer, problem, proposed offer, evidence, assumptions, open questions, validation status, estimated validation budget, experiment protocol, authoritative result sources and success/failure criteria so a downstream revenue or production workflow can continue without re-researching the decision. A downstream workflow must not treat UNTESTED or INCONCLUSIVE as validated. This discovery stage may research, analyze and prepare artifacts, but it must not publish listings, contact prospects, buy inventory, spend money, place orders or make a financial commitment. Those are later execution capabilities governed by their own permissions and spending policy, not permanent product limitations.',
      category: 'business', gear: ['dish', 'notebook'], skills: ['web-research', 'decision-1-3-1'], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'opportunity-validation', name: 'Opportunity Validation', emoji: '◎', tagline: 'Run one bounded experiment and judge only real outcomes',
      accent: '#d9a85a',
      blurb: 'Consumes an evidence-backed opportunity handoff, runs exactly one permitted validation experiment, and classifies the result from authoritative evidence.',
      tags: { research: 0.4, general: 0.6 },
      params: [
        { key: 'handoff', label: 'Opportunity handoff', placeholder: 'Paste or reference the structured Opportunity Discovery handoff', required: true },
        { key: 'constraints', label: 'Additional constraints', placeholder: 'optional tighter time, exposure, platform, contact or budget limits', required: false, default: 'do not widen the experiment beyond its predeclared bounds' }
      ],
      task: 'Validate exactly one opportunity from {handoff}, subject to {constraints}. First verify that the handoff is still UNTESTED and contains a falsifiable hypothesis, exact test action or exposure, measurement window, authoritative outcome source for every result, success threshold, failure and stop criteria, and maximum time and money at risk. If any required field is absent or internally inconsistent, do not execute; return execution_state BLOCKED_INVALID_PROTOCOL and leave validation_status UNTESTED. Execute only through tools actually granted by StarNet existing capability resolution and existing consent path. Never invent, cache, mirror or bypass a separate permission or approval state inside this workflow. If a required capability is not granted, return execution_state BLOCKED_CAPABILITY and leave validation_status UNTESTED. If a consent-gated action is denied, treat that denial as an execution result, return execution_state DENIED_BY_CONSENT, perform no substitute side effect, and leave validation_status UNTESTED; denial is not evidence that the business hypothesis failed. If the experiment requires a purchase, order, payment, financial commitment or other consequential action for which no canonical permitted tool path exists, do not simulate completion and do not claim the experiment ran; report the exact blocker. Once execution is genuinely permitted, perform only the single predeclared experiment and never widen exposure, launch a second experiment, scale spend, contact additional prospects, publish additional listings or make follow-on commitments. Record what actually happened, including the real tool/action result and observed timestamps. Determine business outcomes only from the authoritative result sources declared before execution; task completion, agent confidence, generated artifacts, estimates or inferred proxy metrics are never substitutes for observed outcomes. Preserve source references and observation times for every material result. When the measurement window closes, classify validation_status as VALIDATED only if recorded evidence meets the predeclared success threshold, FALSIFIED only if recorded evidence meets a predeclared failure or stop criterion, otherwise INCONCLUSIVE. Missing, unavailable, partial or unverifiable outcome data must produce INCONCLUSIVE rather than fabricated metrics. End with one structured result containing the unchanged opportunity identity, execution_state, validation_status, protocol used, actions actually attempted, consent/capability blockers if any, authoritative observations, evidence references, observed timestamps, threshold evaluation, real measured cost when available, and unknown for any unsupported metric. Do not automatically promote, scale, publish, purchase, order, spend or start a follow-on workflow after classification; hand the verified result back to the existing planning/orchestration path for the next decision.',
      category: 'business', gear: ['dish', 'notebook'], skills: ['web-research', 'decision-1-3-1'], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'validated-opportunity-launch', name: 'Validated Opportunity Launch', emoji: '◈', tagline: 'Turn proven demand into a bounded execution plan',
      accent: '#7bc88a',
      blurb: 'Takes a genuinely validated opportunity and prepares the smallest auditable launch path without pretending estimates are outcomes.',
      tags: { research: 0.2, general: 0.8 },
      params: [
        { key: 'validation', label: 'Validated opportunity result', placeholder: 'Paste or reference the structured Opportunity Validation result', required: true },
        { key: 'constraints', label: 'Launch constraints', placeholder: 'budget, time, platforms, legal/compliance, fulfillment or approval limits', required: false, default: 'prefer the smallest reversible launch that can produce real market feedback' }
      ],
      task: 'Prepare the next execution step for exactly one opportunity from {validation}, subject to {constraints}. First verify from the supplied result that validation_status is exactly VALIDATED and that this status is supported by the predeclared authoritative observations and threshold evaluation. If the status is UNTESTED, INCONCLUSIVE, FALSIFIED, missing, internally inconsistent, or unsupported by the recorded evidence, return launch_state BLOCKED_NOT_VALIDATED and do not promote the opportunity. Preserve the original opportunity identity, hypothesis, evidence references, observation timestamps, measured validation cost and unknown fields unchanged; do not rewrite estimates into facts. Build the smallest viable launch package needed for the specific model: define the offer or product, target buyer, channel, positioning, fulfillment path, pricing hypothesis, unit-economics model, dependencies, compliance or platform constraints, measurable launch objective, authoritative result sources, explicit success/failure criteria, maximum time and money at risk, and stop conditions. Clearly separate OBSERVED FACTS, ESTIMATES, ASSUMPTIONS and DECISIONS. Where a numeric input is unsupported, keep it unknown and show which decision depends on learning it. Reuse StarNet existing planning, capability resolution, consent, files and orchestration paths; do not create or mirror a separate approval, budget, transaction, inventory, order, customer or revenue truth source inside this workflow. Prepare only actions that are actually reachable through granted tools. Any consequential action such as publishing, outreach, purchasing, ordering, payment, ad spend, subscription, contractual acceptance or other financial commitment must pass the canonical capability and consent path at execution time; if no canonical permitted path exists, mark that action BLOCKED_CAPABILITY rather than simulating it. Produce an ordered launch plan that distinguishes reversible preparation from irreversible or externally visible actions, names the exact preflight checks before each consequential action, and defines idempotency or duplicate-prevention requirements wherever retries could create duplicate listings, messages, orders or charges. After building the plan, classify launch_state deterministically: READY_TO_EXECUTE only when validation is proven, every mandatory launch input and exposure bound is present, every required action has a canonical reachable tool path, and required preflight plus duplicate-prevention checks are defined; BLOCKED_CAPABILITY when a required action has no canonical permitted tool path; BLOCKED_PREFLIGHT when a mandatory launch input, exposure bound, preflight requirement or duplicate-prevention requirement is unresolved. Never use READY_TO_EXECUTE merely because a plan or asset was generated. For every ordered action in a READY_TO_EXECUTE handoff, assign a stable action_id and record the intended side effect, canonical capability/tool identity, whether fresh consent is required, the maximum exposure delta, preflight assertions, idempotency or duplicate-prevention strategy, and the authoritative reconciliation source that can prove what actually happened. A downstream executor must treat this handoff as immutable input: if the action parameters, exposure bounds, target, price, quantity, recipient, platform or required capability change, it must return to planning instead of silently widening the approved action. Capability availability and consent must be re-resolved immediately before each consequential side effect; readiness is not a cached permission. If execution later returns an ambiguous or unknown outcome, do not retry a consequential action until the authoritative reconciliation source has established whether the first attempt took effect. Do not infer launch success from task completion, generated assets, agent confidence or projected economics. End with one structured handoff containing launch_state, unchanged validation evidence, launch package, ordered actions, stable action_ids, required capabilities, consent checkpoints, authoritative measurement and reconciliation sources, exposure bounds, stop conditions, unresolved unknowns and the single next action for the existing planning/orchestration path. Do not automatically scale after launch; scaling requires a later decision based on real measured outcomes.',
      category: 'business', gear: ['dish', 'notebook', 'cabinet'], skills: ['plan', 'decision-1-3-1'], cadence: null,
      source: 'builtin', forkedFrom: null
    }
  ];

  const MODULES = [
    mod('./core.js', 'RecipeCatalogCore'),
    mod('./dev.js', 'RecipeCatalogDev'),
    mod('./research.js', 'RecipeCatalogResearch'),
    mod('./creator.js', 'RecipeCatalogCreator'),
    mod('./ops.js', 'RecipeCatalogOps'),
    mod('./business.js', 'RecipeCatalogBusiness'),
    MOE_RECIPES,
    mod('./money.js', 'RecipeCatalogMoney'),
    mod('./career.js', 'RecipeCatalogCareer'),
    mod('./learn.js', 'RecipeCatalogLearn'),
    mod('./life.js', 'RecipeCatalogLife'),
    mod('./data.js', 'RecipeCatalogData'),
    mod('./writing.js', 'RecipeCatalogWriting'),
    mod('./general.js', 'RecipeCatalogGeneral'),
  ];

  const seen = Object.create(null), out = [];
  for (const arr of MODULES) {
    for (const r of (Array.isArray(arr) ? arr : [])) {
      if (!r || r.id == null || seen[r.id]) continue;
      seen[r.id] = true;
      out.push(r);
    }
  }
  return out;
});