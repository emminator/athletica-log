# Produktivbetrieb auf Render

Athletica Log wird als ein Docker-Webdienst zusammen mit einer verwalteten PostgreSQL-Datenbank
in der Render-Region Frankfurt betrieben. Das Frontend wird beim Image-Build statisch erzeugt und
von FastAPI unter derselben Domain wie die API ausgeliefert.

## Sicherheitsmodell

- Alle Trainingsendpunkte benötigen eine gültige Anmeldung.
- Das Passwort liegt nur als scrypt-Hash in Render, niemals im Repository.
- Die Sitzung wird mit einem zufälligen Render-Secret signiert und als HttpOnly-, Secure- und
  SameSite-Strict-Cookie gespeichert.
- Healthchecks bleiben ohne Anmeldung erreichbar; die API-Dokumentation ist produktiv deaktiviert.
- Die Datenbank ist nur über das private Render-Netzwerk erreichbar.

## Passwort-Hash erzeugen

Das Produktivpasswort wird interaktiv innerhalb des bestehenden Backend-Containers gehasht:

```powershell
docker compose exec backend python -m app.auth hash-password
```

Nur die ausgegebene Zeile wird beim ersten Blueprint-Setup als `AUTH_PASSWORD_HASH` hinterlegt.
Das Klartextpasswort wird nicht gespeichert oder an GitHub übertragen.

## Ersteinrichtung

1. In Render ein Konto beziehungsweise einen Workspace mit GitHub verbinden.
2. Ein neues Blueprint aus dem privaten Repository `emminator/athletica-log` erstellen.
3. Die von `render.yaml` vorgeschlagenen Ressourcen und Kosten kontrollieren.
4. Den zuvor erzeugten Passwort-Hash als `AUTH_PASSWORD_HASH` eintragen.
5. Den Blueprint anlegen und den ersten erfolgreichen Deploy abwarten.
6. In ALL-INKL für `athletica.emminger-net.de` einen CNAME auf den von Render angezeigten
   `*.onrender.com`-Namen setzen.
7. Die Custom Domain in Render verifizieren und HTTPS, Anmeldung, Schreiben und Lesen prüfen.
8. Erst nach erfolgreichem Domain-Test kann die öffentliche `onrender.com`-Adresse deaktiviert
   werden.

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

- Neue Änderungen werden lokal entwickelt und vollständig über Docker geprüft.
- Produktive Geheimnisse werden ausschließlich in Render verwaltet.
- Datenbankmigrationen müssen abwärtskompatibel sein und vor dem Merge getestet werden.
- Vor riskanten Datenänderungen wird ein aktuelles Backup beziehungsweise Restore-Fenster geprüft.
- Der Render-Status und fehlgeschlagene GitHub-Checks werden bei Deployments kontrolliert.
