# Moe AI Station — Implementation Roadmap

> Working project name. This document tracks the derivative architecture and implementation plan for `BlazingMoe/starnet`.

## Principles

- Preserve the MIT license and required attribution for inherited source code.
- Replace StarNet trademarks, logos, station artwork, sprites, installer art, and other excluded brand assets before redistribution.
- Keep upstream/base history clean; development happens on dedicated branches.
- Prefer extending proven existing subsystems over duplicating them.
- Every consequential action must be permissioned, auditable, budget-aware, and reversible where practical.
- Self-improvement is controlled: experiences may become proposed lessons/skills, but code/config changes require validation and policy checks.

## Status legend

- **Existing** — substantial implementation already exists in the inherited codebase.
- **Partial** — useful primitives exist, but the target feature needs expansion/integration.
- **Missing** — requires a new subsystem or major implementation.
- **Audit** — presence is known, but behavior/security/coverage still needs code-level verification.

## Feature matrix

| Area | Feature | Status | Current foundation | Target / improvement | Priority |
|---|---|---:|---|---|---:|
| Runtime | Core agent loop | Existing | `sidecar/loop.js` | Harden loop lifecycle, observability, cancellation, retries | P0 |
| Runtime | Multi-provider models | Existing | `sidecar/providers/` | Unified capability metadata, fallback/routing policy, health checks | P0 |
| Runtime | Per-agent model selection | Existing | Agent/provider configuration | Cost/quality profiles and automatic policy routing | P0 |
| Runtime | Commander/orchestrator | Partial | Delegation/spawn primitives | Explicit Commander → Manager → Specialist → Worker hierarchy | P0 |
| Runtime | Agent delegation | Existing | Dispatch/spawn/summon behavior | Structured contracts, deadlines, provenance, result scoring | P0 |
| Runtime | Parallel agent execution | Existing | Bay/concurrency model | Global scheduler, quotas, task pools, backpressure | P0 |
| Runtime | Agent personas/roles | Existing | Agent configuration | Versioned role templates with skills, tools, budgets and quality gates | P1 |
| Runtime | Agent lifecycle | Partial | Roster/runtime state | Pause/resume/drain/restart/recovery policies | P1 |
| Runtime | Structured task contracts | Partial | Existing task/dispatch flow | Typed input/output schemas, acceptance criteria, SLA/deadlines | P1 |
| Tools | Capability gating | Existing | `sidecar/capability/` | Fine-grained read/write/execute/send/delete permissions | P0 |
| Tools | Filesystem | Existing | `sidecar/tools/` | Workspace scoping, path policies, write approvals | P0 |
| Tools | Shell/terminal | Existing | `sidecar/tools/` | Sandboxing, command policy, resource/time limits | P0 |
| Tools | Browser automation | Existing | Browser tools | Session manager, profiles, downloads, safe credentials, replay | P0 |
| Tools | Computer/desktop control | Existing | Desktop/computer tools | Safer action confirmation and app/window allowlists | P1 |
| Tools | Web research | Partial | Browser/network/provider primitives | Dedicated research toolchain with source ranking/citations | P1 |
| Tools | Python/code execution | Partial | Shell/notebook primitives | Managed runtimes, artifacts, dependency policy | P1 |
| Tools | GitHub | Partial | MCP/external integrations possible | First-class repo/issues/PR/CI agent integration | P1 |
| Tools | Gmail | Missing | MCP/channel primitives | Read/search/draft/send with per-action permission scopes | P2 |
| Tools | Calendar | Missing | MCP/external primitives | Search/free-busy/create/update/respond permissions | P2 |
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
| Workflow | Retries/timeouts | Partial | Runtime/tool error handling | Central retry policy, backoff, idempotency metadata | P0 |
| Workflow | Model fallback | Partial | Multi-provider layer | Policy-based fallback by error/cost/quality/context | P1 |
| Workflow | Human approvals | Partial | Permission system | Approval inbox with action preview, expiry and delegation | P0 |
| Workflow | Recipes/templates | Existing | Recipes/workstreams | Versioning, parameters, marketplace/local catalog | P1 |
| Scheduling | Cron/schedules | Existing | Sidecar cron/scheduling | UI scheduler, timezone handling, missed-run policy | P1 |
| Scheduling | Event-driven triggers | Partial | Channels/runtime events | Webhooks, file/email/calendar/CI triggers | P2 |
| Autonomy | Manual mode | Partial | Existing leash/trust concepts | Explicit global/per-agent autonomy policy | P0 |
| Autonomy | Assist mode | Partial | Existing trust/capability model | Research/plan without side effects | P0 |
| Autonomy | Execute mode | Partial | Permissions/tools | Allowed actions without per-step confirmation | P0 |
| Autonomy | Autonomous mode | Existing/Partial | Delegation/night-shift primitives | Goal decomposition, budgets, checkpoints, escalation | P1 |
| Autonomy | Night Shift | Existing/Partial | Night-shift/autonomy features | Durable queues, checkpoint recovery, morning report | P1 |
| Safety | Emergency stop | Existing | Halt/E-STOP subsystem | Global and scoped stop, durable kill state, UI visibility | P0 |
| Safety | Permission grants | Existing | `permissions.js`, `permgrants.js` | Capability + resource + action + duration scopes | P0 |
| Safety | API authentication | Existing | `apiauth.js` | Threat-model audit, local bind defaults, token rotation | P0 |
| Safety | Secret storage | Existing/Partial | Tauri credentials/keychain/channel secrets | Unified secret broker; never expose raw secrets to agents by default | P0 |
| Safety | Audit log | Partial | Events/ledger/tool traces | Append-only action audit with actor/tool/resource/result | P0 |
| Safety | Sandboxing | Partial | Existing capability and workspace boundaries | OS/process/network limits where feasible | P0 |
| Cost | Token/cost ledger | Existing | Cost/spend/ledger files | Per-agent/task/project/provider attribution | P1 |
| Cost | Budgets | Existing/Partial | Spend controls | Hard/soft limits, alerts, fallback models, daily/monthly budgets | P1 |
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
| Evaluation | Reviewer/auditor agents | Missing/Partial | Multi-agent delegation | Independent reviewer roles and rubric-based checks | P1 |
| Evaluation | Automated evals | Partial | Test infrastructure | Golden tasks, workflow evals, tool safety regressions | P1 |
| UI | Pixel/Game Mode | Existing | `frontend/app/world.js` etc. | Rebrand/re-art while preserving functional visualization | P1 |
| UI | Control Mode dashboard | Missing | Existing frontend state/events | Professional task/agent/cost/tool/memory dashboard | P1 |
| UI | Agent tree/org chart | Missing/Partial | Roster/agent state | Commander hierarchy, status, queues, budgets | P1 |
| UI | Approval inbox | Missing/Partial | Permission primitives | Central review/approve/reject/edit action UI | P0 |
| UI | Observability | Partial | SSE/events/logs | Live traces, timings, model/tool calls, errors, costs | P0 |
| UI | Mobile/remote management | Partial | Web/channel architecture | Responsive control surface and secure remote access | P3 |
| Storage | Local-first workspaces | Existing | Sidecar workspace model | Versioned schema and backup/restore | P0 |
| Storage | Migration system | Partial | Fresh-start/lifecycle code | Safe StarNet → derivative data migration and rollback | P0 |
| Interop | Import/export | Partial | Save/cloudsave/skills/MCP | Portable agents, workflows, skills, memory bundles | P2 |
| Reliability | Durable task queue | Missing/Partial | Runtime/autonomy state | Crash-safe queues/checkpoints and resume | P1 |
| Reliability | Health monitoring | Missing/Partial | Runtime state | Provider/tool/agent health, circuit breakers | P1 |
| Reliability | Backups | Partial | Local workspace | Scheduled encrypted backups and restore verification | P2 |
| DevEx | Test suites | Existing | `test/`, fast/http/full scripts | Add derivative regression/e2e/security tests | P0 |
| DevEx | CI | Audit | `.github/` workflows to inspect | Branch CI, lint/test/package/security checks | P0 |
| DevEx | Plugin/extension SDK | Partial | Tools/MCP/providers/channels | Stable manifests, schemas, permissions and examples | P2 |
| Business | Research workflows | Partial | Browser + agents + workflows | Source-diverse research teams with reviewer synthesis | P1 |
| Business | Content workflows | Partial | Agents/workflows | Brief → research → draft → review → publish approval | P2 |
| Business | Outreach workflows | Partial | Browser/channels | Lead/research/draft flows; sending gated by policy | P3 |
| Business | E-commerce workflows | Partial | Browser/workflows | Catalog/research/support/ops integrations with approvals | P3 |
| Branding | Own product name | Missing | Current Tauri product is StarNet | Rename after migration plan is ready | P0 |
| Branding | Own identifier/data path | Missing | `ai.skynet.harness` | New identifier plus one-time migration importer | P0 |
| Branding | Own logo/icons/artwork | Missing | StarNet assets still present | Replace all excluded brand/art assets before distribution | P0 |
| Distribution | Independent updater | Missing | Upstream updater detached on derivative branch | Add own signed releases only after release pipeline exists | P1 |
| Distribution | Independent signing/releases | Missing | Tauri bundling | Own keys, CI builds, release provenance, rollback channel | P1 |

## Phase plan

### Phase 0 — Fork isolation and audit (current)

1. Develop only on `dev/mo-ai-station`.
2. Detach the upstream StarNet updater.
3. Inventory trademarks/artwork, external services, account/cloud dependencies and hard-coded StarNet URLs.
4. Audit existing CI/tests and establish a baseline.
5. Design data migration before changing `ai.skynet.harness`.

### Phase 1 — Safe derivative foundation

1. Introduce derivative product metadata behind a migration-safe boundary.
2. Replace icons, installer art and station art with original assets.
3. Add a centralized product/branding configuration instead of scattered literals.
4. Add derivative-specific test coverage.
5. Establish independent signing/update configuration, initially disabled by default.

### Phase 2 — Command architecture

1. Formalize Commander/Manager/Specialist/Worker roles.
2. Add typed task contracts, acceptance criteria and result provenance.
3. Implement central scheduler, quotas, deadlines and cancellation.
4. Add reviewer/auditor agents and quality gates.
5. Expand permissions from broad tool access to resource/action scopes.

### Phase 3 — Memory and learning

1. Separate working, agent, project and global memory scopes.
2. Add episodic task memory and decision records.
3. Add retrospective/evaluation pipeline.
4. Implement controlled lesson extraction.
5. Implement proposed-skill generation, validation, versioning and rollback.

### Phase 4 — Workflow and autonomy

1. Formal workflow IR for visual and programmatic execution.
2. Add deterministic branches, retries, timeouts and model fallbacks.
3. Add durable execution/checkpoints and crash recovery.
4. Formalize autonomy levels: Manual, Assist, Execute, Autonomous, Scheduled, Event-driven, Night Shift.
5. Build approval inbox and escalation rules.

### Phase 5 — Control Mode

1. Agent organization tree and live state.
2. Task queues and workflow runs.
3. Tool-call/action trace.
4. Memory inspector and provenance viewer.
5. Cost/budget dashboard.
6. Permission/approval center.
7. Provider/tool health center.

### Phase 6 — Integrations and productionization

1. First-class GitHub, email and calendar integrations.
2. Documents/PDF/spreadsheet/data workflows.
3. Webhook/event triggers and additional communication channels.
4. Plugin SDK and MCP management.
5. Backups, release signing, independent updater and migration tooling.

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

## Immediate audit checklist

- [x] Create derivative development branch.
- [x] Identify and detach upstream release endpoint.
- [ ] Inventory all `StarNet`, `starnet`, `starnetos.com`, `androoAGI`, `ai.skynet.harness` references.
- [ ] Inventory logo/icon/sprite/installer/station assets requiring replacement.
- [ ] Inventory cloud/account/telemetry/update endpoints.
- [ ] Inspect Tauri updater calls and ensure absence of hidden upstream update paths.
- [ ] Inspect CI workflows and current test baseline.
- [ ] Map current permission granularity.
- [ ] Map current memory schemas and persistence.
- [ ] Map task/delegation schemas.
- [ ] Define migration plan for product identifier and workspace data.
