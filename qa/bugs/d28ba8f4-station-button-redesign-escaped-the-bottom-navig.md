---
fingerprint: d28ba8f4
slug: station-button-redesign-escaped-the-bottom-navig
title: Station button redesign escaped the bottom navigation
surface: channels
severity: P2
status: open
found: 2026-09-06
lane: agent/comms-controls-0906
fix:
origin: owner
report: Owner conversation on 2026-09-06 requests reverting all styling from this task except the Crew, Work, Build and System dock
affected: Source redesign merged in 2084b8d00, partially restored in ec6960085; installed build unknown
family: dock-style-scope
installer: unverified
recovery: unconfirmed
---

# Station button redesign escaped the bottom navigation

## Symptom

The owner dislikes the changed buttons in Channels and elsewhere and wants only the bottom navigation redesign retained.

## Repro

Open BUILD → CHANNELS, Settings, COMMS, and the navigation hint. Hover their buttons, then compare the rest and hover styles with source before the redesign, 3d31e373e. The partial restoration left shared hover cards, navigation coaching and COMMS starters styled by this task outside the approved dock.

## Evidence

The original task changed frontend/css/app.css, comms.css and interface.css plus the navigation-hint HTML. At 61d2ba4de, `#screen-game :is(#bottombar .bb-menu .bb, .cmsg-starter, .nav-coach-x)` still applied the new finish beyond the dock, while `.station-tip` and `body > .hint-bubble` received it globally. The regression anchor is test/station-tooltip.test.js, which now exercises reuse of the same hover card from a dock control to a non-dock control.

## Regression

Verification in progress: compare actual computed styles with the pre-task source for Channels, Settings, COMMS controls and non-dock tooltips; compare all four dock menus and their hover cards with the owner's approved source in six themes. Preserve later independently authored session-starter content/layout and quest-journal work. E-STOP remains removed per the owner's earlier request.

## Sibling coverage

{"adapters":[{"target":"frontend and website mirror","state":"covered","test":"test/website-app-sync.test.js","scenario":"mirrored frontend parity","gate":"fast"}],"entrypoints":[{"target":"shared tooltip focus and pointer events","state":"covered","test":"test/station-tooltip.test.js","scenario":"dock-to-nondock card reuse clears the dock finish","gate":"fast"},{"target":"glossary hover/tap entrypoints","state":"blocked","reason":"Live Hint.show anchor transitions are checked; no registered isolated glossary test exists"}],"displays":[{"target":"Channels, Settings, COMMS and four dock menus in six themes","state":"blocked","reason":"Live computed-style comparison is recorded in the lane digest; it is not a registered fast/http scenario"},{"target":"installed desktop","state":"blocked","reason":"No installer rebuilt or customer retest available"}],"lifecycle":[{"target":"tooltip delayed show, cancellation and reuse","state":"covered","test":"test/station-tooltip.test.js","scenario":"pending hover cancellation and changing the active anchor","gate":"fast"}]}

## Verdict

Awaiting final source and live verification. Installer and owner recovery remain unverified.
