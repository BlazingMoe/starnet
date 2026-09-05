---
fingerprint: fd9c4b4d
slug: managed-sonnet-400-unresolved
title: Managed Sonnet request still returns an uncorrelated HTTP 400
surface: providers
severity: P1
status: open
found: 2026-09-05
lane: reliability-followup
fix:
origin: customer
report: https://github.com/androoAGI/starnet/issues/6#issuecomment-5548215321
affected: v0.10.13; managed anthropic/claude-sonnet-5
family: production-request-truth
installer: unverified
recovery: persists
recoveryEvidence: GitHub issue 6 comment 5548215321 on 2026-09-05 reports the error on v0.10.13.
---

# Managed Sonnet request still returns an uncorrelated HTTP 400

## Symptom

Latest follow-up still reports managed Sonnet HTTP 400 and a missing-key warning.

## Repro

Customer reproduction: select managed anthropic/claude-sonnet-5 on v0.10.13 and run. Local exact reproduction is not established; obtain a fresh sanitized request correlation and error body.

## Evidence

docs/EMAIL_BUG_FOLLOWUP_2026-09-04.md; test/provider.openai-compatible.test.js

## Verdict

Keep open. BYOK admission, model identity and malformed-history fixes are related hypotheses, not proof of the production cause. Requires deployed-route trace and exact affected artifact reproduction.

## Regression

Exact before/after customer reproduction is pending; see Repro and Verdict.

2026-09-05 follow-through re-read issue #6: its latest diagnostics still name managed
`anthropic/claude-sonnet-5`, v0.10.13, with the last failure at `2026-09-05T00:47:28.242Z`.
The local 26-suite customer campaign passes, but uses simulated upstream services. This host's
`flyctl auth whoami` reports no access token, so no deployed-route correlation was obtained.
See `qa/digests/2026-09-05-release-blockers.md`; production cause/recovery remain unverified.

## Sibling coverage

{
  "adapters": [
    {"target":"exact affected provider or renderer","state":"blocked","reason":"The customer failure has not been reproduced on the affected configuration; baseline tests are corroboration only."}
  ],
  "entrypoints": [
    {"target":"reported user path","state":"blocked","reason":"Customer reproduction: select managed anthropic/claude-sonnet-5 on v0.10.13 and run. Local exact reproduction is not established; obtain a fresh sanitized request correlation and error body."}
  ],
  "displays": [
    {"target":"reported error and recovery UI","state":"blocked","reason":"Capture the actual failure and follow the offered recovery; a connected label or nearby passing test is insufficient."}
  ],
  "lifecycle": [
    {"target":"recovery and restart","state":"blocked","reason":"Requires a before/after receipt for this symptom on the affected artifact, followed by restart and the same operation."}
  ]
}
