# Moe AI Station — Implementation Roadmap

> Working project name. This document tracks the derivative architecture and implementation plan for `BlazingMoe/starnet`.

## Principles

- Preserve the MIT license and required attribution for inherited source code.
- Replace StarNet trademarks, logos, station artwork, sprites, installer art, and other excluded brand assets before redistribution.
- Keep upstream/base history clean; development happens on dedicated branches.
- Prefer extending proven existing subsystems over duplicating them.
- Every consequential action must be permissioned, auditable, budget-aware, and reversible where practical.
- Self-improvement is controlled: experiences may become proposed lessons/skills, but code/config changes require validation and policy checks.
- Missing runtime evidence stays unknown/unavailable; dashboards must not invent state merely to look complete.

## Development method and checkpoint (2026-10-15)

Use one project method alongside this roadmap; this section records execution policy and the current handoff, not a second feature-status ledger. Start from the canonical development checkout, inspect the branch/HEAD, local changes, remote state and required CI evidence, then finish interrupted work before selecting another block. If required CI is pending, missing or unknown, stop development until its state is resolved; do not edit under uncertain gate status. Reuse existing successful evidence and resume ordered gates at their first outstanding step. Diagnose the first real failure, preserve the gate, and report unavailable environment prerequisites as blockers rather than passes or skips. Necessary implementation, integration, recovery work and end-to-end acceptance take precedence over accelerating first launch.

Choose the least costly reliable tool for each task: deterministic scripts, parsers, validators and existing tests for mechanical work; the configured `crack_helper` (`gpt-5.6-sol`, low) for bounded mechanical edits when its use reduces duplicated effort; and the configured `crack_builder` (`gpt-6-luna`, medium) for implementation, focused research, tests and debugging. Reserve lead-model work for consequential architecture or safety decisions, concrete worker blockages, and the final integrated review. Delegate only genuinely independent tasks with explicit file ownership and acceptance criteria; avoid duplicate exploration and repeated context loading. The lead assigns any helper task directly; helpers do not delegate. Use `fork_turns=none` with a compact, complete task brief rather than whole-chat history. Treat a role's configured model as intent, not proof of runtime identity; verify actual child metadata before recording runtime verification. Use the configured native OpenAI fallback only when Luna's native access is actually unavailable; shared-quota exhaustion is not a reason to switch or retry. Preserve work and wait for reset when shared capacity is exhausted.

Plan around the shared account quota and preserve room for integration, lead review, corrections and required CI. Check usage before and after a meaningful block when available. Record actual token or cost telemetry only when exposed by the runtime; otherwise state that it is unavailable, and never invent costs or savings. Do not add billing systems, providers or limit workarounds. When quota is insufficient, retain a precise checkpoint and wait for usable capacity rather than starting another block. If a quota or helper-result query fails before returning its inventory, preserve it as incomplete; infer neither availability nor use from the failed request.

Keep end-to-end acceptance in the block's completion criteria. Fixtures, unit tests, catalogue presence, local runs, real browser/provider acceptance and unattended operation are separate evidence levels. Name missing account or environment access once, complete independent work, and leave real acceptance open. Preserve the existing permission, consent, E-STOP, budget, audit, privacy and recovery safeguards. External messages, publication, purchases, paid commitments and live trades still require their existing separate authorization. The latest direction allows targeted, durable learning/protocol skills now when they demonstrably complement existing notebook, decision or skill functions; broad catalogue work remains later, and selection does not imply activation or continuous loading. This resolves the earlier broad-catalogue deferral without making it a start prerequisite. Do not create background model loops, parallel knowledge stores or unrestricted self-modification.

The recurring automation authorizes publishing a tested block to the configured development branch only after local/remote alignment; never force-push. Run required CI against the exact new commit and wait for green before starting another block. Preserve codex-on-crack panel registrations and keep panel launch disabled.

Current cross-client handoff and block/access self-reports live in [MOE_CROSS_CLIENT_HANDOFF.md](MOE_CROSS_CLIENT_HANDOFF.md); this roadmap remains the single development-policy and feature-plan source. Check the active owner before editing; work delivered by another client remains REVIEW_PENDING until Codex reviews the actual diff and evidence. Read-access logs are self-reports, not a complete audit trail.

Checkpoint 2026-10-21: the offline synthetic browser-local recovery path is implemented in `scripts/station-browser-recovery.mjs` and `npm run recovery:browser`. It accepts only the compatible browser JSON emitted by successful offline CLI restore, validates schema and filters credentials, requires a new absent Chromium profile, and serves a single random-path recovery page at loopback port 8787 with authenticated same-origin receipt. The browser importer writes only to an empty StarNet origin and verifies/rolls back localStorage changes. Chromium acceptance used a complete synthetic recovery bundle, production CLI restore, a fresh profile and a normal sidecar boot on the same origin/profile; a browser-only marker survived and the normal UI showed Recovery Canary. Replay/corrupt/oversized inputs, occupied port, early browser close, rollback write failure and receipt rejection are covered. This input is format/integrity validated, not cryptographically proven to originate from a trusted creator. The normal online importer remains fail-closed because it has no global exclusivity boundary across all run/save writers and tabs. Prior segmented results cover the 741 fast-list entries across commits, not a fresh full suite on one HEAD. Installed-app/Tauri origins, off-disk recovery, actual operator data, real account/provider reauthentication and unattended private acceptance remain open. See [cross-client handoff](MOE_CROSS_CLIENT_HANDOFF.md) and [private runbook](MOE_PRIVATE_OPERATOR_RUNBOOK.md) for the actionable next acceptance.
## Private-use objective

Moe AI Station is an exclusively private StarNet fork for one operator. The active product goal is a reliable, versatile personal agent system across everyday life, learning, research, creative work, coding, files, data analysis, communication, planning, automation and business. The operator's examples of YouTube, Etsy and trading illustrate possible uses; they do not define or limit the supported domains. Public redistribution, marketplace launch, independent branding, installer signing and product-identity migration are not active deliverables unless that objective is explicitly changed later.

For varied natural-language assignments, reuse the common path: understand the goal, plan, select available tools and skills, execute within permissions and budgets, persist progress, recover safely, verify and deliver the result. Domain workflows are reusable recipes and integrations on that shared foundation. New domains should compose existing capabilities wherever possible. Missing access or capability must be reported honestly rather than implied by a recipe or catalogue entry.

Engineering priority therefore follows this order: runtime correctness and recovery; truthful cost/budget control; useful autonomy and orchestration; high-value integrations; research/data/document workflows; operator UX/observability; then optional convenience work. Public-distribution work must not displace those priorities.

## Illustrative life and business workflows (clarified 2026-10-02)

The operator explicitly wants Moe as a central personal system for many different kinds of work. An autonomous YouTube channel (research, original content, video editing, upload and feedback), an Etsy operation (demand/audience research, products, listings and fulfilment), and controlled trading are illustrative long-term use cases. They are neither an exhaustive feature list nor a mandatory three-project sequence, and they do not authorize live external actions.

The [upstream capability audit and delivery plan](MOE_LIFE_BUSINESS_AUTOMATION.md) is the detailed reference. Reuse existing StarNet routines, Night Shift, tools, connectors, grants, budgets, journal and managed recovery. Prioritize complete useful workflows over further diagnostic-only surfaces once correctness and safety gates are satisfied. Do not introduce parallel stores or schedulers.

The existing-catalogue `youtube-production-pack` is one preparation workflow on this foundation. Its possible continuation is verified video rendering, private upload and policy-bounded public publication. Etsy would progress from research/drafts through managed OAuth and reconciled operations; trading would start in simulation with explicit risk and account-state controls and separate authorization for live execution. Select subsequent blocks by actual operator needs, reuse across domains, runtime reliability and demonstrable end-to-end value; these examples must not crowd out general-purpose capabilities. Catalogue availability, local tests and real unattended operation must remain distinct evidence levels.

Decision history records live in each agent's .decisions.json sibling and travel with the existing whole-workspace recovery bundle (memory category). They are intentionally separate from .notebook.json; only the explicit decision tools read or append them.

Decision outcomes can now produce a reference-only lesson candidate in the existing pending memory review queue. Source decision/outcome IDs, uncertainty, and up to 24 bounded evidence references remain labeled unverified through review and Keep; explicit Discard is terminal. Queue rows are protected from normal FIFO eviction, and retries reconcile missing rows. The selected agent's Memory Core now also has a read-only, paginated retrospective over that same decision ledger, including append-only outcomes and distinct pending/staging/reviewing-kept/kept/discarded review receipts. Unknown fields are excluded, model claims remain unconfirmed, and corrupt or quarantined storage is reported as unavailable rather than empty. Verification: test/decision-history.test.js (71 assertions), test/decision-history-http.test.js (28), test/memory-decisions-ui.test.js (28), and test/sidecar.http.test.js (537); live browser/provider acceptance remains deferred.

ROUTINES now exposes the scheduler's existing stale missed-run policy. Recurring routines can keep the schedule-derived default (cron and intervals of at least one hour catch up once; faster intervals skip stale work), explicitly run one missed occurrence, or skip it. This choice applies only beyond the scheduler's grace window; catch-up never replays a backlog, and one-shot routines are unaffected. Create and existing-routine edits use the existing API/store; the active row states the selected policy. The row also shows up to three recent schedule fire/skip/defer decisions from the existing durable autonomy ledger, distinguishing scheduled triggers from skipped/deferred decisions and their recorded reasons. New ledger entries retain the scheduled occurrence instant where the scheduler provides it; event times display in the viewer's timezone, with scheduled time labeled separately from the decision-record timestamp. The next-run display uses the authoritative scheduled instant. The trail is bounded to the ledger's latest 500 entries, so older or pre-change entries may be absent. Focused validation for this projection: test/routine-repeat-ui.test.js (131 assertions under both UTC and Europe/Berlin), test/cron.tick.test.js (220), test/cron.dst.test.js (35), and test/autonomy-ledger.e2e.test.js (scheduled instant verified in the served and persisted ledger, including restart) passed. test/cron.api.test.js passed (131 assertions) on a targeted run with Node diagnostics after an earlier pre-banner timeout; diagnostics showed existing sync-I/O warnings and no startup exception. The user manually opened the isolated fixture and supplied a screenshot on 2026-10-21: scheduled/skipped/triggered times and the unavailable-ledger state render legibly without clipping. This is user-supplied fixture visual evidence, not full application interaction or operator acceptance; the operator app was not opened.

ROUTINES also supports an optional per-run tool-turn cap on create and edit. It is durable with the routine, applies to scheduled entry runs and RUN NOW, and narrows the existing station iteration limit at the shared run host; blank or invalid stored values inherit normal station run-limit behavior. The cap applies to the routine's entry run; downstream work-line stages retain their existing line limits. Invalid API values are rejected, and the routine row reports the configured cap or station default. Verification: test/routine-repeat-ui.test.js, test/cron-store.test.js, test/cron.tick.test.js, test/run-request-limits.test.js, test/cron.api.test.js, and test/e2e.run.test.js; live browser acceptance remains deferred.

## Status legend

- **Existing** — substantial implementation exists and the target behavior is present.
- **Existing/Partial** — a verified useful implementation exists, while broader roadmap extensions remain future work.
- **Partial** — useful primitives exist, but the full target feature needs expansion/integration.
- **Missing** — requires a new subsystem or major implementation.
- **Audit** — presence is known, but behavior/security/coverage still needs code-level verification.
- **Blocked** — intentionally not completed because an explicit prerequisite is absent.
- **Out of scope** — deliberately excluded from the current private-use target; reassess only if the product objective changes.

## Current verified derivative v1 boundary

The current internal derivative v1 is verification-backed for the command/orchestration and read-only Control Mode scope. It includes Commander/Manager/Specialist/Worker organizational metadata, typed managed delegation over the inherited executor, deterministic acceptance/revision checks, optional independent audit, durable managed-task history, and a read-only Control Mode with dedicated Agent, Memory Provenance, Approval, Action Trace, Cost/Budget and Provider Signals surfaces.

This boundary intentionally does **not** claim a second control plane. Control Mode mutations such as approve/reject, hierarchy editing, dispatch, cancel/steer, budget editing or provider-health actions remain outside v1. Provider registry data is not treated as liveness evidence: health, credential validity, latency, uptime, success rate and synthetic health scores are not inferred.

Public distribution is intentionally **outside the current product target**. Independent branding/artwork, derivative installer/update signing, and application-identifier/data-path migration are therefore not active blockers for private use; they are tracked as out-of-scope safeguards and must be reassessed only if redistribution becomes a future goal.

## Feature matrix

| Area | Feature | Status | Current foundation | Target / improvement | Priority |
|---|---|---:|---|---|---:|
| Runtime | Core agent loop | Existing | `sidecar/loop.js` | Harden loop lifecycle, observability, cancellation, retries | P0 |
| Runtime | Multi-provider models | Existing | `sidecar/providers/` | Unified capability metadata, fallback/routing policy; liveness only when authoritative evidence exists | P0 |
| Runtime | Per-agent model selection | Existing | Agent/provider configuration | Cost/quality profiles and automatic policy routing | P0 |
| Runtime | Commander/orchestrator | Existing | Verified organizational-role compatibility layer | Continue migration-safe role metadata without implicit capabilities | P0 |
| Runtime | Agent delegation | Existing | Dispatch/spawn/summon plus managed delegation | Continue scheduler/backpressure and richer task-pool policy | P0 |
| Runtime | Parallel agent execution | Existing | Bay/concurrency model | Global scheduler, quotas, task pools, backpressure | P0 |
| Runtime | Agent personas/roles | Existing | Agent configuration + organizational metadata | Versioned role templates with skills, tools, budgets and quality gates | P1 |
| Runtime | Agent lifecycle | Partial | Roster/runtime state | Pause/resume/drain/restart/recovery policies | P1 |
| Runtime | Structured task contracts | Existing/Partial | Typed managed task contract, acceptance criteria and provenance | SLA/deadline breadth and wider workflow adoption | P1 |
| Tools | Capability gating | Existing | `sidecar/capability/` | Fine-grained read/write/execute/send/delete permissions | P0 |
| Tools | Filesystem | Existing | `sidecar/tools/` | Workspace scoping, path policies, write approvals | P0 |
| Tools | Shell/terminal | Existing | `sidecar/tools/` | Sandboxing, command policy, resource/time limits | P0 |
| Tools | Browser automation | Existing | Browser tools | Session manager, profiles, downloads, safe credentials, replay | P0 |
| Tools | Computer/desktop control | Existing | Desktop/computer tools | Safer action confirmation and app/window allowlists | P1 |
| Tools | Web research | Partial | Browser/network/provider primitives | Dedicated research toolchain with source ranking/citations | P1 |
| Tools | Python/code execution | Partial | Shell/notebook primitives | Managed runtimes, artifacts, dependency policy | P1 |
| Tools | GitHub | Partial | MCP/external integrations possible | First-class repo/issues/PR/CI agent integration | P1 |
| Tools | Gmail | Existing/Partial | Local Google stable-API connector: search, message/thread/attachment read, draft creation and approved draft send | Real-account acceptance/reconnect evidence when the private operator OAuth registration is configured | P2 |
| Tools | Calendar | Existing/Partial | Local Google Calendar stable-API connector: calendars/events/free-busy plus create/patch/delete/RSVP | Real-account acceptance/reconnect evidence when the private operator OAuth registration is configured | P2 |
| Tools | Documents/PDFs | Partial | Files/tools | Parse/create/edit/export/document provenance | P2 |
| Tools | Spreadsheets/data | Partial | Files/notebook | Table operations, formulas, charts, validation | P2 |
| Tools | Images | Existing/Partial | Image tool | Generation/editing pipeline plus asset provenance | P2 |
| Tools | Databases/APIs | Partial | MCP/network primitives | Credential vault, schemas, allowlists, transaction safety | P2 |
| Tools | MCP | Existing | `sidecar/mcp/` | Registry, trust tiers, health/status, per-server permissions | P0 |
| Messaging | Telegram | Existing | `sidecar/channels/` | Unified channel policy and identity mapping | P2 |
| Messaging | Discord | Existing | `sidecar/channels/` | Unified channel policy and identity mapping | P2 |
| Messaging | Other channels | Partial | Channel architecture | Slack/Matrix/Signal/etc. where adapters are available | P3 |
| Voice | Voice interaction | Existing/Partial | Frontend voice/runtime support | Push-to-talk, wake modes, transcription provenance, model choice | P2 |
| Workflow | Visual workflows/conveyors | Existing | Frontend workflow/conveyor system | Formal workflow IR and reusable templates | P0 |
| Workflow | Conditions/branches | Partial | Existing filters/routing | Typed conditions and deterministic branch traces | P1 |
| Workflow | Split/join parallelism | Existing/Partial | Splitter/joiner concepts | Failure policy, quorum and aggregation strategies | P1 |
| Workflow | Loops | Existing/Partial | Controlled loop concepts | Iteration budgets, convergence checks, escape conditions | P0 |
| Workflow | Retries/timeouts | Existing/Partial | Central `recovery-policy.js`, bounded provider retry/fallback/compression and transient host-read retry | Extend idempotency metadata and workflow-specific retry policy without retrying mutations blindly | P0 |
| Workflow | Model fallback | Existing/Partial | Central provider-failure policy plus existing multi-provider fallback/credential rotation paths | Broaden cost/quality/context-aware routing policy | P1 |
| Workflow | Human approvals | Existing/Partial | Permission system + verified read-only Approval Center | Future mutation UX only with existing consent/grant stores as authority | P0 |
| Workflow | Recipes/templates | Existing | Recipes/workstreams | Versioning, parameters, marketplace/local catalog | P1 |
| Scheduling | Cron/schedules | Existing/Partial | Sidecar cron with IANA timezone handling, grace windows and schedule-derived or per-routine stale-run policy; ROUTINES shows next fire in viewer time and recent ledger-backed fire/skip/defer decisions | Broader unattended workflow acceptance and explicit DST/missed-run operator evidence | P1 |
| Scheduling | Event-driven triggers | Partial | Channels/runtime events | Webhooks, file/email/calendar/CI triggers | P2 |
| Autonomy | Manual mode | Partial | Existing leash/trust concepts | Explicit global/per-agent autonomy policy | P0 |
| Autonomy | Assist mode | Partial | Existing trust/capability model | Research/plan without side effects | P0 |
| Autonomy | Execute mode | Partial | Permissions/tools | Allowed actions without per-step confirmation | P0 |
| Autonomy | Autonomous mode | Existing/Partial | Delegation/night-shift primitives | Goal decomposition, budgets, checkpoints, escalation | P1 |
| Autonomy | Night Shift | Existing/Partial | Server night-shift driver, persisted leash accounting, readiness precheck, E-STOP abort, decision/outcome ledger, shared 24-hour operator digest in Control Mode | Continue unattended workflow breadth and checkpoint recovery | P1 |
| Safety | Emergency stop | Existing | Halt/E-STOP subsystem | Global and scoped stop, durable kill state, UI visibility | P0 |
| Safety | Permission grants | Existing | `permissions.js`, `permgrants.js` | Capability + resource + action + duration scopes | P0 |
| Safety | API authentication | Existing | `apiauth.js` | Threat-model audit, local bind defaults, token rotation | P0 |
| Safety | Secret storage | Existing/Partial | Tauri credentials/keychain/channel secrets | Unified secret broker; never expose raw secrets to agents by default | P0 |
| Safety | Audit log | Existing/Partial | Durable run journal + managed-task history | Broader append-only actor/resource/result coverage | P0 |
| Safety | Sandboxing | Partial | Existing capability and workspace boundaries | OS/process/network limits where feasible | P0 |
| Cost | Token/cost ledger | Existing | Cost/spend/ledger files | Per-agent/task/project/provider attribution | P1 |
| Cost | Budgets | Existing/Partial | Spend controls + read-only budget projection; authenticated run requests can lower their own iteration/spend ceilings without changing station settings | Hard/soft alerts, fallback models, daily/monthly policy breadth | P1 |
| Memory | Working/context memory | Existing | `context.js` | Explicit scopes, compression strategy, provenance | P0 |
| Memory | Agent long-term memory | Existing | `memcore.js` and agent memory concepts | Retrieval quality, TTL/importance, contradiction handling | P0 |
| Memory | Project memory | Partial | Workspace/memory primitives | Shared project knowledge with access control | P1 |
| Memory | Global user memory | Partial | Commander dossier/taste concepts | User-approved durable preferences and facts | P1 |
| Memory | Episodic memory | Partial | Event/history primitives | Task episodes with outcome and retrospective | P1 |
| Memory | Semantic knowledge | Partial | Memory primitives | Indexed facts/entities/documents with source provenance | P1 |
| Memory | Decision history | Existing/Partial | `decision.record` / `decision.list` / `decision.outcome` in the per-agent durable memory store | Bounded untrusted records with alternatives, evidence references, uncertainty, optional confidence, and append-only outcome events; excluded from notebook recall; selected-agent read-only paginated retrospective in Memory Core; quality evaluation remains future work | P2 |
| Learning | Ratings/feedback | Existing | Feedback/taste-profile concepts | Structured evaluator signals and regression tracking | P1 |
| Learning | Mistake/lesson memory | Partial | Memory + feedback | Verified lessons generated from failures/successes | P1 |
| Learning | Skill extraction | Partial | Skills system exists | Experience → proposed reusable skill → validation → publish | P1 |
| Learning | Skill evolution | Missing/Partial | Skills + memory | Version skills, benchmark, promote/rollback | P2 |
| Evaluation | Reviewer/auditor agents | Existing | Verified deterministic review and optional independent auditor | Broader rubric/eval adoption across workflows | P1 |
| Evaluation | Automated evals | Existing/Partial | Test/eval infrastructure | Golden tasks, workflow evals, tool safety regressions | P1 |
| UI | Pixel/Game Mode | Existing | `frontend/app/world.js` etc. | Rebrand/re-art while preserving functional visualization | P1 |
| UI | Control Mode dashboard | Existing/Partial | Verified read-only managed-task dashboard + dedicated evidence surfaces, including filter-bound cursor paging over retained recovery history | Future safe mutations only where existing authoritative stores support them | P1 |
| UI | Agent tree/org chart | Existing/Partial | Authoritative roster projection with explicit parent edges | Richer visualization without inferring hierarchy | P1 |
| UI | Approval inbox | Existing/Partial | Read-only permanent/session/pending approval center | Approve/reject/edit UX remains future and must reuse consent authority | P0 |
| UI | Observability | Existing/Partial | Managed-task telemetry, run-journal action trace, costs and provider signals | Broader timings/tool/provider evidence when authoritative | P0 |
| UI | Mobile/remote management | Partial | Web/channel architecture | Responsive control surface and secure remote access | P3 |
| Storage | Local-first workspaces | Existing | Sidecar workspace model | Versioned schema and backup/restore | P0 |
| Storage | Migration system | Partial | Fresh-start/lifecycle code | Safe StarNet → derivative data migration and rollback | P0 |
| Interop | Import/export | Partial | Save/cloudsave/skills/MCP | Portable agents, workflows, skills, memory bundles | P2 |
| Reliability | Durable task recovery | Existing/Partial | Authoritative managed-task history + bounded SAFE_RESTART lifecycle through the normal managed delegation path | Broaden durable checkpoint/resume coverage beyond managed delegation without introducing a second queue | P1 |
| Reliability | Health monitoring | Partial | Provider registry + observed rate-limit signals | Add actual liveness/circuit-breaker sources before claiming health | P1 |
| Reliability | Backups | Partial | Local workspace | Scheduled encrypted backups and restore verification | P2 |
| DevEx | Test suites | Existing | `test/`, fast/http/full scripts + derivative contracts | Continue regression/e2e/security expansion | P0 |
| DevEx | CI | Existing | Moe AI Station CI + inherited gates | Maintain release/security checks as scope grows | P0 |
| DevEx | Plugin/extension SDK | Partial | Tools/MCP/providers/channels | Stable manifests, schemas, permissions and examples | P2 |
| Business | Research workflows | Partial | Browser + agents + workflows | Source-diverse research teams with reviewer synthesis | P1 |
| Business | Content workflows | Partial | Agents/workflows | Brief → research → draft → review → publish approval | P2 |
| Business | Outreach workflows | Partial | Browser/channels | Lead/research/draft flows; sending gated by policy | P3 |
| Business | E-commerce workflows | Partial | Browser/workflows | Catalog/research/support/ops integrations with approvals | P3 |
| Branding | Own product name | Out of scope | Private fork can retain inherited-compatible identity | Reassess only before any redistribution | — |
| Branding | Own identifier/data path | Out of scope | `ai.skynet.harness` remains migration-sensitive and preserves compatible private state | Change only for a future distribution requirement with tested migration | — |
| Branding | Own logo/icons/artwork | Out of scope | StarNet assets remain acceptable for private use | Replace before any future redistribution | — |
| Distribution | Independent updater | Out of scope | Upstream updater is detached | Add a private/independent signed channel only if update distribution becomes necessary | — |
| Distribution | Independent signing/releases | Out of scope | Tauri bundling exists | Reassess signing/release provenance only if installers are distributed | — |

## Phase plan

### Phase 0 — Fork isolation and audit

Core fork/update isolation is complete and verified. Branding, distribution and product-identity migration are explicitly outside the private-use target and do not block runtime development.

### Phase 1 — Safe derivative foundation

Derivative CI/evidence tracking and upstream update isolation exist. Product-identity migration, asset replacement and independent signing remain intentionally untouched because they provide no private-use capability benefit and introduce unnecessary migration risk.

### Phase 2 — Command architecture

The current v1 role policy, managed delegation, acceptance/revision gate, independent auditor and durable managed-task history are implemented and verification-backed. Broader scheduler/resource-scope enhancements remain roadmap work.

### Phase 3 — Memory and learning

Existing inherited memory/feedback/skills foundations remain available. The verified Control Mode v1 only projects content-free memory provenance/trust; it does not claim the broader learning/skill-evolution roadmap is complete.

### Phase 4 — Workflow and autonomy

Inherited workflow/autonomy primitives remain substantial. Managed delegation now has verification-backed durable recovery: interrupted tasks are classified from the authoritative task-history store, only `SAFE_RESTART` work can be atomically claimed, and restart execution re-enters the normal managed delegation capability/consent/budget path. Control Mode can page older recovery checkpoints with a filter-bound cursor over the same retained task-history store; continuation and dropped-storage evidence are reported separately, and the pane never retries or resolves work. It also reuses the existing NightReport projection to show a bounded 24-hour Night Shift digest from the same status, decision-ledger and draft endpoints, with partial-history errors kept explicit and draft bodies hidden. This does not yet claim durable checkpoint/resume coverage for every workflow type; the complete formal workflow IR, broader cross-workflow recovery and all autonomy-level product UX remain future scope. The v1 Approval Center is observe-only rather than a new consent mutation system.

### Phase 5 — Control Mode

Read-only v1 is implemented and verification-backed:

1. Agent organization and explicit live-state evidence — delivered.
2. Managed task/workflow telemetry — delivered for the managed-task substrate.
3. Tool-call/action trace — delivered from the durable run journal.
4. Memory provenance viewer — delivered; memory content intentionally hidden.
5. Cost/budget dashboard — delivered from spend ledger/budget governor.
6. Permission/approval center — delivered read-only from existing grant/consent stores.
7. Provider signals — delivered from registry metadata plus observed quota/rate-limit evidence; **provider health is not claimed** because no authoritative liveness source exists.
8. Cost view now groups spend by the runtime-stamped recipe ID and includes same-run auxiliary ledger rows. Amounts sum per ledger row; recipe/unassigned run counts deduplicate by full `(agentId, runId)`, an unmetered run has at least one unmetered row, and mixed-billing runs are called out. Legacy rows and runs with conflicting recipe IDs stay in a visible unassigned bucket; no historical attribution is inferred. This remains provider-reported/metered ledger evidence, not a cost-saving claim.

### Phase 6 — Integrations and productionization

Still open beyond the verified internal v1 boundary:

1. First-class GitHub product integration and real-account acceptance evidence for the implemented Google Workspace connectors remain open. PR Sweep requires the catalog `github-readonly` endpoint at runtime and stops with a Connectors setup instruction when it is missing or unavailable. Its runtime tool projection excludes full-access GitHub tools even when both connectors are configured, permits only pull-request list/files/diff reads, and enforces open page 1 capped at 10. The fixture preserves prior reports, asserts consent and local report write/read-back, and covers both connectors, full-access-only, absent connector and missing diff. The PR Sweep dossier now has a direct route to Connectors → Catalog → GitHub (read-only), closes before navigation, and has a setup fallback if the deep-link helper is unavailable. The focused handler test and a seeded real-Chromium click check pass: the catalog opens with the exact read-only card highlighted; the only observed non-read request was local station-state `POST /api/save`, with no connector setup/sign-in request. This remains fixture-backed workflow/connector-path evidence only, not authenticated account acceptance or full integration acceptance.
2. Documents/PDF/spreadsheet/data workflow expansion. The existing fs.read Excel text extractor now preserves sparse column positions (including self-closing empty cells and multi-letter addresses), so missing cells do not shift values beneath the wrong headings. Output remains limited to the first 256 columns and discloses omitted columns. This is lossy text extraction, not formula recalculation, chart/layout preservation or full spreadsheet editing. The new read-only fs.profile_csv streams a bounded local prefix and returns row/column/missing/type counts plus finite numeric summaries without data rows or formula execution. It defaults explicitly to comma-delimited with a header, echoes those assumptions, and reports malformed/partial input; its quote handling follows RFC 4180 (https://www.rfc-editor.org/rfc/rfc4180/). The focused real-file suite covers UTF-8 BOM/chunk boundaries, quoted newlines, malformed input and limits. Broader spreadsheet editing, chart/layout preservation and formula recalculation remain open. The read-only fs.read_csv_rows now returns a redacted, explicitly delimited/headered page of cells for concrete table analysis, with one-based source ranges and byte/row/row-size/output limits; formulas remain inert strings, and reading does not refresh overwrite-freshness stamps. It reuses the RFC-style parser; this is bounded table access, not spreadsheet editing, chart/layout preservation or formula recalculation. The existing Explain This Data recipe now composes these read-only tools into a source-preserving answer workflow with paged row review, partial-coverage caveats, consent-gated report output, and file read-back. It also saves findings as a structured table through consent-gated fs.write_csv, which shares fs.write path/freshness and verified-write controls, enforces row/column/cell/byte limits, emits UTF-8 RFC-style CSV with CRLF records, and prefixes strings beginning with =, +, -, @, tab or carriage return (after optional whitespace) with an apostrophe; CSV consumers may interpret this convention differently, and the writer never evaluates formulas. The existing fs.write verification is a direct file write followed by exact read-back; it reports failures but is not crash-atomic. The harness integration fixture exercises tool visibility through the cabinet capability, real file operations, redaction, an intentionally partial profile and unchanged input; this proves fixture execution plumbing, not real-model/browser acceptance. Bounded XLSX sheet discovery and cell pages are now available through the same cabinet jail: worksheet metadata pages cap at 100 entries; an explicitly selected zero-based sheetIndex can read at most 100×64 cells per call, with redacted metadata and cell text, explicit coordinates/missing cells/types, and a 16 MiB archive / per-entry expansion limit. XML is a supported subset (prefixed elements and single-quoted attributes fail closed). Formula caches are inert and may be stale; numeric/date values stay raw. This does not edit workbooks, recalculate formulas, or interpret formatting, charts, or layout. The new consent-gated fs.write_xlsx creates a simple typed table workbook with limits of 1000 data rows, 64 columns, 64000 total cells, 8192 characters per text cell and the configured write-byte ceiling. It stores strings as inline text (including formula-looking text), finite numbers and booleans as typed cells, and null as blank; OOXML escape-like strings and XML control characters are preserved through reversible ST_Xstring escaping, while malformed surrogate strings are rejected. It emits no formulas, macros, external links, styles or charts, checks the complete encoded byte budget while serializing, reuses fs.write path/freshness and exact-readback safeguards, and feeds the existing downloadable deliverables path only from a matching verified receipt. A focused fixture validates output with an independent ZIP parser and the existing read-only XLSX reader; the bundled openpyxl reader independently opens the workbook and verifies numbers, booleans and formula-like text as typed cells. Openpyxl leaves the ST_Xstring-escaped text payloads encoded, so literal escape-like/control text is verified separately through the writer's OOXML round-trip reader. Full workbook editing, formula recalculation, chart/layout preservation and real-model acceptance remain open. Explain This Data keeps CSV as the default findings format and selects the consent-gated XLSX table writer only when the user explicitly requests Excel/XLSX; that path requires the verified write receipt and bounded worksheet read-back.
The bounded `fs.write_docx` milestone extends this document-delivery path for explicit Word requests: it creates editable plain reports with a title and heading/paragraph/bullet blocks, explicit line-break/tab controls, basic black Calibri styles and page geometry, with bounded input and UTF-8/XML validation, and routes writes through cabinet consent, the jailed freshness check and exact binary read-back receipt. Matching verified receipts enter the existing downloadable artifact ledger. Explain This Data retains CSV by default, and uses the DOCX writer only on explicit Word/DOCX requests; the output supports basic paragraph styles only and does not preserve existing layouts or provide tables, images, macros, links, formulas or embedded objects. Focused filesystem, extraction, artifact-download, explicit recipe replay/denial checks plus an independent python-docx parse passed. The bundled document renderer reached rasterization but could not produce page images because LibreOffice was unavailable; this is not visual acceptance. This is synthetic fixture evidence; real-model and UI acceptance remain open.
3. Webhook/event triggers and additional communication channels.
4. Plugin SDK and MCP management expansion.
5. Backups, restore verification and private operational recovery. The normal online browser importer remains fail-closed because run admission, save writers and other tabs do not share a global exclusive maintenance boundary. The separate offline browser-profile route consumes the compatible, schema/integrity-validated browser JSON projected by successful whole-workspace CLI restore, filters credentials, requires a new Chromium profile and verifies localStorage writes with rollback on failure. Isolated Windows Chromium acceptance completed a production CLI restore into a synthetic workspace, imported browser state in a fresh profile, then booted the normal sidecar on the same origin/profile; a browser-only canary survived and the UI showed Recovery Canary. Replay, corrupt/oversized input, occupied port, early close, write rollback and receipt failures are covered. Bundle validation does not cryptographically establish backup provenance. See MOE_PRIVATE_OPERATOR_RUNBOOK.md section 8 and MOE_CROSS_CLIENT_HANDOFF.md for the procedure and evidence. Installed-app/Tauri origins, off-disk backup, actual operator data and account/provider reauthentication acceptance remain open. Public release signing/updater and app-identity migration remain outside scope.

## Controlled self-improvement loop

```text
Task
  → Plan
  → Execute
  → Evaluate
  → Retrospective
  → Candidate lesson
  → Evidence/validation
  → Candidate skill/workflow update
  → Tests/evals
  → Human/policy approval where required
  → Versioned promotion
  → Monitor outcomes
  → Roll back if regression occurs
```

No component receives unrestricted authority to rewrite production code, permissions, secrets, safety policy or release configuration.

## Current verification checklist

- [x] Create derivative development branch.
- [x] Identify and detach upstream release endpoint.
- [x] Verify organizational-role compatibility and managed delegation against inherited permission/consent boundaries.
- [x] Verify deterministic review/revision and independent-auditor contracts.
- [x] Verify durable managed-task history and read-only Control Mode wiring.
- [x] Verify six dedicated Control Mode surfaces for schema, lifecycle, source failure, E2E read-only behavior and accessibility semantics.
- [x] Keep product claims aligned with derivative feature evidence in CI.
- [x] Classify branding/art replacement as outside the private-use target.
- [x] Classify derivative public signing/update distribution as outside the private-use target.
- [x] Preserve the compatible application identifier/data path unless a future functional need justifies migration.

Future redistribution would reopen separate branding, licensing, signing/update-provenance and migration work. None of those items blocks the private system from becoming fully usable for its intended operator.

### Bounded CSV table operations — 2026-10-23

- Added a typed read-only `fs.table_operation` that reads a jailed workspace CSV through the existing streaming parser. It provides filtering, stable sorting, and grouped count/sum/mean/min/max with finite numeric parsing, deterministic missing handling, ambiguous-column refusal, and strict file/row/column/cell bounds. It refuses any partial source and returns verified source identity metadata; results may be passed to existing consent-gated CSV/XLSX writers.
- Explain This Data documents the source-file operation; website mirror is generated by `npm run sync:website`. Source files remain read-only.
### Ordered CSV operation pipelines — 2026-10-23

Added backward-compatible one-step or 1-8 ordered pipelines to `fs.table_operation` over a single complete source read. Each operation consumes the prior result; grouped coverage and result provenance distinguish full-source from filtered-subset summaries. Existing source, parser, output and consent bounds continue to apply.

### Next quota block — PLANNED, source-backed decision dossier

Preparation checkpoint only; no runtime change is made here. Starting base supplied by lead: clean `8e6716dc54022043e7f8ba01c52ed4223b2189d7`, with all five CI checks green. Compare at most these three bounded directions: (1) strengthen the existing Decision Dossier research-to-citation deliverable; (2) add action controls to the observe-only Approval Center, which is high risk because its projection intentionally lacks authoritative live prompt details and mutations already belong to the chat consent flow; (3) add chart deliverables, which currently lack a typed chart writer and safe artifact-preview route. Choose (1): it closes a real evidence gap while reusing `web_search`, `web_fetch`, the existing recipe, and consent-gated verified file writers; it needs no new authority or data store.

**Acceptance target:** deliver a bounded structured per-claim/source evidence manifest as part of existing `sources.md` (or another existing dossier artifact if review shows that fits better), with required-field/reference validation before reporting verified delivery. A claim entry must point to an observed fetched source identity and carry checked date, publication date when available, and an explicit state: reference_checked, unverifiable, blocked, or truncated. “Verified” means only structurally complete and internally reference-consistent; it does not assert semantic support or truth. Search snippets alone cannot establish a fetched citation. The first implementation phase must establish whether the existing tool result contract exposes an authoritative canonical fetched URL and a reliable blocked/truncated indication: `webFetch()` currently returns `{text, url, source}` (and `fullText` when clipped), but the public tool response is model-facing text/summary, while `run-journal.js` records only that visible content and summary. If those fields/statuses cannot be safely linked to claims, stop for a lead decision on the smallest explicit result-contract extension; do not infer trace proof from prose or invent provenance. Once the contract is settled, use the normal dispatcher in a deterministic fixture to generate the manifest from observed search/fetch outputs; validate required fields, source references and status combinations, then save/read back through existing verified `fs.write`/`fs.write_csv` paths and existing downloadable-artifact flow if applicable. Preserve the four-file order where feasible, no new store, and the decision-only/no-side-effect boundary. Reuse `test/harness.integration.test.js` decision-dossier fixture, `test/recipes.test.js`, `test/web.search.test.js`, `test/web.fetch-jina.test.js`, and `test/deliverables-csv-artifact.e2e.test.js` only if its artifact route is exercised; run one focused batch. Separate structural/reference assertions from semantic-support review, which requires a human reviewer or later real acceptance.

Owner: lead selects scope and acceptance; one configured Luna builder owns implementation and focused verification. Add a helper only for a genuinely independent, disjoint task. Use a seeded local development browser only if a meaningful existing dossier UI surface changes; no visual/UI change is currently planned, so no browser step. The user has postponed joint login/acceptance: do not sign in or claim authenticated provider acceptance. No live provider/network calls, new stores/runtimes/providers, background loops, app restart, or publication. Mark this checkpoint PLANNED until the lead accepts the completed evidence.
