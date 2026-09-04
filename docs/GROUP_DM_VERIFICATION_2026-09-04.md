# Group DM local build verification

Implemented in `agent/group-dm-plan-0904`, isolated from the integration tree.
Local preview: http://127.0.0.1:9137, launched with `node dev/seed.js --keep`.
The scratch workspace and browser profile are isolated from production data.

## Shipped behavior

Create a group from chosen roster agents, or add agents to an existing direct session.
The group has one persistent transcript, explicit authors, a default responder,
targeted mentions/replies, and backend-owned turn scheduling. Agent handoffs can
return to an earlier participant, with a configurable turn limit and explicit continuation.
Actual run states, approvals, stops, errors, context cutoffs, and measured usage are shown.

Shared files are immutable versions with hashes, authenticated previews/downloads,
and exact-version reads for other participants. Other controls include independent
answers, lead comparison, session instructions, saved groups, branches, catch-up,
membership changes, interruption, retries, pause/resume, and durable restart recovery.
Station emergency stop includes group runs and queues. Direct chats remain available.

## Live browser proof

Tested with real provider responses using `anthropic/claude-haiku-4.5` on NOVA,
RESEARCHER, and ENGINEER. Group `e2375442-a340-4e1f-a2bc-d46cb2d2c93e`
is preserved as **Group DM live test** in the local preview.

The engineer created a deliberately incorrect arithmetic file, published it, and
handed review to the researcher. The researcher read the exact snapshot and requested
a correction. The engineer published a new version, then the researcher verified it.
All four turns completed through the normal execution host:

| Participant | Run ID |
| --- | --- |
| Engineer | `b56cc181-5d6e-4e28-b6cc-86648cc0486a` |
| Researcher | `69a7359d-270a-4c9c-ba5b-8f5f54921762` |
| Engineer | `fb1de573-a4ca-4288-8f4c-17b4946f0bf7` |
| Researcher | `8eda6669-8f5a-471c-aed6-27df115037e6` |

Original SHA256: `8afe257cabbac3c2d162cf9657ea284d23e0fdf4daa2c6d5ee28cace2ff8c276`.
Corrected SHA256: `cae91dcf656fede4262dba5815c12c695b52dea8e86889b904619fad0a9bf142`.
Opened the corrected version through the UI and observed the exact bytes:

```text
GROUP_DM_PROOF
2 + 2 = 4
```

Also verified in the browser:

- Three independent answers used the same context cutoff (#6).
- Removed and re-added the researcher without losing history or starting a run.
- Direct reply selected the original author.
- Paused the group and queued a request; interrupt-and-send stopped that request
  and ran only the replacement. The completed reply was `NEW_INSTRUCTION_CONFIRMED`.
- Restarted the sidecar and reloaded: transcript, roster, files, and outcomes survived.
- Saved instructions and changed the turn limit; created a reusable group and verified
  a new session had the selected agents/instructions and an empty transcript.
- Branched the discussion with copied context and no copied runs; deleted that disposable branch.
- Renamed the fresh session **Try your group chat**.
- Converted an existing direct session by adding the researcher.
- Browser console returned no warnings/errors during final interaction checks.

The eight completed proof-group turns total $0.2944169 measured usage; the stopped
queued request has no run ID. The UI rounds this to $0.2944.

## Automated verification

Focused coordinator tests cover routing, idempotency, revision conflicts, bounded
handoffs, exact artifacts, independent context, cancellation, approval ownership,
agent leases, emergency stop, branching, deletion, and restart behavior.
The HTTP integration test boots the actual sidecar and execution host with a mock
provider, writes/publishes/reviews a real file, and checks durable recovery.

- `npm run test:fast`: **702 steps green**, exit 0.
- Focused `node test/group-sessions.test.js`: PASS.
- Focused `node test/group-sessions.http.test.js`: PASS; also passed within the full HTTP run.
- Syntax checks, deterministic/emits lint, website mirror checks, and fail-open ratchet: PASS.
- The standard `npm run test:http` wrapper reached its 600,000 ms limit after
  `routing.sample.e2e.test` passed (89/90 steps), while the last step was running.
  No preceding assertion failed. Reran the exact unchanged full HTTP list through
  `npm run test:http:raw` with a 900,000 ms outer watchdog: **90 steps green**, exit 0,
  including `route-honesty.e2e: OK (66 assertions)`. No assertions or test steps were
  removed or relaxed. Logs: `dev/group-fast-final.log` and `dev/group-http-complete.log`.

## Simplified session UI follow-up

User feedback: the initial group controls were confusing. Replaced the separate
GROUP CHAT / ADD AGENTS / PARTICIPANTS entry points with one **+ Add agents**
button in the session header. The header shows the count and every selected name.
The picker opens directly to searchable agent checkboxes and **Done**; session
naming, default responder, and saved groups are optional collapsed settings.
The main group view contains the transcript and one send button. Workflow controls,
instructions, and historical run/cost details are under **Chat options**. Active
work and approvals remain visible; shared files appear when present.

Verified in the live browser: new direct session -> Add agents -> search/select ->
Done converts that same session; the header shows three names and "3 agents".
Removing an agent changes the count to two; adding it back restores three.
Reload preserves the roster. Workstream tests: 193 assertions passed; website mirror
check: 8 assertions passed. No backend execution behavior changed in this follow-up.
The follow-up fast suite passed all 702 steps (`dev/group-simple-fast.log`).
Keyboard focus was also verified to skip collapsed settings and loop within the picker.

## StarNet styling and alignment follow-up

Replaced generic pill/box styling with the existing phosphor, panel, text, border,
and raised-control tokens. Message markup now reuses COMMS `.cmsg`, `.who`, and
`.body` styling. The composer is a compact inline prompt/input/send row. The roster
header uses a stable grid, with names in a horizontally scrollable line. The picker
has a phosphor title bar, aligned search/selection rows, and a right-aligned footer.

Found the narrow-window bug: at a 591 x 912 viewport, COMMS is 200 px tall but the
old transcript minimum height pushed the composer below its bottom edge. Replaced
that minimum and whole-panel scrolling with a shrinking transcript and fixed composer.
Live DOM measurements after the change: COMMS bottom 836 px, composer bottom 809 px,
group scroll height equals client height. The same held with the 12-message proof
conversation. Picker is centered at x=85.5, width=420, height=355.47; its search and
agent rows share x=98.5 and width=394. Theme-control scan found no native white paint.
Browser warning/error log was empty. Focused control-floor tests passed 101 assertions
and workstream tests passed 193 assertions.
The full styling follow-up fast suite passed all 702 steps (`dev/group-theme-fast.log`).

## Scope of the evidence

This is local feature verification, not an installed-desktop or public-release claim.
Dispatch is sequential within a group; independent answers share a context snapshot.
Files are limited to 1 MiB per version. Context has explicit bounded-history cutoffs.
External channels, scheduling, and parallel dispatch remain separate future work.
