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
- Final validation exposed a second defect: an already-cancelled edit could start a new
  language server after idle cleanup. A deterministic cold-server reproduction failed
  before 547dd03d7 and passes afterward. Cancellation is now checked before acquiring a
  client or spawning its process. The register contains 53 records, including these two
  audit-found repairs; the six customer investigations remain open.

## Verified behavior

- Focused campaign: **26/26 suites passed**, including all 30 new local execution journeys.
- Register logic: 97 existing assertions and seven lifecycle scenarios passed. Existing
  reconciler suite: 82 assertions passed. Disk register and generated index: eight assertions
  passed. Source-text integrity: 1,773 tracked JS/MJS files passed.
- Live seeded UI: scheduler off, stale arm state, response lost after durable save, missing
  readback and duplicate creation passed. Ambiguous saves retained the draft and did not
  assert success or loss. After a sidecar restart, exactly one ONCE routine with the expected
  id remained visible in Active Routines. The browser recorded no uncaught exceptions.
- On source 215706749, synchronized with trunk 76b7c042e, standard `npm run test:fast`
  passed **717/717 suites** and standard `npm run test:http` passed **97/97 suites**.
  Both completed uninterrupted with exit 0 and unchanged command deadlines. Logs:
  `.tmp/reliability-fast-final.log` and `.tmp/reliability-http-final-combined.log`.
- Before that synchronization, clean full HTTP runs passed 96/96 and 97/97 respectively;
  the former integration blocker is resolved. Earlier startup, loop and shell timing
  failures remain historical failed attempts, not silently relabeled passes. One further
  attempt crashed allocating 4 KB of WebAssembly code memory on the resource-constrained
  host. No loop/shell assertions or fixture deadlines were weakened.
- Live UI proof was repeated after the platform/UI integrations. The compact starter
  station requires the proof to fall back from the 17-tile research line to the smaller
  complete front-desk line. All save/readback/duplicate/restart assertions remain intact.
  `.tmp/reliability-live-combined.log` records all five scenarios and the matching ONCE id
  after restart. The LSP repair separately passed 31 real-stdio assertions, preserving
  idle cleanup and proving no replacement client/process or file mutation on cancellation.

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

Implementation commits are on `agent/bug-pattern-audit-0905`, synchronized with integration
commit 76b7c042e. The full gates and live proof have passed. The branch is awaiting release
of the Hermes/platform integration serialization window, then synchronization and required
combined verification before its own merge. Nothing from this lane has been pushed or
released. Installer and reporter retests remain separate follow-ups in the 15 customer records.
