# Five-minute reviewer walkthrough

Athletica Log is a production-deployed strength-training logger. This short tour
focuses on the product's core workflow and a few engineering decisions behind it.

## Access

- Open [athletica.emminger-net.de](https://athletica.emminger-net.de).
- Use the dedicated non-admin reviewer credentials supplied through a private
  channel. Credentials are intentionally not stored in this repository.
- Select **EN** if the English interface is not already active.

The reviewer account contains synthetic data only and is isolated from every
other user's exercises and workouts.

## Suggested tour

### 1. Review a progression

In **Training history**, expand **Full Body A · Progression**. Compare its sets
with the earlier **Full Body A** session. The history shows exercises, weight,
repetitions, RPE, and calculated total load.

### 2. Prepare a workout from history

Choose **Duplicate** on **Full Body A**. The application copies its title,
exercises, sets, weight, repetitions, and RPE into an editable form and changes
the date to today. Change any field to see that the new session is independent,
then choose **Cancel** to leave the shared demo dataset unchanged.

### 3. Inspect last-performance assistance

In a new workout, select an exercise. Athletica displays the most recent result
and prefills the set so the next training entry starts from a useful baseline.
Avoid saving if the shared dataset should remain unchanged.

## Engineering points worth inspecting

- One production container serves the Next.js static export and FastAPI API from
  the same origin.
- User-owned data is scoped server-side; the reviewer account has no access to
  administrator controls or another user's records.
- GitHub Actions runs backend and frontend quality checks and smoke-tests the
  production image before Render can deploy `main`.
- Health endpoints, release identifiers, structured request logging, migrations,
  backups, and recovery procedures support continued operation after launch.

## Intentional boundaries

This is a focused MVP. Workout planning, deeper analytics, historical import,
and offline-first entry remain future product increments rather than unfinished
parts of the core logging workflow.
