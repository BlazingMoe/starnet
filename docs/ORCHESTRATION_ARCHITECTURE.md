# Moe AI Station — Orchestration Architecture

## Objective

Extend the inherited StarNet multi-agent runtime into an explicit organizational hierarchy without replacing the mature dispatch, permission, budget, concurrency, recovery, or worker-run machinery that already exists.

## Existing runtime we keep

`sidecar/tools/builtin/orchestration.js` provides real delegated agent execution through `team.dispatch` and related team tools. Delegated agents run independent agent loops, consume their own concurrency/budget entries, inherit cancellation from the lead, and return bounded results to the lead. Existing dispatch behavior also includes:

- worker-specific model/provider resolution;
- per-worker USD and iteration ceilings;
- per-worker wall-clock limits;
- foreground, parallel, wave-limited, and background execution;
- explicit session targeting with fail-closed resolution;
- context handoff from lead to worker;
- optional strict JSON result schemas plus bounded repair;
- result/artifact provenance;
- live lifecycle/cost forwarding;
- consent gating on `team.dispatch`;
- autonomous permission enforcement through the existing consent broker;
- cancellation/E-STOP propagation.

These mechanisms remain the execution substrate.

## Derivative policy layer

`sidecar/orchestration/role-policy.js` introduces the logical hierarchy:

```text
Commander
├─ Manager
│  ├─ Specialist
│  │  └─ Worker
│  └─ Worker
├─ Specialist
│  └─ Worker
└─ Worker
```

Allowed delegation edges are intentionally downward-only:

| From | May delegate to |
|---|---|
| Commander | Manager, Specialist, Worker |
| Manager | Specialist, Worker |
| Specialist | Worker |
| Worker | nobody |

This policy does **not** confer capabilities. A role being allowed to delegate does not mean any resulting tool call is allowed. Tool execution remains subject to capability resolution, consent, hardline policy, workspace jails, budgets, concurrency and E-STOP.

## Task contract v1

Hierarchy-aware delegation normalizes into a versioned task contract before execution.

Required fields:

- `id`
- `objective`
- `requestedBy`
- `assignedTo`
- `fromRole`
- `toRole`

Optional fields:

- `parentTaskId`
- `acceptanceCriteria[]`
- `tags[]`
- `deadlineAt`
- `budgetUsd`
- `provenance{}`

The policy rejects invalid roles, upward delegation, missing core fields, invalid deadlines, negative budgets, oversized arrays and malformed provenance.

## Compatibility with inherited roles

The derivative uses additive organizational metadata rather than rewriting inherited runtime role strings in place:

- inherited persistent `orchestrator` / overseer lead maps compatibly to derivative `commander`;
- inherited persistent `specialist` maps to derivative `specialist` by default;
- derivative `manager` is represented as organizational metadata without implicit capabilities;
- derivative `worker` is the lowest organizational execution role and can describe bounded delegated work.

Recruitment/summon paths use the shared organizational-specialty catalog, and explicit parent metadata is persisted when the runtime has real parent evidence. No hierarchy edge is invented merely to complete a tree.

## Integrated implementation sequence

1. **Policy module** — implemented and verified.
2. **Unit/contract tests** — implemented and in derivative CI.
3. **Role metadata boundary** — implemented additively without replacing inherited runtime roles.
4. **Dispatch adapter** — implemented over the existing `team.dispatch` execution substrate.
5. **Manager support** — implemented as bounded downward delegation authority with no implicit tool privileges.
6. **Reviewer contracts** — deterministic acceptance/revision gate plus optional independent auditor implemented.
7. **Managed-task history** — durable completion history plus bounded live task state, cost/provenance and drilldown implemented against a single host-composed store.
8. **Control Mode v1** — implemented as evidence-backed read-only presentation over the same runtime truth sources.

## Control Mode truth boundary

Control Mode is deliberately an observability surface rather than a second control plane. Its dedicated v1 projections are read-only and use existing authoritative sources:

- **Agents** — live roster plus explicit organizational-parent/runtime-status evidence.
- **Memory** — existing memory records projected as provenance/trust metadata; memory text stays hidden.
- **Approvals** — permanent grants, session grants and the existing consent-wait pending state.
- **Actions** — durable run journal tool-intent/dispatch/result evidence; no parallel action trace buffer.
- **Costs** — durable spend ledger plus the existing budget governor/caps.
- **Providers** — provider registry metadata plus actually observed rate-limit/quota evidence.

Provider registry metadata is not a liveness probe. The v1 surface does not infer provider health, availability, credential validity, uptime, latency, success rate or a synthetic health score when no authoritative source exists.

All dedicated Control Mode endpoints are GET/HEAD-only, mutation methods fail closed, schema versions are checked by the UIs, endpoint/source failures remain unavailable/unknown rather than fabricated as zero, and desktop/website surfaces are kept byte-aligned by CI contracts.

## Non-negotiable safety invariants

- Hierarchy policy never bypasses `permissions.js`.
- `team.dispatch` remains consent-gated where the inherited runtime requires it.
- No role implies Full Access.
- No manager/specialist may grant itself new capabilities.
- Workers cannot delegate upward or sideways.
- Cancellation and E-STOP propagate through the inherited execution substrate.
- Budgets remain enforced by the existing budget/capability mechanisms rather than duplicated in orchestration metadata.
- A task cannot be marked complete merely because a child model returned text; acceptance criteria and reviewer policy determine completion where configured.
- Provenance identifies requester/executor/parent relationships only when the runtime has evidence for them.
- Control Mode must never create a parallel truth store to make a dashboard look complete.
- Missing runtime evidence is reported as unknown/unavailable, never converted into invented telemetry.

## Current verified boundary

The internal derivative v1 orchestration/control scope is wired and verification-backed: organizational roles, managed delegation, bounded review/revision, independent audit, durable managed-task history and read-only Control Mode observability are integrated with the inherited execution, permission, consent and E-STOP boundaries.

This is **not** equivalent to public distribution readiness. Independent branding/artwork, derivative installer/update signing and safe application-identity/data-path migration remain explicit release prerequisites and are tracked separately in `qa/moe-feature-evidence.json` and `qa/product-perfect/moe-claims.json`.
