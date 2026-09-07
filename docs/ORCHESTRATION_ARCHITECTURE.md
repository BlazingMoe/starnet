# Moe AI Station — Orchestration Architecture

## Objective

Extend the inherited StarNet multi-agent runtime into an explicit organizational hierarchy without replacing the mature dispatch, permission, budget, concurrency, recovery, or worker-run machinery that already exists.

## Existing runtime we keep

`sidecar/tools/builtin/orchestration.js` already provides real delegated agent execution through `team.dispatch` and related team tools. Delegated agents run independent agent loops, consume their own concurrency/budget entries, inherit cancellation from the lead, and return bounded results to the lead. Existing dispatch behavior also includes:

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

## New derivative policy layer

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

Every hierarchy-aware delegation will normalize into a versioned task contract before execution.

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

The inherited frontend currently distinguishes primarily between the persistent lead/orchestrator and specialist roster members, while `team.dispatch` treats a delegated run as a worker execution. We will therefore migrate in stages instead of rewriting existing role values in place.

Planned compatibility mapping:

- inherited persistent `orchestrator` / overseer lead → derivative `commander`;
- inherited persistent `specialist` → derivative `specialist` by default;
- derivative `manager` becomes a new persistent organizational role;
- derivative `worker` describes a lowest-level execution role and may be either persistent or ephemeral depending on the later scheduler/roster implementation.

No existing save is rewritten until a migration-safe role field is added.

## Integration sequence

1. **Policy module** — done.
2. **Unit tests** — initial hierarchy/contract tests added.
3. **Role metadata boundary** — add derivative organizational role metadata without replacing inherited runtime role strings.
4. **Dispatch adapter** — translate an approved Task Contract v1 into the existing `team.dispatch`/spawn substrate.
5. **Manager support** — managers receive bounded delegation authority but no implicit tool privileges.
6. **Reviewer contracts** — introduce independent reviewer/auditor task types and acceptance verdicts.
7. **Task ledger** — persist parent/child relationships, status, cost, provenance and final verdict.
8. **Control Mode** — render the same hierarchy and task graph from durable runtime truth.

## Non-negotiable safety invariants

- Hierarchy policy never bypasses `permissions.js`.
- `team.dispatch` remains consent-gated where the inherited runtime requires it.
- No role implies Full Access.
- No manager/specialist may grant itself new capabilities.
- Workers cannot delegate upward or sideways.
- Cancellation and E-STOP must propagate through the complete task tree.
- Budgets must be enforceable at global, project, parent-task and child-task levels.
- A task cannot be marked complete merely because a child model returned text; acceptance criteria and reviewer policy determine completion where configured.
- Provenance must identify who requested the work, who executed it, which parent task spawned it and what result/artifacts were produced.

## Current boundary

The new role policy is intentionally not wired directly into `orchestration.js` yet because the inherited roster/save schema does not carry the new organizational roles. Enforcing it prematurely would either misclassify existing specialists or break current delegation. The next code change is therefore the additive role-metadata boundary plus compatibility mapping, followed by the dispatch adapter.
