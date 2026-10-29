# Moe AI Station — Private Operator Runbook

This runbook is the active operating path for the private fork on `dev/mo-ai-station`.
It is intentionally separate from StarNet's public release/signing/branding runbooks.

## Scope

Moe AI Station is operated by one owner for private work. The active objective is usable
capability, reliability, autonomy, cost control, recovery, research and business execution.
Public redistribution, independent installer signing, public updater infrastructure and a
complete rebrand are not active prerequisites.

Private use does **not** weaken runtime boundaries: tool capabilities, connector consent,
budgets, E-STOP, workspace isolation and durable audit evidence remain authoritative.

## 1. Get the private branch running

Requirements:

- Git
- Node.js 18+; Node 22 matches CI
- For the desktop shell only: Rust plus the Tauri v2 platform prerequisites

From a checkout of this fork:

```bash
git checkout dev/mo-ai-station
git pull
npm ci
npm run test:fast
npm run desktop:dev
```

For the browser/sidecar path without the Tauri shell:

```bash
node sidecar/index.js
```

Then open `http://localhost:8787`.

Do not use the old public-release checklists as the private startup gate. The dedicated
`Moe AI Station CI` is the derivative contract gate; `test:fast` remains the broad
inherited regression gate.

## 2. Connect model capacity

Use SETTINGS / PROVIDERS and configure only providers you actually intend to spend money on.
Secrets belong in the app's protected credential path, never in this repository or in a
portable backup.

A local Ollama endpoint can be used for zero-API-cost work. Cloud providers should have
explicit spend caps before unattended jobs are enabled. Provider registry presence is not
treated as health evidence; the UI only reports liveness/rate-limit facts the runtime actually
observed.

For an attended manual chat send, **Manual send limits** in COMMS can set a per-request
iteration ceiling and/or recorded-cost ceiling in USD. Leave either field blank to use the
station policy for that dimension. The sidecar validates the values and only tightens its
existing limits. The controls apply to the main agent request for that send; they do not budget
retries, recovery, delegation or later automatic stages. Recorded cost may lag a running request,
and an unknown provider cost is not treated as free. Use provider and station limits for unattended
work.

Manual-send-limit implementation evidence (2026-10-07): the composer fixture contract passed 49
assertions and the sidecar e2e with a mocked provider passed 79 assertions. Browser UI acceptance
was unavailable in the worker environment, so these results do not claim real-model/provider
acceptance.

## 3. Configure private Google Workspace access

Moe AI Station uses the stable Gmail, Drive, Calendar, Docs and Sheets APIs through the local
Google transport.

For a private source build, use your own Google Desktop OAuth registration rather than the
public StarNet publisher workflow:

1. In a Google Cloud project you control, enable the Gmail, Drive, Calendar, Docs and Sheets APIs
   you intend to use.
2. Create an OAuth **Desktop app** client and configure the consent/test-user state required by
   your Google account.
3. Put the downloaded `installed` client JSON into the process environment for staging:

```bash
# STARNET_GOOGLE_DESKTOP_CLIENT_JSON must contain the complete downloaded installed-client JSON.
node scripts/stage-google-client.mjs
```

The staging script reads `STARNET_GOOGLE_DESKTOP_CLIENT_JSON` and writes only the native
client registration required by the local connector. Do not commit
`sidecar/mcp/google-client.json`.

Current private-use capability:

- **Gmail:** search; read message/thread/attachment; list labels; reversible read/unread and
  inbox/archive state; explicit label add/remove; structured compose draft; thread-safe sender
  reply draft; advanced raw draft; explicit draft send.
- **Drive:** search and metadata; Workspace export; bounded text/Markdown/CSV/JSON content
  download; create text artifacts; replace existing text artifact content; metadata create/update.
- **Calendar:** calendar/event read; free/busy; create; patch; delete; self-attendee RSVP.
- **Docs:** read; create; append plain text; advanced atomic `batchUpdate`.
- **Sheets:** read metadata/values; create; write ranges; append table rows; advanced structural
  `batchUpdate`.

Each service is authorized independently. Drafting is not sending. Sending mail, deleting
calendar events and other external mutations remain separate consent-gated actions.

## 4. Connect GitHub and other services

For repository review, start in **ABILITIES → CONNECTORS → GitHub (read-only)**.
This uses the official `https://api.githubcopilot.com/mcp/readonly` endpoint through the
existing HTTP MCP client, credential storage and consent boundary. Supply a repository-scoped
personal access token in the connector's credential field, with only the read permissions
needed for contents, pull requests, issues or Actions. Never put the token in a task prompt.
Installing this card does not replace an existing `GitHub` connection; disable broader
connections for agents whose work should only inspect repositories.

For an attended first task, specify the exact owner/repository and branch or PR, then ask Moe
to read the current commit, summarize a relevant file and list CI checks for that exact commit.
The answer should include the commit SHA, source links and pending/failed/unknown checks;
an empty check list is not proof of green CI. Stop on authentication, repository-access or
scope errors. This connection offers no posting, merging or workflow dispatch; a later write
workflow requires separately scoped access and authorization.

GitHub documents the server-side read-only URL in its
[remote MCP guide](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md).
The 2026-10-07 implementation reuses that hosted service and the existing StarNet transport;
it adds no dependency, bundled third-party code or second credential store. The checked StarNet
upstream `e0a36dcd31787248b877aea01a6e53741012bc46` has the general GitHub card but no distinct
read-only card. A protocol fixture verifies catalog installation, separate connection identity,
initialization, tool discovery and a read call with the exact endpoint and header-only credential.
This is not real GitHub account acceptance, a verification of available account scopes, or a
claim that all GitHub integration work is complete. Hosted availability and account policies
remain GitHub-controlled; no new paid service is provisioned by adding the catalog card.

Use the Connector/MCP catalog for services that are already supported generically rather than
building a second connector implementation. For GitHub, scope the token/installation to the
repositories and actions you actually need.

Prefer read-only authorization first. Add write/execute authority only when a workflow has a
specific use for it.

## 5. Build the working crew

Keep the derivative organizational layer additive:

- **Commander** — owns decomposition and final synthesis.
- **Manager** — may delegate downward but receives no implicit tool authority.
- **Specialist** — domain-focused worker; may delegate only to Workers where policy allows.
- **Worker** — bounded execution leaf.

Use `team.delegate_managed` for consequential subtasks. It carries task contracts,
acceptance criteria, bounded revision, optional independent audit, cumulative spend and real
failure reasons over the inherited `team.dispatch` executor.

Control Mode is the operator truth surface for active stage, task history, action trace,
approval state, costs/budgets, memory provenance and provider signals. Missing evidence stays
unknown rather than becoming a synthetic green status.

### Bound one attended acceptance request

The existing authenticated `POST /api/run` entry accepts an optional `limits` object:

```json
{"limits":{"maxIters":6,"maxCostUsd":0.25}}
```

Include this alongside the normal configured agent, model, provider and messages. Limits
only lower the existing run policy; a larger requested value cannot increase a station
ceiling. Invalid, zero, negative, nonnumeric or unsupported fields return HTTP 400 before
starting a run. Omitting limits preserves the existing behavior and does not change saved
station settings. All normal tool, consent, E-STOP and budget checks still apply.

An explicit `maxIters` bounds the main agent loop and disables its extra grace model turn.
`maxCostUsd` uses the existing observed/estimated spend guard between model calls; an
in-flight call can exceed the threshold, and unpriced usage cannot establish a dollar cost.
For subscription runs, a cost estimate is not an invoice; use the iteration limit to bound
the acceptance. Delegated workers and auxiliary model work retain their own existing
governors, so these fields alone do not cap every model call in a whole team. Keep a client
timeout and cancel the stream if the attended test must stop. Closing the interactive
stream cancels its run; detached background jobs follow their own lifecycle.

## 6. Revenue workflow

Open **Recipes → Business → Revenue Pipeline**.

Provide:

- **What you sell** — the service/product and the measurable buyer outcome.
- **Who can buy it** — the target market, or leave the default and let evidence determine the
  strongest market.

The pipeline is designed to compound across runs:

1. load the previously saved pipeline;
2. research public current problem/buying signals;
3. de-duplicate candidates;
4. score fit, evidence, urgency, ability-to-pay and reachability;
5. preserve evidence URL and as-of date;
6. draft only for the strongest opportunities;
7. track researched → qualified → drafted → contacted → replied → meeting → won/lost/parked;
8. surface overdue next actions and stage changes;
9. learn which source/signal patterns actually convert.

Use Drive CSV/JSON or Sheets row append for a durable external pipeline when desired.
Gmail may stage drafts. **The pipeline recipe never sends, publishes, purchases or makes a
financial commitment by itself.**

No workflow can guarantee revenue. Revenue claims should be based on observed outcomes in the
pipeline, not model-generated estimates.

## 7. Unattended operation

Night Shift, cron/routines, provider recovery and bounded model/tool recovery already exist in
the inherited runtime.

Before leaving work unattended:

1. run the same task manually at least once;
2. set a hard spend ceiling;
3. keep E-STOP reachable;
4. grant only the tools/resources the job needs;
5. use draft/staging operations for external communication where possible;
6. require managed acceptance/audit for consequential research or deliverables;
7. inspect Control Mode after the first unattended run.

Do not add blanket retry around mutating tools. Central recovery only retries failure classes
that the host can identify as safe/transient.

For an initial bounded rehearsal, open Automation → Create Routine and set **Stop after this
many settled runs** to a small positive integer. Blank keeps a recurring routine repeating;
a one-time schedule always has one settlement. The Active Routines row shows the durable
settled count and configured total, and the existing scheduler disables the routine once
that total is reached. Successes and terminal failures count; transient retries do not.
This is not a spend cap or a guarantee that every run succeeds. RUN NOW is a separate,
explicit manual execution and can run a finished routine again.

The create-handler/row regression passes its submitted limit through the existing scheduler
store, including transient failure, persistence/reload and terminal exhaustion. This verifies
the UI boundary and reducer using fixtures; it is not an attended live-model routine rehearsal.

On 2026-10-07, `node test/cron.bounded-restart.e2e.test.js` passed on Windows against
the real sidecar at source commit 105f8f775. The isolated, credential-free profile executed
a local script twice on its actual one-minute schedule, retained the first settlement across
a host restart, and stopped automatically at two settlements. A second restart followed by
another complete cadence window produced no third file receipt. The recorded output was also
retrievable from the routine transcript. The test disarmed and stopped its own host and removed
its disposable profile afterward. This is real local script/scheduler execution through HTTP,
with synthetic input; it does not accept browser operation, model quality, external connectors,
interruption inside a mutating script or unattended use of the operator's actual workflows.

## 8. Recovery point before important changes

The full station recovery path is already integrity-checked and secret-aware. It requires a
quiescent/stopped sidecar; do not copy a live workspace and call it a backup.

In the running app, choose **EXPORT AGENT** in the data-portability footer and save the
downloaded `starnet-<agent>-<date>.json` file. Confirm that it is the agent export, then stop
Moe AI Station completely and identify the exact active WORKSPACES path. The recovery CLI
requires this export and checks that it contains the agent save before it creates a bundle.
The app export covers its nonsecret `starnet.*` origin keys and a best-effort notebook snapshot;
the stopped `WORKSPACES` capture covers durable station files across agents. A deliberate
sidecar-only snapshot remains available through `--workspace-only`, and its receipt is labeled
`workspace-only`; it does not meet the complete-station recovery checklist. Run:

```bash
npm run recovery:backup -- --workspace "<WORKSPACES>" --output "<backup>.starnet-recovery.json" --browser-state "<browser-export>.json" --app-version "<current-version>" --mutation "<operator-note>"
npm run recovery:inspect -- --bundle "<backup>.starnet-recovery.json"
```

Choose an output outside the captured WORKSPACES directory; the CLI resolves symlinked path
parents before enforcing this boundary. It refuses a symbolic-link destination and will not
replace an existing bundle unless `--replace-backup` is explicit; that option applies only to an
existing regular file. A failed capture or write leaves the previous valid bundle intact.
The restore CLI also rejects a symbolic-link browser-import destination before activating any
workspace files; choose a regular file path outside the target workspace.
Only an `ok: true` inspected bundle with `scope: "station"` is a complete-station recovery
point. Its browser section should report captured keys; a missing or invalid browser export fails before creating a bundle. The CLI validates the supported schema and bundle integrity; it does not cryptographically prove who created the bundle. Store at least
one copy off the station disk. OAuth grants, provider keys and other credentials are deliberately
excluded and must be reauthorized after a machine/profile restore.

### Verify a restore before relying on the backup

Restore into a new, empty test profile, never over the active station for a rehearsal:

```bash
npm run recovery:restore -- --bundle "<backup>.starnet-recovery.json" --target "<new-test-WORKSPACES>" --browser-output "<browser-restore>.json"
npm run recovery:browser -- --browser-import "<browser-restore>.json" --profile "<new-browser-profile-directory>" --chrome "<installed-Chrome-or-Chromium-executable>"
```

Keep browser output outside the target workspace. The restore CLI verifies durable workspace
files and emits a browser artifact compatible with the offline import path; schema and bundle
integrity are checked, but cryptographic provenance is not established. To restore browser-owned
state, use the dedicated offline recovery command below. Stop Moe AI Station first. Pick a new
profile directory that does not exist; the command refuses an existing directory and binds
`127.0.0.1:8787` exclusively while Chromium imports only the CLI-projected nonsecret `starnet.*`
records. It serves one random-path recovery document and no application, run, save or upload
routes. Keep the recovery window open until its authenticated completion report appears, then
close Chromium so the command releases port 8787.

Before booting the restored workspace, close **all** old StarNet tabs and browser windows: tabs
from an earlier session can reconnect to the same origin. Use two terminals so starting the
sidecar does not block the command that launches the browser. In Terminal 1, select the restored
workspace and pin the normal app to the recovery origin's port:

```powershell
$env:STARNET_WORKSPACES = "<new-test-WORKSPACES>"
$env:STARNET_PORT = "8787"
npm run start
```

In Terminal 2, launch the same Chromium executable with the same new profile directory and the
normal app's same origin:

```powershell
& "<installed-Chrome-or-Chromium-executable>" --user-data-dir="<new-browser-profile-directory>" http://127.0.0.1:8787/
```

Do not use an existing browser profile, an online idle check, or E-STOP as a substitute for the
dedicated offline boundary. The normal app importer remains disabled. Inspect the restored
durable workspace, compare representative file contents with the source, inspect routines
without executing them, and review the receipt's reauthentication list. Reconnect
providers/connectors and grant machine-specific project access only when appropriate. Keep
the original backup. A successful export alone is not a restore test, and current recovery
readiness is not complete until the normal app has booted from the restored browser profile and
the owner has verified the expected local state.

On 2026-10-04, source commit fcdb95356 was exercised on Windows with disposable profiles:
station-recovery.test.js (72 assertions), station-recovery-cli.test.js (20), and
station-recovery.e2e.test.js (23) all passed. This includes the production offline CLI,
rejected existing targets, credential exclusion, and a second real sidecar boot serving
restored identity, layout, routines, project references and deliverable bytes. These are
synthetic station fixtures with external model calls and routine execution disabled;
installed-app browser interaction, Moe's actual data, an off-disk copy, and real account
reauthentication have not been accepted. Those remain the operator rehearsal criteria.

## 9. Private readiness checklist

A private working build is ready for daily use when:

- Moe AI Station CI is green on the exact branch head.
- The provider(s) you intend to use complete a real test task.
- Budgets and E-STOP are configured.
- The needed connectors complete one real read and one reversible write/draft test.
- A representative task chosen for your actual needs completes an evidence-backed end-to-end run, saves its outputs, and resumes safely after interruption; no particular business domain is mandatory.
- A Night Shift/cron task has completed one bounded attended rehearsal before unattended use.
- A recovery bundle has been created, inspected and stored off-disk, and an isolated restore rehearsal has verified the needed data.

Public branding, public updater, code signing, app-ID migration and public release proofs are
not part of this private readiness checklist.

An attended API rehearsal on 2026-10-06 completed a real Codex read-only dossier review
after an intentional sidecar interruption and restart, preserving all four artifact hashes.
See [the acceptance record](research/2026-10-04-reuse/decision.md) for run IDs and limits.
This is evidence for that read-only boundary; browser interaction, writes interrupted in flight,
unattended routines and the full private-readiness checklist remain separate acceptance work.
