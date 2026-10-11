/* STARNET — recipe-catalog/dev.js : DEVELOPER persona recipes (R4 catalog content).

   Registered in index.js by the aggregator — this file only EXPORTS the array. Same UMD-light
   module pattern as recipes.js: a `RecipeCatalogDev` global in the browser, module.exports under
   node, so the catalog aggregator can concat it either way. NO logic here — pure data.

   Content contract: every record must clear THE RECIPE BAR documented in core.js (earns its tap /
   drives the station / lands somewhere / compounds when recurring). Voice matches the core
   builtins: every `task` is an imperative DIRECTIVE that leads with the bottom-line ask, uses
   {token} params (0–2 each), and reads like the harness wrote it. Gear is honest (cabinet=files,
   dish=web, workbench=shell/tests, studio=media, notebook=memory). cadence only where the use
   case is naturally recurring; else null. skills only where a bundled skill genuinely pairs.
   Schema v2:
   { id, name, emoji, tagline, blurb, accent, tags, params, task, category, gear, skills, cadence, source, forkedFrom } */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.RecipeCatalogDev = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RECIPES = [
    {
      id: 'bug-triage', name: 'Bug Triage', emoji: '⌦', tagline: 'Sort a pile of bugs by what to fix first',
      accent: '#cf8a7d',
      blurb: 'Clusters a backlog into real root causes, then ranks by user impact — with a starting point for each.',
      tags: { code: 0.8, general: 0.2 },
      params: [{ key: 'reports', label: 'Bug reports', placeholder: 'paste the issues — or point me at the tracker / repo' }],
      task: 'Triage these bug reports:\n\n{reports}\n\nFirst cluster duplicates and symptoms of the same root cause — a pile of twenty reports is usually six real problems. Then rank the clusters by real user impact (data loss > broken flow > friction > cosmetic), never by who shouted loudest. For each cluster: the likely root cause in one line, a quick-or-deep estimate, and — if the repo is reachable — where in the code to start looking. Flag anything that is actually working-as-intended, and say why.',
      category: 'developer', gear: ['cabinet'], skills: ['systematic-debugging'], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'pr-sweep', name: 'PR Sweep', emoji: '⊟', tagline: 'Review the open PRs, worst risk first',
      accent: '#cf8a7d',
      blurb: 'Reviews the first page (up to 10 open PRs), reads actual diffs, and saves an evidence-linked, explicitly bounded review.',
      tags: { code: 1 },
      params: [
        { key: 'scope', label: 'Repository / area', type: 'folder', placeholder: 'owner/repository, or a local repository path', required: false, default: 'the open pull requests' },
        { key: 'workspace', label: 'Review workspace', type: 'folder', placeholder: 'where the review report should be saved', required: false, default: 'github-pr-review' }
      ],
      task: 'Review open pull requests in {scope} through the GitHub MCP tools actually exposed to this run. First use fs.list on {workspace} to see existing report folders. Create a fresh, unused run-specific subfolder beneath {workspace} (use a run ID if available, otherwise a timestamp plus short suffix; if it exists, choose another unused suffix); never reuse or overwrite an earlier report. For coverage, call list_pull_requests with state=open, page=1, perPage=10 (or the nearest supported schema values); this deliberately reviews at most the first 10 results, not every open PR. State that page/limit clearly in the report and do not call the result a complete sweep. Then inspect changed files and diff for the highest-risk candidates in that page. The official GitHub server exposes list_pull_requests and pull_request_read with get_files/get_diff, but always follow the schemas this connector actually advertises. Read the real diff, not just titles. Rank by concrete user/security/data risk, whether tests cover the change, and age; put authentication, permissions, migrations, data loss and external side effects first. Flag description-versus-diff mismatches only when the diff supports that claim. Keep evidence short and cite repository, PR number, file/line or diff hunk where available. A PR list is not evidence that its diff or checks were retrieved: if a diff, check run or permission is unavailable, mark that item PARTIAL/UNVERIFIED, state why, and do not infer its contents or status. If no connected GitHub MCP is exposed, use a local repository only when {scope} is an accessible Git checkout and clearly label that it cannot enumerate remote PRs; otherwise stop without inventing results and explain how to connect the read-only GitHub connector. Save review.md and findings.csv inside the new run-specific folder, read both back and verify their contents, preserve uncertainty, and report exact output paths, page/limit coverage and evidence gaps. This is read-only preparation: never comment, approve, request changes, merge, close, dispatch workflows, or modify GitHub.',
      category: 'developer', gear: ['cabinet'], skills: ['code-review'], cadence: 'morning',
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'dependency-audit', name: 'Dependency Audit', emoji: '⊡', tagline: 'What is outdated, risky, or unused',
      intake: [
        { dimension: "scope", question: "Report or act?", options: ["report only","draft the upgrades too"], recommended: "report only", reason: "acting mutates the project; reporting never does" }
      ],
      accent: '#d9a85a',
      blurb: 'Reads the manifest and lockfile, ranks the real risk, and gives a safe upgrade order — not a wall of bumps.',
      tags: { code: 0.8, research: 0.2 },
      params: [{ key: 'project', label: 'Project / manifest', type: 'folder', placeholder: 'the project folder', required: false, default: 'this project' }],
      task: 'Audit the dependencies of {project}. Read the manifest and lockfile, then check each major dependency for known advisories, how far behind it is, and whether the code even still uses it. Rank by REAL risk — a vulnerable transitive dep of a dev tool is not a page-one item. Give the safe upgrade path in order: what to bump first, what to run after each bump to prove nothing broke, and any package worth replacing outright rather than upgrading. Never suggest a bump you have not sanity-checked.',
      category: 'developer', gear: ['cabinet', 'workbench'], skills: ['security-sweep'], cadence: 'weekly',
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'flaky-test-hunt', name: 'Flaky-Test Hunt', emoji: '⊘', tagline: 'Find the tests that fail at random',
      accent: '#b790c0',
      blurb: 'Runs the suite repeatedly, diffs the failures, names each flake\'s cause class — and proves one fix.',
      tags: { code: 1 },
      params: [{ key: 'suite', label: 'Test suite / command', placeholder: 'e.g. npm test, or a specific dir', required: false, default: 'the test suite' }],
      task: 'Hunt the flaky tests in {suite}. Run the suite several times and diff the failures — a test that fails differently across runs is your target. For each flake, isolate its cause class: timing/race, shared state bleeding between tests, order dependence, or a real intermittent bug (that last one is gold, not noise — say so loudly). Rank the shortlist by how often each fires, give a concrete fix per test, and prove at least one fix by re-running before you report.',
      category: 'developer', gear: ['workbench', 'cabinet'], skills: ['systematic-debugging'], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'changelog-draft', name: 'Changelog Draft', emoji: '⊞', tagline: 'Turn commits into a readable changelog',
      intake: [
        { dimension: "audience", question: "Who reads it?", options: ["end users","developers"], recommended: "end users", reason: "decides vocabulary and what counts as a highlight" }
      ],
      accent: '#7bc88a',
      blurb: 'Reads the history AND the diffs — commit messages lie by omission — and writes it for humans.',
      tags: { code: 0.7, general: 0.3 },
      params: [{ key: 'range', label: 'Since', placeholder: 'e.g. the last release, or a tag/date', required: false, default: 'the last release' }],
      task: 'Draft a changelog covering changes since {range}. Read the actual commit history AND spot-check the diffs — commit messages lie by omission. Group into Added / Changed / Fixed with breaking changes clearly at the top, written for a reader who does not know the codebase. Lead with what users will actually notice. Cross-check anything that sounds important against the code itself, so the changelog never claims something that did not really ship.',
      category: 'developer', gear: ['cabinet'], skills: [], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'refactor-scout', name: 'Refactor Scout', emoji: '⌘', tagline: 'Find the code most worth cleaning up',
      intake: [
        { dimension: "scope", question: "Scout or clean?", options: ["scout + report","apply the safest cleanups"], recommended: "scout + report", reason: "applying changes code; scouting never does" }
      ],
      accent: '#b790c0',
      blurb: 'Maps the highest-leverage cleanups by payoff-vs-risk — only debt that pays rent, no cosmetic churn.',
      tags: { code: 1 },
      params: [{ key: 'area', label: 'Code area', type: 'file', placeholder: 'a file — or type a module / area' }],
      task: 'Scout {area} for the refactors actually worth doing. Read the code and rank cleanups by payoff-versus-risk: duplication that keeps causing divergent fixes, functions doing three jobs, dead branches, abstractions leaking their internals. For each: what it costs today, the safe refactor shape, and how contained the blast radius is. Do NOT change anything — give me the map with a one-line rationale each so I can pick. Skip cosmetic churn; only debt that pays rent makes the list.',
      category: 'developer', gear: ['cabinet'], skills: ['simplify-code', 'codebase-inspection'], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'error-log-triage', name: 'Error-Log Triage', emoji: '⚠', tagline: 'Cluster the noise into real incidents',
      accent: '#cf8a7d',
      blurb: 'Groups a wall of errors by root cause — the same bug wears five stack traces — and names today\'s chase.',
      tags: { code: 0.8, general: 0.2 },
      params: [{ key: 'logs', label: 'Error logs', placeholder: 'paste the logs — or point me at the log file' }],
      task: 'Triage these error logs:\n\n{logs}\n\nIf that is a file path, read the real file. Cluster by underlying cause, not by message text — the same bug often wears five different stack traces. For each cluster: how often it fires, how bad it is (crashing users vs logging noise), the most likely root cause read from the traces, and where in the code to look first. Lead with the ONE incident worth chasing today. Call out what is pure noise worth silencing at the logger, and any cluster that looks like it is growing.',
      category: 'developer', gear: ['cabinet'], skills: ['systematic-debugging'], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'onboard-codebase', name: 'Onboard a Codebase', emoji: '◱', tagline: 'Get oriented in unfamiliar code fast',
      accent: '#6fa8bf',
      blurb: 'Maps an unfamiliar repo by how it actually works — entry points, data flow, and where newcomers get bitten.',
      tags: { code: 0.7, research: 0.3 },
      params: [{ key: 'target', label: 'Repo / directory', type: 'folder', placeholder: 'the project folder', required: false, default: 'this repository' }],
      task: 'Orient me in {target}. Read enough to map it honestly: the entry points, how data flows through it, where the core logic lives versus the plumbing, and the conventions the code actually follows — not what the README claims. Lead with a two-sentence "what this is", then the tour in reading order. End with the three files that teach the most per minute, and the one part of the system most likely to bite a newcomer.',
      category: 'developer', gear: ['cabinet'], skills: ['codebase-inspection'], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'perf-pass', name: 'Performance Pass', emoji: '◈', tagline: 'Find where the time and memory go',
      intake: [
        { dimension: "scope", question: "Measure or fix?", options: ["measure + report","apply safe optimizations"], recommended: "measure + report", reason: "fixing mutates code; measuring never does" }
      ],
      accent: '#d9a85a',
      blurb: 'Measures before guessing, names the top bottlenecks with evidence, and estimates each win before selling it.',
      tags: { code: 1 },
      params: [{ key: 'target', label: 'What is slow', placeholder: 'e.g. a slow endpoint, a build step' }],
      task: 'Do a performance pass on {target}. Measure FIRST — profile it or instrument the hot code path; never optimize from vibes. Find where the time or memory actually goes, then report the top two bottlenecks with the evidence and the cheapest fix for each — including "stop doing that work at all" when it applies. Estimate the win before recommending each fix, and say plainly what is NOT worth optimizing so nobody burns a week on it later.',
      category: 'developer', gear: ['workbench', 'cabinet'], skills: ['node-inspect-debugger', 'systematic-debugging'], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'release-notes', name: 'Release Notes', emoji: '⊛', tagline: 'Write the notes users will read',
      intake: [
        { dimension: "audience", question: "Who reads the notes?", options: ["end users","developers"], recommended: "end users", reason: "decides vocabulary and what counts as a highlight" }
      ],
      accent: '#7bc88a',
      blurb: 'Leads with what users feel, spells out breaking changes exactly, and matches your past notes\' voice.',
      tags: { code: 0.5, general: 0.5 },
      params: [
        { key: 'version', label: 'Version', placeholder: 'e.g. 1.4.0' },
        { key: 'changes', label: 'What shipped', placeholder: 'paste the changelog / commit summary', required: false, default: 'the changes since the last release' }
      ],
      task: 'Write release notes for {version} from {changes}. Lead with the two or three changes a user actually FEELS, written as benefits, not commit prose. Then the fuller list grouped sensibly, then upgrade steps and breaking changes spelled out with exact before/after. Find our previous release notes if you can and match their voice, so the series reads consistent. Draft only — do not publish anything.',
      category: 'developer', gear: ['cabinet'], skills: [], cadence: null,
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'docs-vs-code', name: 'Docs vs Reality', emoji: '◭', tagline: 'Where the README lies about the code',
      accent: '#cf8a7d',
      blurb: 'Reads the docs against the actual code and finds every place they have silently drifted apart.',
      tags: { code: 0.8, general: 0.2 },
      params: [{ key: 'repo', label: 'The repository', type: 'folder', placeholder: 'the project folder' }],
      task: 'Read the documentation in {repo} against what the code ACTUALLY does, and find where they disagree. Docs rot silently because nothing fails when they go stale, and the person who notices is a new contributor or a user — both of whom conclude the whole project is unmaintained. Check the concrete, checkable things: setup and install steps run in the order given, commands and flags that still exist with the names shown, configuration keys and their real defaults, environment variables actually read by the code, example snippets that would still run, endpoints and signatures matching the implementation, and version or dependency claims. For each mismatch: where the doc says it, what the code actually does, and how badly it would break someone following along — a wrong install command is fatal, a stale screenshot is cosmetic. Rank by that. Then the reverse pass, which is the one nobody runs: things the code does that the docs never mention at all, especially anything a user would need to know. Compare against your memory so a mismatch I already fixed is not raised twice. Deliver the corrections as a patch I can review. If the docs are accurate, say so in one line.',
      category: 'developer', gear: ['cabinet', 'workbench', 'notebook'], skills: ['codebase-inspection'], cadence: 'weekly',
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'todo-debt', name: 'TODO Debt', emoji: '◓', tagline: 'The notes you left yourself and never came back to',
      accent: '#d9a85a',
      blurb: 'Sweeps the repo for TODO, FIXME and HACK markers, ages them, and ranks by what they actually risk.',
      tags: { code: 0.8, general: 0.2 },
      params: [{ key: 'repo', label: 'The repository', type: 'folder', placeholder: 'the project folder' }],
      task: 'Sweep {repo} for the markers I left myself — TODO, FIXME, HACK, XXX, "temporary", "for now", "come back to this" — and turn them into something I can act on. A raw grep is worthless because it returns two hundred hits with no ordering; the value is in the triage. For each: what it is actually asking for, how OLD it is (check when the line was introduced, not when the file was touched), and what it risks if it stays — a note about naming is not a note about a race condition or an unhandled failure path, and treating them alike is why these lists get ignored. Cluster the ones that are really the same underlying problem. Then rank by risk times age, because an old marker on a dangerous path is the most likely thing in the codebase to bite. Call out the ones that are already DONE and should just be deleted, and the ones that are really feature requests wearing a comment and belong in a tracker instead. Compare against your memory: report what is new, what got fixed, and what has now survived several runs untouched — that last group is a decision I am avoiding, and I want it named. If nothing changed, one line.',
      category: 'developer', gear: ['cabinet', 'workbench', 'notebook'], skills: ['codebase-inspection'], cadence: 'weekly',
      source: 'builtin', forkedFrom: null
    },
    {
      id: 'shipped-digest', name: 'What Actually Shipped', emoji: '◕', tagline: 'The week, read from the repo not memory',
      accent: '#7bc88a',
      blurb: 'Reads the real commit history and diffs to report what landed, what stalled, and what nobody finished.',
      tags: { code: 0.7, general: 0.3 },
      params: [
        { key: 'repo', label: 'The repository', type: 'folder', placeholder: 'the project folder' },
        { key: 'window', label: 'Period', required: false, type: 'choice', default: 'the last week',
          options: ['the last day', 'the last week', 'the last month'] }
      ],
      task: 'Read the real history in {repo} over {window} and tell me what actually shipped. Work from the commits and the diffs, never from what I remember doing — recollection is generous about finished work and silent about abandoned work, which is exactly the asymmetry this is here to correct. Report: what genuinely landed, described as the change in behaviour rather than a list of commit subjects, since nobody can read intent from a subject line. Then the honest half — work that was STARTED and left partway, branches that went quiet, a refactor applied to some call sites and not others, tests added for one path of a change and not the rest. That inconsistent-half state is the most expensive thing in a codebase and it is invisible unless someone reads the whole window at once. Note anything that looks risky: a large diff with no test change, a hurried-looking fix late in the day, a revert. Compare against your memory of the last run so I can see the direction of travel. Finish with the single unfinished thing most worth closing before starting anything new, and offer the digest as a file I can paste into an update.',
      category: 'developer', gear: ['cabinet', 'workbench', 'notebook'], skills: ['codebase-inspection'], cadence: 'weekly',
      source: 'builtin', forkedFrom: null
    }
  ];

  return RECIPES;
});
