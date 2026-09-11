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

## Private-use objective

Moe AI Station is an exclusively private StarNet fork for one operator. The active product goal is a reliable, highly capable personal agent system for revenue-generating/business work plus general research, coding, automation, files, communication, scheduling and other supported tasks. Public redistribution, marketplace launch, independent branding, installer signing and product-identity migration are not active deliverables unless that objective is explicitly changed later.

Engineering priority therefore follows this order: runtime correctness and recovery; truthful cost/budget control; useful autonomy and orchestration; high-value integrations; research/data/document workflows; operator UX/observability; then optional convenience work. Public-distribution work must not displace those priorities.

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
| Scheduling | Cron/schedules | Existing | Sidecar cron/scheduling | UI scheduler, timezone handling, missed-run policy | P1 |
| Scheduling | Event-driven triggers | Partial | Channels/runtime events | Webhooks, file/email/calendar/CI triggers | P2 |
| Autonomy | Manual mode | Partial | Existing leash/trust concepts | Explicit global/per-agent autonomy policy | P0 |
| Autonomy | Assist mode | Partial | Existing trust/capability model | Research/plan without side effects | P0 |
| Autonomy | Execute mode | Partial | Permissions/tools | Allowed actions without per-step confirmation | P0 |
| Autonomy | Autonomous mode | Existing/Partial | Delegation/night-shift primitives | Goal decomposition, budgets, checkpoints, escalation | P1 |
| Autonomy | Night Shift | Existing/Partial | Server night-shift driver, persisted leash accounting, readiness precheck, E-STOP abort and decision/outcome ledger | Continue unattended workflow breadth, checkpoint recovery and operator digest polish | P1 |
| Safety | Emergency stop | Existing | Halt/E-STOP subsystem | Global and scoped stop, durable kill state, UI visibility | P0 |
| Safety | Permission grants | Existing | `permissions.js`, `permgrants.js` | Capability + resource + action + duration scopes | P0 |
| Safety | API authentication | Existing | `apiauth.js` | Threat-model audit, local bind defaults, token rotation | P0 |
| Safety | Secret storage | Existing/Partial | Tauri credentials/keychain/channel secrets | Unified secret broker; never expose raw secrets to agents by default | P0 |
| Safety | Audit log | Existing/Partial | Durable run journal + managed-task history | Broader append-only actor/resource/result coverage | P0 |
| Safety | Sandboxing | Partial | Existing capability and workspace boundaries | OS/process/network limits where feasible | P0 |
| Cost | Token/cost ledger | Existing | Cost/spend/ledger files | Per-agent/task/project/provider attribution | P1 |
| Cost | Budgets | Existing/Partial | Spend controls + read-only budget projection | Hard/soft alerts, fallback models, daily/monthly policy breadth | P1 |
| Memory | Working/context memory | Existing | `context.js` | Explicit scopes, compression strategy, provenance | P0 |
| Memory | Agent long-term memory | Existing | `memcore.js` and agent memory concepts | Retrieval quality, TTL/importance, contradiction handling | P0 |
| Memory | Project memory | Partial | Workspace/memory primitives | Shared project knowledge with access control | P1 |
| Memory | Global user memory | Partial | Commander dossier/taste concepts | User-approved durable preferences and facts | P1 |
| Memory | Episodic memory | Partial | Event/history primitives | Task episodes with outcome and retrospective | P1 |
| Memory | Semantic knowledge | Partial | Memory primitives | Indexed facts/entities/documents with source provenance | P1 |
| Memory | Decision history | Missing/Partial | Logs/events | Store decision, alternatives, evidence, confidence, outcome | P2 |
| Learning | Ratings/feedback | Existing | Feedback/taste-profile concepts | Structured evaluator signals and regression tracking | P1 |
| Learning | Mistake/lesson memory | Partial | Memory + feedback | Verified lessons generated from failures/successes | P1 |
| Learning | Skill extraction | Partial | Skills system exists | Experience → proposed reusable skill → validation → publish | P1 |
| Learning | Skill evolution | Missing/Partial | Skills + memory | Version skills, benchmark, promote/rollback | P2 |
| Evaluation | Reviewer/auditor agents | Existing | Verified deterministic review and optional independent auditor | Broader rubric/eval adoption across workflows | P1 |
| Evaluation | Automated evals | Existing/Partial | Test/eval infrastructure | Golden tasks, workflow evals, tool safety regressions | P1 |
| UI | Pixel/Game Mode | Existing | `frontend/app/world.js` etc. | Rebrand/re-art while preserving functional visualization | P1 |
| UI | Control Mode dashboard | Existing/Partial | Verified read-only managed-task dashboard + six dedicated evidence surfaces | Future safe mutations only where existing authoritative stores support them | P1 |
| UI | Agent tree/org chart | Existing/Partial | Authoritative roster projection with explicit parent edges | Richer visualization without inferring hierarchy | P1 |
| UI | Approval inbox | Existing/Partial | Read-only permanent/session/pending approval center | Approve/reject/edit UX remains future and must reuse consent authority | P0 |
| UI | Observability | Existing/Partial | Managed-task telemetry, run-journal action trace, costs and provider signals | Broader timings/tool/provider evidence when authoritative | P0 |
| UI | Mobile/remote management | Partial | Web/channel architecture | Responsive control surface and secure remote access | P3 |
| Storage | Local-first workspaces | Existing | Sidecar workspace model | Versioned schema and backup/restore | P0 |
| Storage | Migration system | Partial | Fresh-start/lifecycle code | Safe StarNet → derivative data migration and rollback | P0 |
| Interop | Import/export | Partial | Save/cloudsave/skills/MCP | Portable agents, workflows, skills, memory bundles | P2 |
| Reliability | Durable task queue | Missing/Partial | Runtime/autonomy state | Crash-safe queues/checkpoints and resume | P1 |
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

Inherited workflow/autonomy primitives remain substantial but the complete formal workflow IR, durable cross-workflow checkpointing and all autonomy-level product UX remain future scope. The v1 Approval Center is observe-only rather than a new consent mutation system.

### Phase 5 — Control Mode

Read-only v1 is implemented and verification-backed:

1. Agent organization and explicit live-state evidence — delivered.
2. Managed task/workflow telemetry — delivered for the managed-task substrate.
3. Tool-call/action trace — delivered from the durable run journal.
4. Memory provenance viewer — delivered; memory content intentionally hidden.
5. Cost/budget dashboard — delivered from spend ledger/budget governor.
6. Permission/approval center — delivered read-only from existing grant/consent stores.
7. Provider signals — delivered from registry metadata plus observed quota/rate-limit evidence; **provider health is not claimed** because no authoritative liveness source exists.

### Phase 6 — Integrations and productionization

Still open beyond the verified internal v1 boundary:

1. First-class GitHub product integration and real-account acceptance evidence for the implemented Google Workspace connectors.
2. Documents/PDF/spreadsheet/data workflow expansion.
3. Webhook/event triggers and additional communication channels.
4. Plugin SDK and MCP management expansion.
5. Backups, restore verification and private operational recovery. Public release signing/updater and app-identity migration remain outside scope.

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
