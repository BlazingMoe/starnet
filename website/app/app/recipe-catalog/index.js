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

  // pull each catalog module's raw array. Under node -> require; in the browser -> the global the module set.
  // Add a persona file here with ONE line: `mod('./dev.js', 'RecipeCatalogDev')` (and load its <script> before this).
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
    }
  ];

  const MODULES = [
    mod('./core.js', 'RecipeCatalogCore'),
    // R4 persona catalogs (one line each):
    mod('./dev.js', 'RecipeCatalogDev'),
    mod('./research.js', 'RecipeCatalogResearch'),
    mod('./creator.js', 'RecipeCatalogCreator'),
    mod('./ops.js', 'RecipeCatalogOps'),
    // life-domain catalogs (2026-08-03) — the buckets a person actually has, not just the five work personas:
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

  // flatten + de-dup by id (first occurrence wins). The aggregate is the single built-in source recipes.js reads.
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
