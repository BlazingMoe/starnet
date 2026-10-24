# Moe AI Station Verification Standard

This derivative does not treat “code exists” as “feature complete”. Every substantial feature must pass two independent verification layers before it may be called complete.

## Layer A — implementation verification
A feature must have:
1. a real production/runtime entrypoint,
2. explicit security/capability boundaries,
3. bounded failure behavior (timeouts/retries/limits where applicable),
4. persistence/migration behavior when state is involved,
5. focused unit or contract tests.

## Layer B — integration verification
A feature must also have:
1. a wiring/integration test proving the production entrypoint actually reaches the implementation,
2. inherited regression coverage for the subsystem it extends,
3. security-boundary regression coverage for consequential actions,
4. CI evidence on the derivative branch,
5. an entry in `qa/moe-feature-evidence.json` naming code, tests, integration evidence and current status.

## Status vocabulary
- `planned`: design intent only; no implementation claim.
- `partial`: some code exists but one or more verification dimensions are missing.
- `implemented`: production code exists and focused tests pass, but integration/release evidence is not yet complete.
- `verified`: both verification layers pass in CI and evidence is recorded.
- `blocked`: implementation exists or is planned, but a known dependency or release blocker prevents a truthful completeness claim.

## Rules
- Never mark a feature `verified` from documentation, UI text, a mock, or a unit test alone.
- Never disable a failing inherited safety/security test merely to make CI green; adapt the derivative contract or fix the regression.
- Fork-specific differences must be explicit rather than hidden behind upstream assumptions.
- Reviewer/auditor results do not supersede host-side deterministic checks.
- Tool/capability permissions remain authoritative even when organizational hierarchy permits delegation.
- Any self-improving or self-editing mechanism must be inspectable, versioned, testable and reversible.
- Release claims must be evidence-backed. Branding, signing, update delivery, migration and installer claims remain blocked until their dedicated verification exists.

## Minimum release bar
A public release candidate requires:
- derivative CI green,
- inherited fast gate green or every remaining failure explicitly classified as an upstream-only invariant with a derivative replacement gate,
- no upstream update/signing dependency,
- derivative branding/artwork replacement complete,
- data-path migration tested,
- installer/update signing established,
- security and permission regression suite green,
- feature evidence ledger contains no `verified` claim without complete evidence.
