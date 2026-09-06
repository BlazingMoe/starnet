# Quest journal redesign — 2026-09-06

Owner screenshot matches the current source's tiny card grid (11px descriptions,
12.5px titles at baseline 9fa38c05b). Lane: agent/quest-journal-revamp.
Source commits: 1d43b8304 (journal) and 55a30d5d7 (draft preservation).

## Source changes

- Replace the open-card wall with a category-filtered mission index and one briefing.
- Use 30px briefing titles, 20px mission titles and 18px descriptions/actions; elevate
  objective and reward blocks with the station's existing phosphor/gold palette.
- Display the backend's Commander level; keep goal configuration and completed history
  in expandable sections. Preserve category, selection, index scroll and open disclosures.
- Keep evidence drafts attached to their quest, including the unsaved-close guard after
  switching to another mission. Successful evidence recording clears the saved draft.
- Reflow into one column in narrow windows; regenerate the website mirror.

## Live proof

Seeded real sidecar at http://127.0.0.1:8916, launched with `node dev/seed.js --keep`.
No real provider key or paid run used. Work dock opened the new journal.

- DOM: briefing title 30px, description 18px, Commander level 1, zero default OS-painted
  buttons in the quest window. Browser error log empty.
- Station category showed three quests; selecting a different quest updated its briefing.
  Empty Missions category showed an explicit empty state. Keyboard Enter selected a mission.
- Recruitment and Answer It opened the real Recruitment Bay and Commander Dossier.
- Goal settings stayed expanded across category updates.
- At 600×820, the journal used one column and body clientWidth/scrollWidth were both 554px.
  Restoring the viewport retained the selected mission.
- Two temporary attest quests were minted through the real local API. Draft evidence stayed
  with quest one, quest two's editor stayed empty, and closing while reading quest two
  showed the existing UNSAVED warning. Returning to quest one restored its draft. RECORD
  MY RESULT completed it, advanced the briefing to quest two, and permitted a clean close.
  Both temporary quests were dismissed afterward.

## Verification limits / integration blocker

`test/quest-log-window.test.js`: 74 assertions green, including production-renderer
callbacks, escaping, completion fallback, level authority and hidden-draft close guard.
Touched JS passed syntax checks; diff whitespace check passed.
The focused manifest slice passed all 10 suites: journey wiring, quest store/state,
quest-state store, station/work/maintenance quest stores, ledger store, journal UI and
website mirror parity.

The complete `npm run test:fast` gate did not pass. First invocation lacked the worktree's
dependencies (fixed with npm ci). Subsequent attempts encountered process-spawn failure,
`sidecar-fixture.test.js` readiness exceeding 9000ms at step 187/723, and
`loop.parallel-tools.test.js` reporting 164ms for three overlapping 60ms calls at step
116/723. A direct sidecar-fixture retry also exceeded 9000ms. These files were unchanged.
The machine was observed with as little as 10MB free memory during the earlier attempt;
the timing failures are not being relabeled as passing tests.

`npm run qa:journeys`: 121/122 passed. J4/manifest-lists-index-html failed because the
generated deliverable listed README.md but no index.html. This is outside the changed UI.

No merge, installer rebuild, installation, push or publication. The source redesign is
available on its isolated branch; the installed app and owner recovery remain unverified.
