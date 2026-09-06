---
fingerprint: a55c0020
slug: session-recommendations-ignore-user-goals-and-ac
title: Session recommendations ignore user goals and actual work
surface: sessions
severity: P2
status: open
found: 2026-09-06
lane: agent/useful-starters-0906
fix:
origin: owner
report: Owner follow-up in session, 2026-09-06
affected: Source 33d995fed; installed build unspecified
family: session-starters
installer: unverified
recovery: unconfirmed
---

# Session recommendations ignore user goals and actual work

## Symptom

The empty session offers basic planning/comparison/drafting presets or recency shortcuts instead of consequential work informed by the user's goals and requests.

## Repro

1. Complete or discuss a specific project with NOVA, then open a new session.
2. The old selector chooses by activity timestamps or falls back to the same three basic templates; the substance of the conversation never influences the suggestion.

## Evidence

Owner correction on 2026-09-06. Baseline frontend/app/starters.js exports `pick` using recent timestamps and generic defaults. Regression anchors: test/starters.test.js and test/starterstore.test.js. Current source, live checks and limits: docs/PERSONALIZED_SESSIONS_2026-09-06.md.

## Verdict

Implementation in progress in agent/useful-starters-0906. No installed recovery claim.
