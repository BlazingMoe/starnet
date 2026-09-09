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

- **Gmail:** search; read message/thread/attachment; structured compose draft; thread-safe
  sender reply draft; advanced raw draft; explicit draft send.
- **Drive:** search and metadata; Workspace export; bounded text/Markdown/CSV/JSON content
  download; create text artifacts; replace existing text artifact content; metadata create/update.
- **Calendar:** calendar/event read; free/busy; create; patch; delete; self-attendee RSVP.
- **Docs:** read; create; append plain text; advanced atomic `batchUpdate`.
- **Sheets:** read metadata/values; create; write ranges; append table rows; advanced structural
  `batchUpdate`.

Each service is authorized independently. Drafting is not sending. Sending mail, deleting
calendar events and other external mutations remain separate consent-gated actions.

## 4. Connect GitHub and other services

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

## 8. Recovery point before important changes

The full station recovery path is already integrity-checked and secret-aware. It requires a
quiescent/stopped sidecar; do not copy a live workspace and call it a backup.

Export browser-owned state from the app, stop Moe AI Station completely, identify the exact
active WORKSPACES path, then run:

```bash
npm run recovery:backup -- --workspace "<WORKSPACES>" --output "<backup>.starnet-recovery.json" --browser-state "<browser-export>.json" --app-version "<current-version>" --mutation "<operator-note>"
npm run recovery:inspect -- --bundle "<backup>.starnet-recovery.json"
```

Only an `ok: true` inspected bundle is a recovery point. Store at least one copy off the
station disk. OAuth grants, provider keys and other credentials are deliberately excluded and
must be reauthorized after a machine/profile restore.

## 9. Private readiness checklist

A private working build is ready for daily use when:

- Moe AI Station CI is green on the exact branch head.
- The provider(s) you intend to use complete a real test task.
- Budgets and E-STOP are configured.
- The needed connectors complete one real read and one reversible write/draft test.
- The Revenue Pipeline completes one evidence-backed run and saves its state.
- A Night Shift/cron task has completed one bounded attended rehearsal before unattended use.
- A recovery bundle has been created, inspected and stored off-disk.

Public branding, public updater, code signing, app-ID migration and public release proofs are
not part of this private readiness checklist.
