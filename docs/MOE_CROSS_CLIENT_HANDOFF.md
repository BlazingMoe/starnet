# Moe: gemeinsame Übergabe zwischen Codex und ChatGPT Web

## Zweck und verbindliche Quellen

Dieses Dokument hält Bearbeitungszuständigkeit und Arbeitsnachweise fest. Es ersetzt weder die [Roadmap](MOE_AI_STATION_ROADMAP.md) mit ihrer verbindlichen Entwicklungsmethodik noch den [Produktauftrag](MOE_LIFE_BUSINESS_AUTOMATION.md) oder das [Betriebshandbuch](MOE_PRIVATE_OPERATOR_RUNBOOK.md). Repository: `BlazingMoe/starnet`, Entwicklungsbranch: `dev/mo-ai-station`. Es entsteht keine zweite Roadmap.

ChatGPT Web und Codex dürfen innerhalb ihrer jeweils verfügbaren Funktionen und Nutzungsgrenzen abwechselnd arbeiten. Ein Modellwechsel beweist weder separates Guthaben noch geringere Gesamtkosten. Dieses Verfahren umgeht keine Zugriffskontrollen oder Limits.

## Bearbeitungsübergabe

- Aktiver Bearbeiter: **Codex Desktop – vom Nutzer zurückübernommen am 2026-10-16**. Der Recovery browser-import symlink guard wurde veröffentlicht und die fünf Pflichtprüfungen auf `57892f9` waren grün. Aktueller Block: vollständige/Sidecar-only Recovery-Scope-Prüfung wurde auf Implementierungs-/Fixture-Ebene durch Lead akzeptiert; CI für Folgecommit steht aus. Tatsächliches Leitmodell nicht separat verifiziert. Keine parallele Web-Bearbeitung.
- Ausgangscommit der Übergabe: `57892f966c847ad1e391cb95430338f2f8d10da0` (Ausgangsstand dieses Blocks; HEAD immer neu lesen).
- Nächster Schritt: autorisierten Entwicklungsworkflow fortsetzen und Pflicht-CI des Folgecommits abwarten; danach Roadmap-Checkpoint aktualisieren.
- Quellen: https://starnetos.com/docs/ und https://starnetos.com/market wurden abgeglichen. Der Market listet „LLM Wiki“ (MIT); die Wissensgraph-/Markdown-Dateien wurden wegen des bestehenden Speicherverbots nicht übernommen. Der passende bounded workflow ist als Anpassung an die vorhandenen Entscheidung-/Review-Funktionen protokolliert.
- Nach jeder Web-Umsetzung: **REVIEW_PENDING**; Codex prüft den tatsächlichen Diff und die Evidenz. Keine Behauptung einer bereits erfolgten Codex-Abnahme.

Vor Änderungen den tatsächlichen Remote-HEAD, CI und diesen Bearbeiterstatus lesen. Eine einzelne Instanz trägt Client, selbst gemeldetes Modell (oder „unbekannt“), Zeit, Basiskommit, Aufgabe und betroffene Pfade ein und sichert die Übernahme auf dem Entwicklungsbranch. Direkt davor Remote erneut prüfen; bei konkurrierender Übernahme stoppen, nichts überschreiben. Dieser Eintrag ist ein kooperatives Protokoll, keine atomare technische Sperre. Solange ein anderer Client arbeitet oder REVIEW_PENDING offen ist, keine konkurrierende Entwicklung starten. Ein abgebrochener Auftrag wird erst nach Nutzerübergabe oder belegter Freigabe übernommen, nicht allein wegen verstrichener Zeit. Der Übernahmecommit unterliegt ebenfalls den CI-Gates.

Wenn der Client nicht schreiben kann, liefert er einen Patch samt Übergabe an den Nutzer. Dann bleibt die Arbeit unveröffentlicht; keine Installation, Tests oder Commits behaupten. Keine Tokens, Passwörter, privaten Laufzeitdaten oder vollständigen sensiblen Logs ins Repository schreiben.

## Stand und vorhandene Evidenz, 2026-10-15

- Fünf erforderliche CI-Checks für `c68cb32` waren beim Erstellen dieser Übergabe grün: `gate`, `gitleaks`, `credential-free-evals`, zweimal `orchestration-safety`. Für jeden Folgecommit neu prüfen.
- 741 lokale Fast-List-Einträge besitzen erfolgreiche Ergebnisse aus dokumentierten Teilläufen über mehrere Commits, **kein frischer vollständiger Lauf eines einzigen HEADs**. Relevante Änderungen benötigen weiterhin ihre Tests.
- Der letzte offene Eintrag `test/crt-context-loss.e2e.test.mjs` bestand auf `c68cb32` mit `SKYNET_CHROME=F:\chrome-win\chrome.exe`, Chromium `158.0.8106.0`, Exit 0: WebGL-Kontextverlust, CPU-Fallback, sichtbares Bild, kein Reload, genau eine Warnung, keine unbehandelten Ausnahmen. Separates temporäres Profil; kein Nutzerprofil. Lokale Evidenz: `work/npm-repair/crt-context-loss-result.txt` außerhalb des Repos.
- Letzte Blöcke: Routinen-Durchlaufgrenzen (`maxIters`, `maxCostUsd`); CSV-Profil, Zeilenzugriff und geprüfter CSV-Export; begrenzte XLSX-Blatt-/Bereichsleser; sichere PR-Sweep-Connector-Projektion; Entscheidungslernen und Recovery-/Kostenansichten; Windows-Zeilenendenkorrekturen. Einzelheiten und Grenzen stehen in Roadmap und Commit-Diffs.
- XLSX ist lesend: keine Formelneuberechnung, Bearbeitung oder Layout-/Diagrammtreue. Gespeicherte Formelwerte können veraltet sein.
- Echte Browser-/Anbieter-/Account-/Gesamtabnahme, installierte Wiederherstellung mit echten Nutzerdaten und unbeaufsichtigter Betrieb sind nicht pauschal abgenommen. Nicht durch Fixtures ersetzen.
- Historischer Snapshot bei Anlage dieses Handoffs: Market-Skill-Integration war noch offen. Seitdem wurde eine gezielte Decision-Learning-Integration ergänzt; breitere Market-Katalogarbeit bleibt offen. Der neue `crack_helper` ist konfiguriert; sein erster Auftrag scheiterte am Nutzungslimit, also kein erfolgreicher Laufzeitnachweis.

## Arbeitsnachweis pro zusammenhängendem Block

Ein Eintrag pro Block, bei Abschluss aktualisieren. Änderungen zusätzlich durch Git-Diff/Commit belegen; keine zeilenweise Tool-Transkription.

```text
ID / Datum:
Status: IN_PROGRESS | REVIEW_PENDING | ACCEPTED | BLOCKED
Client / Agent / Modell: (Modell nur belegt oder als selbst gemeldet markieren)
Auftrag / Abschlusskriterien / verantwortliche Pfade:
Ausgangscommit:
Gelesene Dateien und externe Quellen: (selbst protokolliert; ggf. unbekannt)
Geänderte Dateien / Grund:
Tests: exakte Befehle, Ergebnis, Umgebung, Auslassungen und Evidenzpfad
Ergebniscommit(s): (oder unveröffentlichter Patch; nicht den eigenen Hash erfinden)
CI: Commit, Checks, Status, Links
Kosten: verfügbare Messwerte; fehlende Tokens/Preise ausdrücklich unbekannt
Offene Risiken / nächster konkreter Schritt:
Prüfung durch Codex: offen | Befunde | akzeptierter Commit, Datum und Begründung
```

Git belegt Änderungen, aber **keine Lesezugriffe und keine Modellidentität**. Einträge über gelesene Dateien sind Selbstauskünfte; Vollständigkeit nicht behaupten. Separate technische Zugriffsüberwachung ist hier nicht implementiert. Keine zusätzlichen Modellläufe allein zum Protokollieren.

### Übergabe angelegt – 2026-10-15

- Client: Codex Desktop; konkretes aktives Leitmodell nicht unabhängig verifiziert.
- Ausgangscommit: `c68cb32dcf5847a611fb9dfc5d6ad1e68af451dc`.
- Gelesen: bestehende Roadmap, Remote-Ref und fünf Checks; vorheriger lokaler Browsertest und dessen Ergebnisdatei als Sitzungsevidenz.
- Änderung: dieses gemeinsame Protokoll; Roadmap aktualisiert, um den inzwischen bestandenen Browsertest korrekt festzuhalten und hierher zu verweisen.
- Prüfung: Dokument-Diff und `git diff --check`; keine Laufzeitänderung, deshalb keine Wiederholung der 741 Tests.
- Kosten: keine genauen Token-/Dollarwerte für diesen Dokumentblock verfügbar.
- Ergebniscommit: der Commit, der diesen Abschnitt einführt (über Git-Historie auffindbar). CI dieses Commits beim Übernehmen prüfen.
- Nächster Schritt: Bearbeitung übernehmen, vorhandene Skill-Funktionen gezielt abgleichen, begrenzten Block implementieren und als REVIEW_PENDING übergeben.

### Decision-Learning-Skill – 2026-10-15

- Status: **ACCEPTED** auf Implementierungs-/Fixture-Ebene; neuer Commit und dessen CI ausstehend. Echte Anbieter-/Account-/Gesamtabnahme bleibt offen.
- Client/Agent: Codex Desktop / begrenzter Builder; aktives Leitmodell nicht separat verifiziert.
- Ausgangscommit: `4eade678bdded543b1cdf96774b11667fd27cb73` auf `dev/mo-ai-station`; lokaler Arbeitsbaum war sauber. Die fünf erforderlichen Remote-Checks waren laut Übergabeauftrag für diesen Ausgangsstand grün.
- Aufgabe/Pfade: eine ausdrücklich auswählbare, deaktivierte Decision-Learning-Prozedur in `sidecar/skills/library/decision-learning.md`; Katalogregression in `test/skills.library.test.js`; dieser Handoff-Eintrag. Kein zusätzlicher Speicher, Tool, Zeitplaner oder Mirror nötig: die Bibliothek wird aus `sidecar/skills/library/*.md` geladen.
- Quellen: Roadmap, Life/Business Automation, Notebook- und Decision-Tool-Verträge; https://starnetos.com/docs/, https://starnetos.com/market und deren öffentlicher Registry-Eintrag für „LLM Wiki“ (Nous Research, MIT, Upstream-Commit `e85706cba780382ef91ba7a38a20ebe95207a795`). Diese Beschreibung lieferte einen nützlichen Workflow-Hinweis. Es wurde kein Upstream-Skilltext oder Code kopiert; keine MIT-Attribution-Datei erforderlich. Die persistenten Wiki-Dateien wurden wegen des Verbots paralleler Wissensspeicher nicht übernommen.
- Ergebnis: Skill ist `default:false`, benötigt NOTEBOOK und DISH, nutzt `decision.list`/`decision.lesson_propose` sowie den bestehenden Memory-Core-Prüfpfad. Er verlangt beobachtetes Outcome, quellengebundene Unsicherheit, behandelt Web-/Quelldaten als nicht vertrauenswürdig, erhält idempotente Retry- und terminale Review-Zustände und behauptet keine automatische Verifikation. Ein behaltenes Lesson wird korrekt als reference-only beschrieben und kann unter dem existierenden Recall-Fence nach Relevanz erscheinen. Kein zusätzlicher Mirror, da kein weiterer Skill-Katalog-Spiegel existiert.
- Tests (Node `C:\Users\Moe\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`): `test/skills.library.test.js` — OK (351 assertions); `test/decision-history.test.js` — OK (71); `test/decision-history-http.test.js` — OK (28); `test/memory-decisions-ui.test.js` — OK (28); `test/skill-goldens.test.js` — OK (19); `git diff --check` — OK. Decision tests cover exact retry/recovery, duplicate conflicts, untrusted model records, corrupt/unavailable history and review-state rendering. Fixture-backed only; no real provider/account or live browser acceptance claimed.
- Geänderte Dateien: `sidecar/skills/library/decision-learning.md`, `test/skills.library.test.js`, `docs/MOE_AI_STATION_ROADMAP.md`, `docs/MOE_CROSS_CLIENT_HANDOFF.md`.
- Kosten: keine Token-/Dollartelemetrie verfügbar; keine Ersparnis behauptet.
- Nächster Schritt: autorisierten Entwicklungsbranch aktualisieren, Pflicht-CI des neuen Commits abwarten und anschließend den Roadmap-Checkpoint aktualisieren.

### Recovery browser-import symlink guard – 2026-10-15 (published)

- Status: **ACCEPTED** at implementation/fixture level by lead; published at `57892f9`, whose five required CI checks were green per lead verification.
- Client/Agent: Codex Desktop / bounded builder; active lead model not independently verified.
- Ausgangscommit: `a25cf462fe1c4327843a97cdfa0cd1f883dde368` on `dev/mo-ai-station`; clean at start. Published result `57892f966c847ad1e391cb95430338f2f8d10da0`; five required checks green per lead verification.
- Gap: production recovery restore followed symlinks when checking an existing browser-import output and could replace the link itself. Backup output already refused symlinks, but the restore-side import path lacked the matching guard.
- Änderung: `scripts/station-recovery.mjs` now uses `lstat` to reject a symlink browser-import destination before staging or workspace activation. `test/station-recovery-cli.test.js` verifies the link and target bytes remain intact and no restored workspace is activated. `docs/MOE_PRIVATE_OPERATOR_RUNBOOK.md` records the constraint.
- Prüfung: Windows, configured Node executable; `test/station-recovery-cli.test.js` — OK (42 assertions); both file-symlink and dangling-symlink cases actually ran (no skip). Symlink-creation skips are scoped only around `symlinkSync`; restore execution and assertions are outside those catches. `git diff --check` — OK. Fixture-backed CLI test only; no real operator restore, no app/browser import, and no fresh CI for this diff.
- Kosten: exact token/dollar telemetry unavailable.
- Offene Risiken / nächster Schritt: Codex review the diff; then publish through the authorized branch workflow and wait for all required CI checks on the resulting commit. A real isolated restore rehearsal with operator data remains separate private acceptance and was not run.

### Complete recovery backup input – 2026-10-16

- Status: **ACCEPTED** at implementation/fixture level by lead; required CI for the eventual commit remains pending.
- Client/Agent: Codex Desktop / bounded builder; active lead model not independently verified.
- Ausgangscommit: `57892f966c847ad1e391cb95430338f2f8d10da0`; clean on `dev/mo-ai-station`. Five required CI checks on this commit were reported green by the lead before this block.
- Gap: the production backup CLI accepted arbitrary JSON with an empty or malformed `starnet.save`, and there was no explicit receipt scope to distinguish browser-inclusive station recovery from sidecar-only capture. The existing in-app export produces a `starnet.backup` envelope containing origin `starnet.*` records and a best-effort notebook snapshot; the durable workspace capture carries station files for all agents.
- Changed paths: `scripts/station-recovery.mjs`, `test/station-recovery-cli.test.js`, `docs/MOE_PRIVATE_OPERATOR_RUNBOOK.md`, `docs/DISASTER_RECOVERY.md`, this handoff.
- Result: default full-station backup requires the existing `starnet.backup`/`skynet.backup` contract (or a raw key map), parses the embedded agent save using the current/legacy save tags and rejects malformed/empty/future saves. A shared validator also rejects nonempty invalid browser data from older integrity-valid bundles during inspect/restore, before restore filesystem changes. Explicit `--workspace-only` preserves sidecar-only capture; backup and inspect label scope, and restore does not emit an invalid empty browser-import file. Runbooks describe origin-key vs durable-workspace coverage.
- Code evidence: `frontend/index.html` exposes the sole **EXPORT AGENT** action; `frontend/app/app.js` calls `Backup.exportAll`; `frontend/app/backup.js` builds `{schema,version,store,notebook}` from all nonsecret origin `starnet.*` keys and validates current/legacy envelopes; `frontend/app/save.js` accepts current/legacy save tags and rejects future versions. Repository search found no additional recovery CLI callers beyond `package.json`, this runbook and `docs/DISASTER_RECOVERY.md`; both docs now identify complete-station and workspace-only modes explicitly.
- Tests: Windows, configured Node executable; `test/station-recovery-cli.test.js` — OK (64 assertions). Covers current/legacy export envelopes and save tags, malformed/empty/future save refusal with previous-bundle preservation, workspace-only backup/inspect/restore, and an older integrity-valid bundle with incomplete browser state rejected by both inspect and restore before target mutation. `git diff --check` — OK.
- Open limit: fixture-backed CLI only; no operator data, installed-app export, off-disk copy or restore rehearsal.

## Kopierauftrag für ChatGPT Web

Arbeite an BlazingMoe/starnet auf dev/mo-ai-station weiter. Lies zuerst docs/MOE_CROSS_CLIENT_HANDOFF.md, dann gezielt docs/MOE_AI_STATION_ROADMAP.md und docs/MOE_LIFE_BUSINESS_AUTOMATION.md sowie geltende Repository-Anweisungen. Prüfe deine tatsächlichen Lese-/Schreib-/Shell-/Testfähigkeiten, Remote-HEAD, CI und aktiven Bearbeiter. Behaupte fehlende Fähigkeiten nicht. Übernimm die Bearbeitung nachvollziehbar und ändere nichts bei laufenden, fehlenden oder unklaren erforderlichen Gates. Bewahre Fremdänderungen, Schutzmechanismen, bestehende Architektur und Lizenzen. Nutze vorhandene Funktionen zuerst. Wähle einen begrenzten, nützlichen Block mit Tests und Abschlussreserve; keine zusätzlichen Dauerprompts oder Hintergrund-Modellschleifen. Dokumentiere Quellen, Änderungen, tatsächliche Tests und Grenzen im gemeinsamen Protokoll. Committe nur auf dem autorisierten Entwicklungsbranch, nie Force-Push. Ohne Schreibzugriff liefere einen Patch. Übergib das Ergebnis als REVIEW_PENDING mit Commit/Dateien/Evidenz an Codex; keine selbst behauptete Codex-Abnahme. Öffentliche Veröffentlichung, Nachrichten, Käufe, bezahlte Verpflichtungen und Live-Trades sind nicht autorisiert.

### Private acceptance checkpoint — 2026-10-16

- Codex Desktop remains owner. Recovery scope/input changes published at 343400bbf32bee346327b20efc059deddfe4dde6; all five required CI checks verified green.
- Isolated launch UI smoke completed by the builder, reviewed by lead: fresh onboarding and default ASK FOR APPROVAL visible; no provider call or user-data mutation. Evidence and remaining limits: [acceptance record](research/2026-10-04-reuse/decision.md#isolated-launch-ui-smoke-2026-10-16).
- Next: bounded attended provider/recipe acceptance needs verified existing configuration and explicit limits; connector and real-data restore acceptance remain open. No concrete additional implementation defect found during this bounded review. Do not repeat unchanged model-setup diagnosis or invent features.

### Routine toolset normalization — 2026-10-16

- Status: **ACCEPTED** by lead at implementation/fixture level after alias-collision and unknown-MCP corrections; publication and resulting CI pending.
- Starting point: `4bd6e4f5a524b7eabec8f65119a906b56eb28adf`, clean branch `dev/mo-ai-station`; all five required CI checks were reported green by the lead.
- Change: one restriction-only parser now handles HTTP create/update. Known family IDs, display labels, built-in tool names, and configured MCP connector IDs/names normalize to canonical capability families. The existing `connectors` family is a whole-family restriction, not a per-connector grant. Unknown MCP strings/tool names without actual runtime metadata are rejected; connector aliases that collide with another family are ambiguous and rejected, while exact canonical IDs remain stable. Persisted records are never upgraded from aliases; unknown stored values remain inert. Omitted/`null` retain station defaults and `[]` remains deny-all. The agent-facing `routine.create` path no longer converts malformed toolset input to `null`. Scheduled dispatch and Run Now continue forwarding the same stored restriction to the common run host. No UI change was needed because the existing free-text field accepts aliases.
- Source/license: upstream comparison S6 and upstream `sidecar/routine-toolsets.js` were consulted as research only. No upstream source was copied or ported; no attribution change is required. Local MIT terms and `NOTICE.md` were inspected. No upstream asset or exclusion material was reused.
- Changed paths: `sidecar/routine-toolsets.js`, `sidecar/index.js`, `sidecar/tools/builtin/routines.js`, `test/routine-toolsets.test.js`, `test/fast.list`, `test/cron.api.test.js`, `test/cron-store.test.js`, `test/cron.run-now.test.js`, this handoff.
- Checks (configured Node v24.19.0): `test/routine-toolsets.test.js` — OK (15); `test/cron.api.test.js` — OK (131); `test/cron-store.test.js` — OK (160); `test/cron.dispatch.test.js` — OK (39); `test/cron.run-now.test.js` — OK (26); `test/routine-tools.test.js` — OK (90); `git diff --check` — OK. No full fast suite or UI/browser run was needed; UI was unchanged.
- Limits/next: review actual diff and tests, then continue the authorized development-branch workflow and wait for required CI on the resulting commit. No paid/provider calls, connector account writes, or real routine execution were performed.
