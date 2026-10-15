# Moe: gemeinsame Übergabe zwischen Codex und ChatGPT Web

## Zweck und verbindliche Quellen

Dieses Dokument hält Bearbeitungszuständigkeit und Arbeitsnachweise fest. Es ersetzt weder die [Roadmap](MOE_AI_STATION_ROADMAP.md) mit ihrer verbindlichen Entwicklungsmethodik noch den [Produktauftrag](MOE_LIFE_BUSINESS_AUTOMATION.md) oder das [Betriebshandbuch](MOE_PRIVATE_OPERATOR_RUNBOOK.md). Repository: `BlazingMoe/starnet`, Entwicklungsbranch: `dev/mo-ai-station`. Es entsteht keine zweite Roadmap.

ChatGPT Web und Codex dürfen innerhalb ihrer jeweils verfügbaren Funktionen und Nutzungsgrenzen abwechselnd arbeiten. Ein Modellwechsel beweist weder separates Guthaben noch geringere Gesamtkosten. Dieses Verfahren umgeht keine Zugriffskontrollen oder Limits.

## Bearbeitungsübergabe

- Aktiver Bearbeiter: **Codex Desktop – vom Nutzer zurückübernommen am 2026-10-15**. Gezielte Decision-Learning-Skill-Integration wurde auf Implementierungs-/Fixture-Ebene akzeptiert; der Folgecommit und seine CI stehen noch aus. Tatsächliches Leitmodell nicht separat verifiziert. Keine parallele Web-Bearbeitung.
- Ausgangscommit der Übergabe: `c68cb32dcf5847a611fb9dfc5d6ad1e68af451dc` (historische Referenz, HEAD immer neu lesen).
- Nächster Schritt: Änderungen auf dem autorisierten Entwicklungsbranch veröffentlichen und die Pflicht-CI für den neuen Commit abwarten; danach den Roadmap-Checkpoint aktualisieren.
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

## Kopierauftrag für ChatGPT Web

Arbeite an BlazingMoe/starnet auf dev/mo-ai-station weiter. Lies zuerst docs/MOE_CROSS_CLIENT_HANDOFF.md, dann gezielt docs/MOE_AI_STATION_ROADMAP.md und docs/MOE_LIFE_BUSINESS_AUTOMATION.md sowie geltende Repository-Anweisungen. Prüfe deine tatsächlichen Lese-/Schreib-/Shell-/Testfähigkeiten, Remote-HEAD, CI und aktiven Bearbeiter. Behaupte fehlende Fähigkeiten nicht. Übernimm die Bearbeitung nachvollziehbar und ändere nichts bei laufenden, fehlenden oder unklaren erforderlichen Gates. Bewahre Fremdänderungen, Schutzmechanismen, bestehende Architektur und Lizenzen. Nutze vorhandene Funktionen zuerst. Wähle einen begrenzten, nützlichen Block mit Tests und Abschlussreserve; keine zusätzlichen Dauerprompts oder Hintergrund-Modellschleifen. Dokumentiere Quellen, Änderungen, tatsächliche Tests und Grenzen im gemeinsamen Protokoll. Committe nur auf dem autorisierten Entwicklungsbranch, nie Force-Push. Ohne Schreibzugriff liefere einen Patch. Übergib das Ergebnis als REVIEW_PENDING mit Commit/Dateien/Evidenz an Codex; keine selbst behauptete Codex-Abnahme. Öffentliche Veröffentlichung, Nachrichten, Käufe, bezahlte Verpflichtungen und Live-Trades sind nicht autorisiert.
