# Betriebs- und Notfallhandbuch

Dieses Runbook beschreibt die kleinste belastbare Betriebsroutine für Athletica Log. Es ergänzt
die technische Einrichtung in `DEPLOYMENT.md`; geheime Werte gehören ausschließlich nach Render
und niemals in dieses Dokument oder in GitHub.

## Systemzustand prüfen

Die Anwendung stellt zwei absichtlich öffentliche Prüfpfade bereit:

- `/health/live` bestätigt, dass der Webprozess antwortet.
- `/health/ready` prüft zusätzlich die Verbindung zur Datenbank.

Beide Antworten enthalten unter `release` die ersten zwölf Zeichen des von Render bereitgestellten
Git-Commits. Damit lässt sich eindeutig prüfen, ob der erwartete Stand läuft. Vom Projektordner aus:

```powershell
.\scripts\smoke-test.ps1 -BaseUrl https://athletica.emminger-net.de
```

Für eine bestimmte Version:

```powershell
.\scripts\smoke-test.ps1 `
  -BaseUrl https://athletica.emminger-net.de `
  -ExpectedRelease 0123456789ab
```

## Monitoring einrichten

Render verwendet bereits `/health/ready` als internen Healthcheck. Zusätzlich sollte ein externer
HTTPS-Monitor eingerichtet werden, weil dieser auch DNS, Zertifikat und den öffentlichen
Netzwerkweg prüft:

1. URL `https://athletica.emminger-net.de/health/ready`
2. Intervall fünf Minuten
3. Erfolg: HTTP 200 innerhalb von fünf Sekunden
4. Alarm nach zwei aufeinanderfolgenden Fehlern an die verantwortliche E-Mail-Adresse
5. Optional eine zweite Prüfung der Startseite auf den Text `Athletica Log`

Nach der Einrichtung wird einmal ein Testalarm ausgelöst. Zugangsdaten sind für diese Prüfungen
nicht erforderlich und dürfen nicht im Monitoringdienst hinterlegt werden.

## Reguläres Release

Der verbindliche Ablauf steht in `RELEASE_CHECKLIST.md`. GitHub prüft nicht nur Quellcode und Tests,
sondern startet inzwischen auch das fertige Produktionsimage und ruft Oberfläche sowie Readiness
ab. Render deployt `main` erst nach erfolgreichen Checks und schaltet eine neue Instanz erst nach
erfolgreichem `/health/ready` frei.

## Anwendung zurückrollen

Ein Rollback ist passend, wenn die Anwendung nach einem Release fehlerhaft ist, die Datenbank aber
intakt ist:

1. Render öffnen, Webdienst `athletica-log` und **Events** wählen.
2. Den letzten nachweislich funktionierenden Deploy auswählen und **Rollback** auslösen.
3. Warten, bis `/health/ready` erfolgreich ist.
4. Smoke-Test ausführen und Login sowie die betroffene Funktion prüfen.
5. Den Fehler über einen neuen Branch beheben. Automatische Deployments erst danach wieder
   aktivieren, falls Render sie beim Dashboard-Rollback deaktiviert hat.

Wichtig: Ein Anwendungsrollback setzt weder Datenbankinhalte noch bereits ausgeführte Migrationen
zurück. Deshalb bleiben Migrationen zunächst abwärtskompatibel; Spalten oder Tabellen werden erst
in einem späteren, separat abgesicherten Release entfernt.

## Datenbank sichern

Die bezahlte Render-PostgreSQL-Datenbank besitzt Point-in-Time-Recovery. Render nennt aktuell drei
Tage Wiederherstellungsfenster für Hobby-Workspaces und sieben Tage ab Pro; maßgeblich ist immer die
Anzeige unter **Database > Recovery**. Für einen tragbaren Stand wird dort **Create export** gewählt
und die fertige `.dir.tar.gz`-Datei außerhalb von Render sicher gespeichert. Render hält einen
solchen Export sieben Tage zum Download bereit.

Mindestroutine:

- monatlich einen logischen Export erzeugen, herunterladen und das Erstellungsdatum dokumentieren;
- unmittelbar vor einer potenziell destruktiven Migration einen neuen Export erzeugen;
- vierteljährlich die Wiederherstellung in eine getrennte Testdatenbank üben;
- Exportdateien wie personenbezogene Trainingsdaten behandeln und nicht in Git oder Cloud-Ordner
  ohne geeignete Zugriffskontrolle legen.

## Datenbank wiederherstellen

Eine Wiederherstellung verändert Abrechnung und Verbindungsziele und wird daher nie nebenbei
ausgeführt:

1. Schreibzugriffe stoppen beziehungsweise ein Wartungsfenster ankündigen.
2. In **Database > Recovery** einen Zeitpunkt kurz vor dem Vorfall auswählen.
3. Render eine **neue** Recovery-Datenbank erstellen lassen; die bestehende Datenbank nicht löschen.
4. Inhalt und Schema der neuen Datenbank isoliert prüfen.
5. Erst nach Freigabe `DATABASE_URL` auf die Recovery-Datenbank umstellen und neu deployen.
6. Smoke-Test, Anmeldung und stichprobenartig Trainingsdaten jedes betroffenen Kontos prüfen.
7. Die ursprüngliche Datenbank erst nach dokumentierter Abnahme stilllegen.

Eine Recovery-Datenbank ist eine zusätzliche kostenpflichtige Ressource. Sie wird nur nach
ausdrücklicher Freigabe angelegt. Bei reinem Anwendungsfehler wird stattdessen das
Anwendungsrollback verwendet.

## Störung einordnen

| Beobachtung | Erste Prüfung | Typische Maßnahme |
| --- | --- | --- |
| Startseite nicht erreichbar | DNS/HTTPS und `/health/live` | Render Events und Logs prüfen |
| `/health/live` grün, `/health/ready` rot | Datenbankstatus und Logs | Verbindung prüfen, keine Deploy-Schleife starten |
| Fehler direkt nach Release | angezeigte `release` mit GitHub vergleichen | Anwendung zurückrollen |
| Trainingsdaten fehlen oder wurden verändert | betroffene Konten und Zeitpunkt feststellen | Schreibzugriff stoppen, Recovery vorbereiten |
| Einzelner Request schlägt fehl | `X-Request-ID` der Antwort notieren | Render-Logs nach derselben ID durchsuchen |

Bei jedem Vorfall werden Beginn, Auswirkung, ausgeführte Schritte und Abschluss kurz dokumentiert.

## Offizielle Plattformdokumentation

- [Render Health Checks](https://render.com/docs/health-checks)
- [Render Postgres Recovery and Backups](https://render.com/docs/postgresql-backups)
- [Render Rollbacks](https://render.com/docs/rollbacks)
