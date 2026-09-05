---
fingerprint: eaaa3ec8
slug: mac-onboarding-unreachable-after-link
title: Mac paid onboarding becomes unreachable after reload and relink
surface: onboarding
severity: P1
status: open
found: 2026-08-22
lane: reliability-followup
fix:
origin: customer
report: https://github.com/androoAGI/starnet/issues/2
affected: Reported Mac installation; exact failing artifact unverified
family: recovery-truth
installer: unverified
recovery: unconfirmed
---

# Mac paid onboarding becomes unreachable after reload and relink

## Symptom

Paid onboarding enters reload/unlink recovery and leaves the station unreachable.

## Repro

Customer path: complete linking on Mac, reload, then follow unlink/relink recovery. Exact local hardware reproduction remains unavailable.

## Evidence

docs/EMAIL_BUG_FOLLOWUP_2026-09-04.md; test/station-recovery.e2e.test.js

## Verdict

Keep open in engineering intake despite upstream issue closure. Related station-recovery fixes and tag ancestry do not prove this customer path. Requires physical Mac, exact installer and link-state receipts.

## Regression

Exact before/after customer reproduction is pending; see Repro and Verdict.

## Sibling coverage

{
  "adapters": [
    {"target":"exact affected provider or renderer","state":"blocked","reason":"The customer failure has not been reproduced on the affected configuration; baseline tests are corroboration only."}
  ],
  "entrypoints": [
    {"target":"reported user path","state":"blocked","reason":"Customer path: complete linking on Mac, reload, then follow unlink/relink recovery. Exact local hardware reproduction remains unavailable."}
  ],
  "displays": [
    {"target":"reported error and recovery UI","state":"blocked","reason":"Capture the actual failure and follow the offered recovery; a connected label or nearby passing test is insufficient."}
  ],
  "lifecycle": [
    {"target":"recovery and restart","state":"blocked","reason":"Requires a before/after receipt for this symptom on the affected artifact, followed by restart and the same operation."}
  ]
}
