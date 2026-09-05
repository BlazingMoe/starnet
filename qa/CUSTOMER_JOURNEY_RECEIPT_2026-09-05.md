# Customer reliability implementation receipt — 2026-09-05

Implemented the three follow-ups from the historical bug audit: a repeatable customer
journey campaign, required sibling review for reported fixes, and separate engineering,
installer and customer outcomes in the existing durable register.

## Changes

- `qa:customer-journeys` runs 26 suites through the existing isolated sequential runner.
  Both PR/trunk and tagged release workflows execute it after the fast gate.
  Every suite belongs to the mandatory fast or HTTP gate. The new real-sidecar matrix
  exercises five adapters, three execution entries and two boots: 30 journeys. A real
  filesystem tool must return a marker from the correct agent workspace, and a strict
  loopback upstream must accept its second inference before final output can pass.
- Reported-bug source closure now requires provenance, affected build, a failure family,
  before/after regression and four sibling dimensions. Covered scenarios must name real
  tests registered in a gate; gaps require explanations. The PR template and tracked
  `docs/BRAIN.md` orientation make this part of agent work, including internal merges.
- Imported 15 recent customer symptoms: nine source-fixed, six open. Zero are
  installer-verified or customer-confirmed. One has an explicit continued-failure report;
  the other 14 remain unconfirmed. The 36 historical records were not relabeled as a
  complete customer census. Support references are sanitized and mixed issues are split
  by symptom.
- Also repaired a QA defect found while implementing this: the reconciler interpreted a
  related commit mentioned in negative prose as fix evidence. A regression failed before
  and passed after ef5585145. Customer/owner records now require explicit source-fix
  attribution; all six uncorrelated reports remain unverifiable rather than likely-fixed.

## Verified behavior

- Focused campaign: **26/26 suites passed**, including all 30 new local execution journeys.
- Register logic: 97 existing assertions and seven lifecycle scenarios passed. Existing
  reconciler suite: 82 assertions passed. Disk register and generated index: eight assertions
  passed. Source-text integrity: 1,773 tracked JS/MJS files passed.
- Live seeded UI: scheduler off, stale arm state, response lost after durable save, missing
  readback and duplicate creation passed. Ambiguous saves retained the draft and did not
  assert success or loss. After a sidecar restart, exactly one ONCE routine with the expected
  id remained visible in Active Routines. The browser recorded no uncaught exceptions.
- Full fast manifest: **713/713 suites passed**, exit 0, on the implementation containing
  ef5585145. The exact command was `node scripts/timeout.mjs --label test:fast-full
  --timeout=1800000 -- npm run test:fast:raw`: the canonical full manifest with a longer
  outer execution allowance after the default ten-minute wrapper timed out.
- A clean full HTTP gate has **not** passed. Three attempts stopped on timing failures:
  `e2e.acceptance-nudge` startup (step 40), `questrefresh.e2e` startup (step 27), and
  `loops-check.e2e` waiting for a running iteration (step 52). The first two passed in the
  later serial run; the loop-check suite passed its isolated rerun, 33 assertions. These
  reruns do not turn the earlier full-gate failures into a pass.
- All **96 HTTP suites have a passing execution across the segmented runs and isolated
  reruns**: 51 before the loop-check failure, loop-check's isolated pass, the next 23,
  shell's isolated pass, and the final 20. The 44-suite remaining segment hit a shell abort
  timing assertion; its isolated rerun passed all 36 assertions. The final 20-suite segment
  completed with exit 0. This is complete scenario coverage, not a clean uninterrupted gate.
- Integration remains blocked pending a clean required gate. The existing loop and shell
  tests and their assertions were not changed. The CI-wiring change also passed the seven
  lifecycle scenarios and the release documentation, provenance and Chrome-warmup guards.

## Limits and follow-up

These are local harness/DOM proofs using fixture accounts and loopback services. No
production provider, customer account, deployed relay, actual OAuth login, installer,
physical Mac, OS keychain or suspend/resume recovery was verified. Delegation and Telegram
have representative integration coverage; their complete five-adapter cross-product
remains an explicit gap. No customer recovery outcome was inferred from source tests.
Native Anthropic is covered for tool execution, failover and compaction; its complete
entry/restart matrix and additional compatible provider identities remain named gaps.

The six open customer investigations are managed Sonnet HTTP 400, historical ONCE routine
absence, Mac onboarding becoming unreachable, blank viewport after idle, a false zero-credit
warning, and unexplained idle/usage behavior. See `qa/BUGS.md` for each record and the evidence
needed; related repairs are not a reason to close them.

Local logs are under this lane's `.tmp/reliability-*.log` (not committed). Early full-gate
attempts encountered a missing locked dependency in the fresh worktree, then a ten-minute
fast-gate timeout and legacy sidecar boot timeouts under severe host memory pressure.
Dependencies were installed with `npm ci`. Assertions were not weakened.

## Integration disposition

Implementation commits are on `agent/bug-pattern-audit-0905`, based on integration commit
010a6b50f. They are not merged or pushed. The repository merge protocol requires a clean
gate before integration; related successful reruns are supporting evidence, not a substitute
for that result. Host memory fell below 100 MB free during the attempts, but this does not
establish memory pressure as the sole cause of the loop timing failure.

Next integration check: run the unchanged full fast and HTTP gates with adequate host
resources. If the loop pause/resume stall repeats, capture the running iteration's outstanding
tool/check and workspace lease before fixture cleanup; do not increase the assertion deadline
or call it fixed merely because another isolated run passes. Installer and reporter retests
remain separate follow-ups in the 15 customer records.
