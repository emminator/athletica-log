# Athletica Log

Athletica Log ist eine private Anwendung zum Erfassen, Auswerten und Planen sportlicher
Aktivitäten mit Schwerpunkt Krafttraining im Gym.

## Produktziel

Die erste Version soll fünf Fragen zuverlässig beantworten:

1. Was habe ich trainiert?
2. Welche Übungen, Gewichte, Wiederholungen und Sätze habe ich absolviert?
3. Wie entwickeln sich Kraft, Volumen und Trainingshäufigkeit?
4. Was steht als Nächstes im Trainingsplan?
5. Wo entstehen persönliche Bestleistungen oder längerfristige Plateaus?

## Technische Basis

- Next.js/React und TypeScript für die Weboberfläche
- FastAPI und Python für die API und Geschäftslogik
- PostgreSQL für Übungen, Pläne und Trainingsdaten
- Docker Compose für die lokale Entwicklungsumgebung
- Pytest, Vitest, Ruff, ESLint und TypeScript für Qualitätskontrollen

## Lokaler Start

Nach Installation von Docker Desktop:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Anschließend:

- Anwendung: http://localhost:3000
- API-Dokumentation: http://localhost:8000/docs
- API-Status: http://localhost:8000/health/ready

## Aktueller Umfang

Das Projekt enthält ein professionelles Grundgerüst und den ersten durchgängigen MVP-Schnitt:
Übungen können angelegt und Trainingseinheiten mit mehreren Sätzen, Gewicht, Wiederholungen und
RPE gespeichert werden. Einladungsbasierte Benutzerkonten trennen Übungen und Trainingsdaten
konsequent pro Person. Nutzer können ihr Passwort selbst ändern; Administratoren können Testkonten
deaktivieren, ohne deren Trainingsdaten zu löschen. Trainingshistorie, Diagramme und Planung folgen
in kleinen, testbaren Schritten.

Beim Start wendet das Backend ausstehende Datenbankmigrationen automatisch an. Manuell lässt sich
der aktuelle Stand mit `docker compose exec backend alembic current` kontrollieren.

## Produktivbetrieb

Die vorgesehene Render-Konfiguration liegt in `render.yaml`. Sie erstellt einen Docker-Webdienst
und eine private PostgreSQL-Datenbank in Frankfurt und veröffentlicht die Anwendung unter
`athletica.emminger-net.de`. Einrichtung, Login-Sicherheit und CI/CD-Ablauf sind in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) beschrieben.
