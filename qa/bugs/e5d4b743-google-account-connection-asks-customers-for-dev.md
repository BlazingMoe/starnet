---
fingerprint: e5d4b743
slug: google-account-connection-asks-customers-for-dev
title: Google account connection asks customers for developer credentials
surface: onboarding
severity: P1
status: open
found: 2026-09-06
lane: agent/google-account-signin
fix:
origin: owner
report: Owner report in local task on 2026-09-06; Google catalog screenshot and request for account-only sign-in
affected: Local demo 0.10.13; public installer unverified
family: google-sign-in
installer: unverified
recovery: unconfirmed
---

# Google account connection asks customers for developer credentials

## Symptom

Google service cards ask the customer to configure a Google Cloud project and paste client credentials instead of signing into their account.

## Repro

1. Open ABILITIES → CATALOG on a fresh local build without Google publisher configuration.
2. Find Gmail or Google Docs.
3. The original SET UP action reveals client ID/client secret fields.

## Evidence

Owner screenshot and live local DOM at 127.0.0.1:8791 showed Gmail → SET UP. Before repair, `frontend/app/windows/connectors.js` rendered `data-cc-oclientid` and `data-cc-oclientsecret`. Regression coverage: `test/google-connector.test.js`.

## Verdict

Implementation in progress. Public Google registration and actual installer sign-in remain unverified; do not close on mocked-provider proof alone.

## Regression



## Sibling coverage


