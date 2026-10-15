# Moe: gemeinsame Übergabe zwischen Codex und ChatGPT Web

## Zweck und verbindliche Quellen

Dieses Dokument hält Bearbeitungszuständigkeit und Arbeitsnachweise fest. Es ersetzt weder die [Roadmap](MOE_AI_STATION_ROADMAP.md) mit ihrer verbindlichen Entwicklungsmethodik noch den [Produktauftrag](MOE_LIFE_BUSINESS_AUTOMATION.md) oder das [Betriebshandbuch](MOE_PRIVATE_OPERATOR_RUNBOOK.md). Repository: `BlazingMoe/starnet`, Entwicklungsbranch: `dev/mo-ai-station`. Es entsteht keine zweite Roadmap.

ChatGPT Web und Codex dürfen innerhalb ihrer jeweils verfügbaren Funktionen und Nutzungsgrenzen abwechselnd arbeiten. Ein Modellwechsel beweist weder separates Guthaben noch geringere Gesamtkosten. Dieses Verfahren umgeht keine Zugriffskontrollen oder Limits.

## Bearbeitungsübergabe

- Aktiver Bearbeiter: **Codex Desktop – vom Nutzer zurückübernommen am 2026-10-15**. Auftrag: gezielte Wissenspflege-/Lern-Skill-Integration; Ausgangscommit `9bbf8c7f0d50e2cfe7c5d233b0b457c2b4e8d215`. Zunächst Übernahmecommit und dessen CI; anschließend begrenzte Umsetzung über vorhandene Skills/Notebook/Decision-Schnittstellen, zugehörige Tests und Mirrors. Kein paralleler Web-Auftrag. Tatsächliches Leitmodell: nicht separat verifiziert.
- Ausgangscommit der Übergabe: `c68cb32dcf5847a611fb9dfc5d6ad1e68af451dc` (historische Referenz, HEAD immer neu lesen).
- Nächster sinnvoller Block: bestehende Wissenspflege-/Lern-/Protokollierungs-Skills mit StarNet Market/Docs abgleichen; genau eine nützliche Lücke über vorhandene Notebook-/Decision-/Skill-Funktionen schließen. Keine neuen Dauerläufe oder parallelen Wissensstores. Umfang vor Umsetzung begrenzen.
- Quellen: https://starnetos.com/docs/ und https://starnetos.com/market . Ein konkreter LLM-Wiki-Kandidat ist noch nicht geprüft oder integriert.
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
- Market-Skill-Integration ist noch offen. Der neue `crack_helper` ist konfiguriert; sein erster Auftrag scheiterte am Nutzungslimit, also kein erfolgreicher Laufzeitnachweis.

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

## Kopierauftrag für ChatGPT Web

Arbeite an BlazingMoe/starnet auf dev/mo-ai-station weiter. Lies zuerst docs/MOE_CROSS_CLIENT_HANDOFF.md, dann gezielt docs/MOE_AI_STATION_ROADMAP.md und docs/MOE_LIFE_BUSINESS_AUTOMATION.md sowie geltende Repository-Anweisungen. Prüfe deine tatsächlichen Lese-/Schreib-/Shell-/Testfähigkeiten, Remote-HEAD, CI und aktiven Bearbeiter. Behaupte fehlende Fähigkeiten nicht. Übernimm die Bearbeitung nachvollziehbar und ändere nichts bei laufenden, fehlenden oder unklaren erforderlichen Gates. Bewahre Fremdänderungen, Schutzmechanismen, bestehende Architektur und Lizenzen. Nutze vorhandene Funktionen zuerst. Wähle einen begrenzten, nützlichen Block mit Tests und Abschlussreserve; keine zusätzlichen Dauerprompts oder Hintergrund-Modellschleifen. Dokumentiere Quellen, Änderungen, tatsächliche Tests und Grenzen im gemeinsamen Protokoll. Committe nur auf dem autorisierten Entwicklungsbranch, nie Force-Push. Ohne Schreibzugriff liefere einen Patch. Übergib das Ergebnis als REVIEW_PENDING mit Commit/Dateien/Evidenz an Codex; keine selbst behauptete Codex-Abnahme. Öffentliche Veröffentlichung, Nachrichten, Käufe, bezahlte Verpflichtungen und Live-Trades sind nicht autorisiert.
