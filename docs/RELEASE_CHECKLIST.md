# Release-Checkliste

## Vor dem Merge

- [ ] Auftrag und sichtbares Verhalten sind beschrieben.
- [ ] Keine Zugangsdaten, Datenbankexporte oder Cache-Dateien liegen im Diff.
- [ ] Datenbankmigrationen sind abwärtskompatibel; bei riskanten Änderungen ist ein aktueller Export vorhanden.
- [ ] Ruff, Pytest, ESLint, TypeScript und Vitest laufen vollständig über Docker erfolgreich.
- [ ] Das Produktionsimage wurde erfolgreich gebaut und gestartet.
- [ ] Die betroffenen Abläufe wurden lokal in schmaler und breiter Ansicht geprüft.
- [ ] `git status --short` und der vollständige Diff wurden kontrolliert.
- [ ] Der Pull Request enthält nur fachlich zugehörige Dateien und alle GitHub-Checks sind grün.

## Nach dem Merge

- [ ] Render zeigt den Deploy als **Live** und `/health/ready` als erfolgreich.
- [ ] Der Smoke-Test gegen `https://athletica.emminger-net.de` ist grün.
- [ ] Die in `/health/live` angezeigte `release` stimmt mit dem erwarteten Git-Commit überein.
- [ ] Anmeldung, Abmeldung und die geänderte Kernfunktion wurden produktiv geprüft.
- [ ] Deutsch und Englisch sowie die mobile Ansicht wurden bei Oberflächenänderungen geprüft.
- [ ] Es gibt keine neuen Fehler in Render Events oder Logs.

## Bei Problemen

- [ ] Auswirkung und Beginn notieren; keine produktiven Daten löschen.
- [ ] Bei einem Codefehler den letzten funktionierenden Render-Deploy zurückrollen.
- [ ] Bei möglichem Datenverlust Schreibzugriffe stoppen und nach `OPERATIONS.md` vorgehen.
- [ ] Nach Behebung Smoke-Test und betroffenen Nutzerablauf erneut prüfen.
