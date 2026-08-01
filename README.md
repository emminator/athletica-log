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

Das Projekt enthält zunächst ein professionelles Grundgerüst und ein erstes Domänenmodell.
Anmeldung, echte Datenerfassung und Diagramme werden in kleinen, testbaren Schritten ergänzt.

