# Connected-app widgets

Owner direction: choose a connected app, define what to track, and display actual readings
with refresh, source and error states. The previous counter-first candidate is superseded.
Keep a few useful presets: Revenue snapshot, Tasks due, Daily brief.

Done means creating a widget through the live Connected apps picker, observing a connector
read publish its value, changing and refreshing it, retaining the previous reading during
an outage, and recovering after a sidecar restart. Deleting a widget must also remove its
linked schedule. Required syntax, fast and HTTP gates must pass before integration.

## Implementation

- Your widgets / Connected apps / Pinned picker; no default station counters. Old pins remain
  manageable. Three editable presets plus custom Number, List, Trend and Progress displays.
- Sources are the current MCP manager and configured service-key inventory, plus information
  StarNet manages. API keys are labelled configured rather than independently verified. The
  inventory exposes no credentials, token values, connection headers or process arguments.
- Saved source identity, request and display type live beside the reading in the durable widget
  store. A definition alone has no reading or update timestamp. Editing clears the old reading
  and advances a version; stale publications and stale editors cannot overwrite it. Deletion
  leaves a bounded tombstone, and versioned publications cannot recreate missing definitions.
- Create & fetch / Refresh now opens a dedicated widget conversation through existing
  Workstreams, Chat, run-loop and connector permission boundaries. No raw connector-call bypass,
  autonomous grant, connector installation, or credential change is introduced.
- widget.set validates the requested display shape. Failure retains the previous value and
  timestamp. Details show the source app, reporting agent, time, source link and error; an
  unavailable source is explicit. An agent report is not described as an independently
  verified app fact. No personal source data was used during verification.
- Schedule updates pre-fills the existing Automation editor. Nothing runs automatically until
  the user saves a schedule and arms scheduling with the needed access. widget.get reads the
  current definition each scheduled run. Linked schedule status is displayed from the real cron
  snapshot. Deletion aborts linked scheduled runs and removes their jobs before removing the
  widget; unrelated routines are preserved. Concurrent schedule creation is fenced during deletion.
- Native theme controls, bounded popup, keyboard focus containment, source-safe links, and
  text-only rendering of app/agent strings. Unused legacy insights counters no longer poll.

## Live evidence

`dev/widget-studio-replay.mjs` runs a labelled local MCP server and deterministic provider.
It exercises the actual HTTP connector, run loop, capability/consent machinery, widget tool,
durable store, UI and Automation. These are synthetic fixtures, not production account readings
or a model-quality evaluation. The normal preview is :9186; the disposable proof station is :9190.

- Created Revenue snapshot by selecting the connected Demo Revenue fixture in the browser.
  Provider trace: brief_proceed -> mcp__widget_demo__revenue_snapshot -> widget_set. UI showed
  $1240, then $1520 after a changed source response and Refresh now. Actual agent/run/time and
  source URL were persisted. No direct store injection produced the readings.
- Source failure recorded an error while retaining $1520 and its original timestamp. That
  state and its pinned layout survived a sidecar restart. Restored controls opened the detail;
  recovery fetched $1680 and cleared the error.
- The schedule editor received the saved widget id and a prompt to call widget.get first.
  Saved a linked job with the explicit connectors grant. Run Now exercised the scheduler's
  real unattended posture: widget_get -> connector read -> widget_set, publishing $1790.
  Global scheduling remained off and the widget correctly said scheduled updates paused.
- Edited the saved widget to Trend. Its version advanced to 2; $1790 and the actual three-point
  series [1590,1690,1790] appeared, with a visible 48px chart in details.
- Disabled the fixture connector. Its old reading remained visible with app disabled; refreshing
  returned an actionable reconnect error and performed no source read. An unknown source was
  rejected with 400; a token-less sources request was rejected with 403.
- Deleted the widget through its UI. Both widget inventory and its linked cron-job count became
  zero. Source-data configuration and other app data were not modified.

Focused checks: widgets 78, widgetfeed 68, capgate 54, harness integration 182, toolprops 145,
query-spine wiring 16 assertions passed. Full-gate and final visual receipts follow after the
candidate is committed. No merge, install, or release is claimed by this source receipt.
