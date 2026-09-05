---
fingerprint: 72af29f4
slug: funded-station-false-zero-warning
title: Funded working station still displays a zero-credit warning
surface: providers
severity: P1
status: open
found: 2026-08-24
lane: reliability-followup
fix:
origin: customer
report: support-2026-08-24-funded-station-false-zero-warning
affected: Exact affected build/platform not recorded in sanitized evidence
family: recovery-truth
installer: unverified
recovery: unconfirmed
---

# Funded working station still displays a zero-credit warning

## Symptom

The station works but a zero-credit warning contradicts the funded account.

## Repro

On the reported linked station compare current authoritative balance, selected execution provider and banner after refresh/restart.

## Evidence

docs/EMAIL_BUG_FOLLOWUP_2026-09-04.md; test/credits-link.test.js

## Verdict

Keep open pending authoritative balance/banner reproduction or customer retest. Matching fixes in v0.10.13 are not proof of the same cause.

## Regression

Exact before/after customer reproduction is pending; see Repro and Verdict.

## Sibling coverage

{
  "adapters": [
    {"target":"exact affected provider or renderer","state":"blocked","reason":"The customer failure has not been reproduced on the affected configuration; baseline tests are corroboration only."}
  ],
  "entrypoints": [
    {"target":"reported user path","state":"blocked","reason":"On the reported linked station compare current authoritative balance, selected execution provider and banner after refresh/restart."}
  ],
  "displays": [
    {"target":"reported error and recovery UI","state":"blocked","reason":"Capture the actual failure and follow the offered recovery; a connected label or nearby passing test is insufficient."}
  ],
  "lifecycle": [
    {"target":"recovery and restart","state":"blocked","reason":"Requires a before/after receipt for this symptom on the affected artifact, followed by restart and the same operation."}
  ]
}
