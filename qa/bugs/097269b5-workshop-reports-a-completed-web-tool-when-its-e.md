---
fingerprint: 097269b5
slug: workshop-reports-a-completed-web-tool-when-its-e
title: Workshop reports a completed web tool when its entry file is missing
surface: sessions
severity: P1
status: open
found: 2026-09-06
lane: agent/release-ui-audit-0906
fix:
origin: audit
---

# Workshop reports a completed web tool when its entry file is missing

## Symptom

A queued web-tool build can report `reason: built` and retain the title and instructions
for a runnable HTML tool even when `index.html` was never written. The library then has
only a README. This is an existing validator defect exposed during the September 6
merge audit, not a confirmed regression introduced by the latest visual changes.

## Repro

1. Run the seeded real-sidecar journey suite (`npm run qa:journeys`). J4 queues a web
   tool and writes `index.html`, `README.md`, then `deliverable.json` through `fs.write`.
2. Interrupt or delay the HTML write beyond the tool's ten-second deadline while
   allowing the README and manifest writes to complete. The manifest lists both files.
3. Read `workshop.shift.result`: it still reports `reason: built`, with only README in
   its normalized manifest. J4's `manifest-lists-index-html` assertion fails.

The timing trigger was observed under shared-host load and is intermittent. The
deterministic validator condition is a manifest listing one present and one missing
file: the missing member is discarded instead of rejecting the incomplete build.

## Evidence

Audited trunk: `d107e5ef2`. Live full-suite log in the isolated audit worktree:
`.bugloops/release-ui-audit-0906/release-audit-journeys.log`, with these consecutive assertions:

    PASS J4/deliverable-built — fired=true reason=built runId=a258114f-000a-4f8d-9bb6-f05286acbe0a
    FAIL J4/manifest-lists-index-html — manifest files: [{"path":"README.md","bytes":33}]
    JOURNEYS FAIL (exit 3) — 121/122 assertions passed

The isolated J4 repeat passed its HTML check but lost README instead. Its retained
`runs.jsonl` records `h2 fs_write isError:true summary:timeout ms:10368`; only the HTML
and manifest exist. That illustrates why the passing focused receipt does not close
the bug. No installed-desktop proof was performed.

Source anchor: `sidecar/index.js:12200`, `validateWorkshopManifest`. Each missing or
rejected member uses `continue`; only an entirely empty `provenFiles` array fails.
The title, summary and how-to text remain those of the complete claimed artifact.
`git blame` attributes this filtering to `f576c99c37` (July 3), predating this UI batch.
Current automated detection: `scripts/qa/journeys.mjs` J4 checks index.html, but does
not require every declared file to have been written successfully.

## Verdict

Open. A partial file inventory proves those files exist; it does not prove the claimed
deliverable is complete. Repair should distinguish incomplete builds from completed
ones, preserve recoverable files, and add deterministic missing-entrypoint and missing
support-file coverage to the workshop HTTP tests.
