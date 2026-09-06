# Widget library refresh

Owner request: update the outdated widget system.

Done means opening the live widget library, finding and pinning an instrument, moving and
reordering it, and recovering the same layout after reload and sidecar restart. Feed readings
must preserve attribution, report outages, and show no signal when their source is removed.
The full fast gate must pass.

## Changes

- Searchable library with All, Station, Agent feeds, and Pinned filters, live previews,
  source descriptions, and explicit Top / Bottom / Hide controls.
- Eight built-in instruments: existing runs, queue, routines, and tokens plus crew count,
  confirmed active COMMS conversations, COMMS approval requests, and next scheduled routine.
- Reorder buttons, Alt + arrow movement, Enter to manage, focus restoration, Escape,
  keyboard focus containment, responsive scrolling, and themed controls.
- Existing v1 layout storage and feed pins retained. Missing feed pins stay manageable.
- Current roster name resolution, absent-progress handling, feed offline state, bounded and
  deduplicated HTTP polling, and drag cancellation / UI zoom handling.
- Generated website app mirror synchronized. No backend or shared-contract changes.

## Live evidence

Isolated seeded application at `http://127.0.0.1:9186`, launched with `node dev/seed.js --keep`.

- Added CREW to top, moved it to bottom beside ACTIVE COMMS, and moved it earlier.
  Reload restored bottom order `crew, active`. Alt + ArrowUp then moved CREW to top.
- Search returned the matching instrument; a nonexistent search returned an explicit
  empty result. Clearing the search restored the catalog. Agent feeds had a useful empty state.
- Escape closed the library and restored focus to its entry button. Enter on APPROVALS
  reopened it. Placement controls remained in the library after each edit.
- At 1280 x 720 the library bounds were x=255.4, y=59, w=540, h=653, with internal scrolling.
  At 600 x 700 the bottom-rail library stayed within x=52..592 and y=8..658.75.
  The library's controls had zero white/native background matches. No browser warnings or
  errors were recorded during normal interaction before intentional outage testing.
- A disposable feed was published through the production `widget.set` tool and durable
  store in this worktree's scratch station, then loaded after restart. The live rail read
  `RESEARCH DIGEST / NOVA / 12 sources`; its real four-point spark rendered, with no false
  zero-progress bar. This was a labelled verification fixture, not a real research result.
- Stopping only this worktree's sidecar retained `12 sources`, added `offline` beside NOVA's
  age stamp, and set `data-stale=1`. The tool then cleared the test record while stopped.
  Restart retained the layout and showed the absent feed as `no signal`. Pinned filtering
  still exposed its Hide control. The temporary feed and pin were removed.
- The next routine preview showed `disarmed` for the real disabled scheduler.

## Validation

- JS syntax checks and `git diff --check` passed.
- Widget folds: 66 assertions; widget feed tool: 43 assertions; shared query wiring: 15 assertions.
- Initial full fast gate: 725/725 steps, exit 0. Final stable-source gate is recorded in the merge receipt.
- No installed-desktop build or real-provider run was performed. HTTP gate is not required
  for this frontend-only change. No public deployment or release was performed.
