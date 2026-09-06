# StarNet 0.11.0 preparation

Owner requested the official update preparation on 2026-09-06 and explicitly waived the
48-hour release-candidate soak. This waiver applies to duration only; it is not a READY
receipt, an assertion of bug-free operation, or a substitute for installed-artifact proof.

Release lane: `agent/release-0110`, starting from merged trunk `90c5597bb`.
Preparation code, bug record and reviewed visual baselines integrated by fast-forward to
`56a4f3f1c` on 2026-09-06. Existing integration `docs/NEXT.md`, `qa/STATUS.md` and Rooms
handoff edits were preserved byte-for-byte. Post-merge validation is recorded below.
The five version pins remain 0.10.13 because preflight is NOT READY. No v0.11.0 tag,
installer, public release, or updater feed has been created by this preparation.

## Release blockers

The opening preflight found nine P1 records. Workshop's incomplete-file completion claim
was reproduced and repaired at `44a8c3006`; the remaining reports require the evidence below.
Do not close a customer report based only on a related merged fix or a passing mock test.

| Record | Remaining evidence |
| --- | --- |
| `acb47320` idle usage | Affected run ledger, provider/model, armed work and expected cadence |
| `c2a6c3c8` missing ONCE routine | Affected job ID and sanitized create/list/restart diagnostics |
| `e5d4b743` Google sign-in | StarNet-owned Google Desktop OAuth registration, approval, real consent and installed acceptance |
| `eaaa3ec8` Mac paid onboarding | Exact signed Apple Silicon installer, link/unlink/relink and keychain/restart proof |
| `72af29f4` funded station zero warning | Affected account's authoritative balance compared with banner after refresh/restart |
| `fd9c4b4d` managed Sonnet HTTP 400 | Fresh sanitized correlation and deployed-route trace for the affected installed request |
| `8a553481` Mac microphone | Signed Mac allow/deny/reset/restart and real Speak/Hands-Free capture |
| `9256a771` blank viewport | Affected installer/GPU/display reproduction and 20-minute diagnostic capture |

Fresh Guardian, full journeys, Beginner Run, and candidate-bound installed smoke are
also required by `qa:ready`. Local checks are recorded below as they finish. A detector
that skips because another Guardian is active does not count as a green cycle.

The integration checkout's machine-local QA ledger separately retains three older P1
findings: `f373c745` (ABILITIES layout settlement timeout), `8f99d28c` (journey station-level
read was null) and `c30a3a14` (audit station-level read was null). Current repeated capture
and journey checks pass; this alone does not prove the original intermittent causes were
repaired. They remain open. The fresh release worktree has a separate empty finding
directory, so its zero ledger count must not be presented as the integration ledger's count.

The live repository-secret inventory on 2026-09-06 also confirms that
`STARNET_GOOGLE_DESKTOP_CLIENT_JSON` is absent. The official release train invokes
`scripts/stage-google-client.mjs` without `--optional`, so the build would stop on that
missing publisher registration. Updater key, release token and Azure signing secret
names are present; only names/presence were inspected, never secret values. Repository
presence does not prove Google approval or actual signing success.

Issue #6's newest comment is still `5548215321`, dated 2026-09-05; no newer customer
recovery comment was found. `flyctl auth whoami` still reports no access token on this
host, so a deployed relay trace could not be obtained.

## Evidence from this preparation

- Opening `release:preflight -- --version 0.11.0 --allow-lane`: NOT READY. Pins, claims,
  website mirror, version availability, and updater signing-key presence passed.
- Workshop real-sidecar reproduction: seven failing assertions before the repair;
  86 passing assertions afterward, including missing entry/support files, preserved
  partial files, no false durable built event, failed-library state, and restart.
- Full browser journeys on source `5f66ccb47`: 130/130 PASS.
- Full browser journeys repeated on integrated candidate `56a4f3f1c`: 130/130 PASS.
- Customer regression campaign: 29/29 suites PASS (simulated providers).
- Fresh Beginner Run: PASS, six stages, 123815 ms, UI-only model boundary.
- 3,000-session long-haul performance: all configured budgets passed, zero violations.
- T2 update-state safety: 4/4 PASS.
- Public updater host: all configured platform URLs reachable and pinned to 0.10.13.
- Fast gate: `run-fast-tests: OK — 726 step(s) green`.
- Visual comparison: ten frames differed from the pre-merge baseline. Inspected all ten
  retained PNGs against the merged changes (station, recruitment, recipes, journal,
  commander, automation, build intro, manual, updates, notifications); updated only their
  signatures. A second full capture passed all 16 frames at the unchanged 1.5 threshold.
- Short source stability: PASS over 6.01 minutes, 18 successful runs / zero failures,
  five scheduled fires, two restarts without lost entities, zero unexpected exits,
  zero orphan processes and zero swallowed errors. Health latency p95 was 17 ms;
  restart boot times were 733 ms and 567 ms. This uses a mock provider and one routine.
- HTTP gate: `run-test-list: OK — 101 step(s) green`.
- Post-merge trunk gates on `56a4f3f1c`: fast 726/726 and HTTP 101/101, both exit 0.
- Full Guardian cycle on integrated candidate `56a4f3f1c`: GREEN at
  2026-09-06T18:35:27Z. All seven gates ran and passed: fast, HTTP, adversarial API,
  screenshots, golden comparison, truthfulness audit, and journeys. No skipped gates.
- Beginner Run repeated on the exact integrated candidate: PASS, six UI-only stages,
  125231 ms. Exact candidate Guardian, journey and Beginner receipts were copied unchanged
  into integration; the dashboard retains its real three open Guardian findings.

Final `qa:ready`, run from the integration checkout on `56a4f3f1c`:

    NOT READY — 3 reasons
    1. Ledger open P0/P1: 3 open blocking findings (0 P0 · 3 P1)
    2. Bug register open P0/P1: 8 open blocking bugs (0 P0 · 8 P1)
    3. Installed-exe smoke: tested binary source does not equal current trunk

The installed receipt describes an older 0.10.13 executable, not this candidate.
No new installer was produced: the runbook forbids bump/tag while NOT READY, and the
official build additionally lacks its required Google publisher registration.
The owner's 48-hour waiver has been recorded; no other requirement was waived.
The authoritative full final receipt is `readiness-integration-final.log` in this worktree.

Machine-local logs live in the release worktree: `workshop-before.log`,
`workshop-after.log`, `gate-fast.log`, `gate-http.log`, `journeys-release.log`,
`customer-release.log`, `beginner-release.log`, `performance-release.log`,
`state-safety-release.log`, `update-host-release.log`, `golden-release.log`, and
`stability-release.log`. These source checks do not establish installed Windows/Mac
behavior, real-account recovery, or the absence of every possible defect.

## Proposed user-facing notes (not yet published)

StarNet 0.11.0 brings a refreshed station and a clearer way to work with your crew.

- Refined station materials, room lighting, wall and doorway depth, and space backdrops.
- Updated dock menus, recruitment gallery, quest journal, and compact connected-app widgets.
- Multi-agent conversations, a more responsive Add agents picker, and clearer task-context questions.
- Session suggestions grounded in your work and goals, with more relevant starter prompts.
- Individual spoken voices for agents, plus a macOS microphone packaging correction.
- More reliable paid-account recovery, persisted appearance backups, signed-in browser reuse,
  and clearer diagnostics when the sidecar or a provider fails.
- Workshop rejects incomplete deliverables instead of presenting missing-file builds as complete.

Qualify or remove any item whose installed acceptance is not established before the final
notes are placed in `RELEASE_NOTES.md`. Do not promise Google account sign-in until the
publisher registration and real consent path are active. Record the owner's 48-hour soak
waiver alongside the final release notes.

## Resume the release train

1. Resolve the blocking evidence and obtain `npm run qa:ready` → READY.
2. Run `release:ritual -- --version 0.11.0 --allow-lane`, finish real release notes, and
   re-lock the reviewed surface. Earn the full fast/HTTP receipts after the version bump.
3. Integrate through the merge ritual and tag the verified trunk commit. The ordered ritual
   never pushes by itself. Confirm the two offline updater-key copies before the tag push.
4. Stage the signed Windows/Apple Silicon/Intel Mac draft through the release train.
5. Prove the exact installed candidate, hosted T0 clean install, G1 packaged lifecycle,
   signed manifest coherence, Mac acceptance, and update preservation/canary behavior.
6. Review the concrete draft and publish only through the owner-authorized release step.
