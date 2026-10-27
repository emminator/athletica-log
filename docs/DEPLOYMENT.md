# Produktivbetrieb auf Render

Athletica Log wird als ein Docker-Webdienst zusammen mit einer verwalteten PostgreSQL-Datenbank
in der Render-Region Frankfurt betrieben. Das Frontend wird beim Image-Build statisch erzeugt und
von FastAPI unter derselben Domain wie die API ausgeliefert.

## Sicherheitsmodell

- Alle Trainingsendpunkte benötigen eine gültige Anmeldung.
- Passwörter liegen nur als gesalzene scrypt-Hashes in PostgreSQL, niemals im Repository.
- Sitzungen verwenden zufällige, nur gehasht gespeicherte Tokens. Der Browser erhält ausschließlich
  ein HttpOnly-, Secure- und SameSite-Strict-Cookie.
- Fehlgeschlagene Anmeldungen werden serverseitig und instanzübergreifend pro Benutzerkennung
  gedrosselt. Auch unbekannte Kennungen durchlaufen denselben Passwortprüfpfad, damit Antwortzeiten
  keine gültigen Benutzernamen verraten.
- Schreibende Browser-Anfragen mit fremder Origin oder `Sec-Fetch-Site: cross-site` werden
  abgewiesen. Kommandozeilen- und Betriebszugriffe ohne Browser-Herkunftsheader bleiben möglich.
- HSTS wird produktiv unabhängig von der Cookie-Konfiguration über `HSTS_ENABLED` aktiviert.
- Übungen und Trainings tragen eine Benutzer-ID; jede API-Abfrage erzwingt den angemeldeten Besitzer.
- Neue Konten entstehen nur über zeitlich begrenzte, einmal verwendbare Einladungen eines Admins.
- Einladungs- und Passwort-Reset-Tokens liegen ausschließlich als SHA-256-Hash in der Datenbank.
  Neue Reset-Links widerrufen automatisch noch offene ältere Links desselben Testers.
- Healthchecks bleiben ohne Anmeldung erreichbar; die API-Dokumentation ist produktiv deaktiviert.
- Ein globaler Fehlerhandler vereinheitlicht ausschließlich unerwartete Fehler als generische
  HTTP-500-Antwort und liefert dabei dieselbe Request-ID wie das strukturierte Fehlerlog.
  Spezifische FastAPI-/Starlette-Fehler wie 401, 404 oder Validierungsfehler bleiben unverändert.
- Die Datenbank ist nur über das private Render-Netzwerk erreichbar.

## Passwort-Hash erzeugen

Das Produktivpasswort wird interaktiv innerhalb des bestehenden Backend-Containers gehasht:

```powershell
docker compose exec backend python -m app.auth hash-password
```

Nur die ausgegebene Zeile wird beim ersten Blueprint-Setup als `AUTH_PASSWORD_HASH` hinterlegt.
Die erste Mehrbenutzer-Migration legt damit das Administratorkonto an und ordnet ihm alle bereits
vorhandenen Übungen und Trainings zu. Das Klartextpasswort wird nicht gespeichert oder an GitHub
übertragen.

Ein bestehender Benutzer kann lokal interaktiv ein neues Passwort erhalten:

```powershell
docker compose exec backend python -m app.auth set-password --username athletica
```

## Tester einladen

Nach der Anmeldung sieht ein Administrator die Aktion **Tester einladen**. Sie erzeugt einen sieben
Tage gültigen, einmal verwendbaren Link. Der Tester wählt darüber selbst Benutzername und Passwort.
Der Link ist wie ein temporäres Zugangsdokument zu behandeln und nur an die vorgesehene Person zu
übermitteln. Das Einladungstoken liegt im Fragmentteil der URL und wird dadurch nicht an den
Webserver oder dessen Zugriffsprotokoll übertragen. Unter **Konto** werden alle noch gültigen,
unbenutzten Einladungen angezeigt und können widerrufen werden. Der Klartext-Link kann nach dem
Schließen nicht erneut aus der Datenbank ausgelesen werden; bei Bedarf wird eine neue Einladung
erstellt.

## Konten verwalten

Jeder angemeldete Nutzer kann unter **Konto** sein Passwort ändern. Dafür ist das aktuelle Passwort
erforderlich; das neue Passwort muss mindestens zwölf Zeichen lang und vom bisherigen verschieden
sein. Nach einem erfolgreichen Wechsel werden sämtliche Sitzungen dieses Kontos widerrufen und eine
erneute Anmeldung verlangt.

Administratoren sehen unter **Konto** außerdem alle Konten. Tester können dort deaktiviert und später
wieder aktiviert werden. Eine Deaktivierung beendet sofort sämtliche Sitzungen, löscht aber weder
Übungen noch Trainingsdaten. Administratorkonten können über diese Oberfläche nicht deaktiviert
werden, damit der administrative Zugang nicht versehentlich verloren geht.

Für ein aktives Testkonto kann ein Administrator einen eine Stunde gültigen Einmal-Link zum
Zurücksetzen des Passworts erzeugen. Der Reset-Link wird wie eine Einladung über das URL-Fragment
übertragen und nur unmittelbar nach dem Erstellen angezeigt. Ein neuer Link widerruft ältere offene
Reset-Links für dieses Konto. Nach dem erfolgreichen Zurücksetzen werden alle Sitzungen des Testers
beendet. Deaktivierte Tester und Administratorkonten können über diese Oberfläche keinen Reset-Link
erhalten; für das Administratorkonto bleibt der interaktive `set-password`-Befehl der kontrollierte
Wiederherstellungsweg.

## Ersteinrichtung

1. In Render ein Konto beziehungsweise einen Workspace mit GitHub verbinden.
2. Ein neues Blueprint aus dem Repository `emminator/athletica-log` erstellen.
3. Die von `render.yaml` vorgeschlagenen Ressourcen und Kosten kontrollieren.
4. Den zuvor erzeugten Passwort-Hash als `AUTH_PASSWORD_HASH` eintragen.
5. Den Blueprint anlegen und den ersten erfolgreichen Deploy abwarten.
6. In ALL-INKL für `athletica.emminger-net.de` einen CNAME auf den von Render angezeigten
   `*.onrender.com`-Namen setzen.
7. Die Custom Domain in Render verifizieren und HTTPS, Anmeldung, Schreiben und Lesen prüfen.
8. Erst nach erfolgreichem Domain-Test kann die öffentliche `onrender.com`-Adresse deaktiviert
   werden.

Vor dem ersten Deployment der Mehrbenutzer-Migration muss ein aktuelles Datenbankbackup erstellt
und das verfügbare Wiederherstellungsfenster geprüft werden.

## CI/CD-Ablauf

GitHub Actions baut für jeden Pull Request und jeden Push nach `main` die Docker-Umgebung auf und
führt Ruff, Pytest, ESLint, TypeScript und Vitest aus. Zusätzlich wird das Produktionsimage gebaut.
Render deployt `main` erst, wenn die verknüpften Prüfungen erfolgreich sind. Vor dem Start einer
neuen Version führt Render `alembic upgrade head` aus; der Readiness-Check verhindert die
Freigabe einer Instanz ohne funktionierende Datenbankverbindung.

## Lokale TLS-Inspection

Wenn ein verwalteter Firmenrechner HTTPS-Verbindungen in Docker mit einer eigenen, lokal
vertrauenswürdigen Zertifizierungsstelle prüft, kann diese ausschließlich für den lokalen Build als
BuildKit-Secret übergeben werden:

```powershell
docker build --secret id=local_ca,src=C:\Pfad\zur\lokalen-ca.pem -t athletica-log .
```

Das Zertifikat wird nicht in den Build-Kontext oder das Repository kopiert. Ohne dieses Secret
verwendet das Image ausschließlich die normalen öffentlichen Zertifizierungsstellen, wie es in
GitHub Actions und Render der Fall ist. Zertifikatsprüfungen werden niemals deaktiviert.

## Betrieb

### Sicherheitsupdates für Images und Zertifikate

Nach Laufzeit- oder CA-Sicherheitsmeldungen die Basisimages mit `docker compose build --pull --no-cache`
und das Produktionsimage mit `docker build --pull --no-cache -t athletica-log:security-check .`
frisch bauen. Node.js muss mindestens die gepatchte Version 22.23.4 verwenden; Python benötigt
`certifi>=2026.10.19`. Die Dockerfiles aktualisieren zusätzlich die Systempakete und CA-Zertifikate.
Ein Containerneustart allein aktualisiert diese Bestandteile nicht.

`scripts/verify-ca-security.py` prüft normales HTTPS und die Ablehnung beider von Render genannten
eMudhra-Testendpunkte jeweils mit dem System- und Certifi-Zertifikatsspeicher. Die CI führt diese
Prüfung im fertigen Produktionsimage aus. Netzwerkfehler gelten dabei nicht als erfolgreicher
Nachweis. Für die abschließende Kontrolle dieselbe Prüfung auch in der laufenden Render-Umgebung
ausführen; ein lokaler erfolgreicher Test beweist deren Zustand nicht.

- Neue Änderungen werden lokal entwickelt und vollständig über Docker geprüft.
- Produktive Geheimnisse werden ausschließlich in Render verwaltet.
- Datenbankmigrationen müssen abwärtskompatibel sein und vor dem Merge getestet werden.
- Vor riskanten Datenänderungen wird ein aktuelles Backup beziehungsweise Restore-Fenster geprüft.
- Der Render-Status und fehlgeschlagene GitHub-Checks werden bei Deployments kontrolliert.
- Das tägliche Vorgehen, Monitoring, Backup und Rollback beschreibt
  [`OPERATIONS.md`](OPERATIONS.md). Vor jedem Release wird
  [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) verwendet.
