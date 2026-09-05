# Hermes comparison follow-through — 2026-09-05

The three observed StarNet reliability gaps are implemented in commits d4c4c2195, 505236bd5 and 8ccf27916. The implementation branch was synchronized with integration commit ff9e147cf in 9cb517883.

1. Command execution through MCP no longer receives reusable write receipts. Repeating an identical check after repair executes it again. External sends and other ordinary writes retain per-work-item deduplication. Command execution still follows the existing mutation/consent policy.
2. Native verification uses the active project root when no narrower execution directory exists. Dispatch, clones, structured-result repair and resumed workers inherit host-owned project scope. Background worker records persist that scope.
3. A routine addressed to a captured local session passes scheduled preflight and uses the existing acknowledged station-delivery bridge. Remote channel targets still require their channel. Native routine inspection exposes actionable errors, and routine.manage can repair local/origin delivery.

## Live backend proof

All scenarios launched `node dev/seed.js --keep` with isolated workspaces, deterministic loopback providers and real production sidecar routes/tools. Provider reasoning quality and paid-provider billing were not evaluated.

| Scenario | Verified result |
| --- | --- |
| Connector retry | 24 assertions: identical failed-check arguments execute again after repair; the model receives CHECK-PASS; duplicate external sends remain suppressed within each run. |
| Project scope | 9 assertions: parent and delegated worker read the selected project's file and execute its npm test. Both emit done; recorded token-cost events are reconciled. |
| Scheduled local delivery | 35 assertions: scheduler fires a session-only origin and persists its delivery acknowledgment; a disconnected remote origin stays blocked. The station-page acknowledgment is simulated through the actual SSE/ack bridge; no UI rendering claim. |
| Worker restart/resume | 14 assertions: kill the seeded sidecar tree with a worker running, restart the same workspace, observe stale status and preserved project root, then resume via team.resume from a session without project scope. The worker finishes against the original project. |
| Native routine repair | 14 assertions: actual scheduled preflight blocks an unavailable channel; routine.list exposes the reason; routine.manage durably switches to detached local output and clears the stale configuration block. |

`seeded-proof.cjs <repository> <scenario>` reproduces these scenarios using the repository's integration drivers. Scenarios: `e2e.idempotency`, `project-root.e2e`, `cron.run-now.e2e`, `project-resume`, `routine-repair`.

Event receipts, restart records, routine repair records, sanitized boot logs, the proof launcher and raw gate logs are preserved in `C:/Users/andro/gen-trees/hermes-reliability-evidence-0905/`. Temporary live-proof server trees were terminated and their workspaces disposed. Expected fixture warnings include synthetic model pricing, missing fixture roster identities, checkpoint initialization, intentionally unavailable channel delivery and intentional cancellation.

This is source/backend lane verification. No installer build, installed-app replacement, remote push or release-readiness claim is included.
