from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import get_settings
from app.models import User


def test_create_exercise_and_workout(client: TestClient) -> None:
    exercise_response = client.post(
        "/api/v1/exercises",
        json={"name": "Kniebeuge", "muscle_group": "Beine", "activity_type": "strength"},
    )
    assert exercise_response.status_code == 201
    exercise_id = exercise_response.json()["id"]

    workout_response = client.post(
        "/api/v1/workouts",
        json={
            "performed_on": "2026-08-01",
            "title": "Unterkörper A",
            "notes": "Gute Einheit",
            "sets": [
                {"exercise_id": exercise_id, "repetitions": 8, "weight_kg": 80, "effort_rpe": 8},
                {"exercise_id": exercise_id, "repetitions": 8, "weight_kg": 80},
            ],
        },
    )
    assert workout_response.status_code == 201
    assert len(workout_response.json()["sets"]) == 2
    assert workout_response.json()["sets"][0]["exercise"]["name"] == "Kniebeuge"


def test_rejects_duplicate_exercise(client: TestClient) -> None:
    payload = {"name": "Bankdrücken", "activity_type": "strength"}
    assert client.post("/api/v1/exercises", json=payload).status_code == 201
    assert client.post("/api/v1/exercises", json=payload).status_code == 409


def test_rejects_empty_set(client: TestClient) -> None:
    response = client.post(
        "/api/v1/workouts",
        json={
            "performed_on": "2026-08-01",
            "title": "Ungültig",
            "sets": [{"exercise_id": "00000000-0000-0000-0000-000000000000"}],
        },
    )
    assert response.status_code == 422


def test_updates_and_deletes_workout(client: TestClient) -> None:
    exercise = client.post(
        "/api/v1/exercises",
        json={"name": "Rudern", "muscle_group": "Rücken", "activity_type": "strength"},
    ).json()
    workout = client.post(
        "/api/v1/workouts",
        json={
            "performed_on": "2026-08-01",
            "title": "Pull A",
            "sets": [{"exercise_id": exercise["id"], "repetitions": 10, "weight_kg": 60}],
        },
    ).json()

    update_response = client.put(
        f"/api/v1/workouts/{workout['id']}",
        json={
            "performed_on": "2026-08-02",
            "title": "Pull B",
            "sets": [{"exercise_id": exercise["id"], "repetitions": 8, "weight_kg": 65}],
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Pull B"
    assert float(update_response.json()["sets"][0]["weight_kg"]) == 65.0

    delete_response = client.delete(f"/api/v1/workouts/{workout['id']}")
    assert delete_response.status_code == 204
    assert client.get("/api/v1/workouts").json() == []


def test_users_only_access_their_own_training_data(
    client: TestClient, db: Session, monkeypatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "session_cookie_secure", False)
    for username in ("alice", "bob"):
        db.add(
            User(
                username=username,
                password_hash=hash_password(f"{username}-password-123"),
                is_admin=False,
                is_active=True,
            )
        )
    db.commit()

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "alice", "password": "alice-password-123"},
        ).status_code
        == 200
    )
    alice_exercise = client.post(
        "/api/v1/exercises",
        json={"name": "Kniebeuge", "muscle_group": "Beine", "activity_type": "strength"},
    ).json()
    alice_workout = client.post(
        "/api/v1/workouts",
        json={
            "performed_on": "2026-08-20",
            "title": "Alice Beine",
            "sets": [{"exercise_id": alice_exercise["id"], "repetitions": 8, "weight_kg": 80}],
        },
    ).json()
    client.post("/api/v1/auth/logout")

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "bob", "password": "bob-password-123"},
        ).status_code
        == 200
    )
    bob_exercise_response = client.post(
        "/api/v1/exercises",
        json={"name": "Kniebeuge", "muscle_group": "Beine", "activity_type": "strength"},
    )
    assert bob_exercise_response.status_code == 201
    assert client.get("/api/v1/exercises").json() == [bob_exercise_response.json()]
    assert client.get("/api/v1/workouts").json() == []

    foreign_payload = {
        "performed_on": "2026-08-20",
        "title": "Fremde Übung",
        "sets": [{"exercise_id": alice_exercise["id"], "repetitions": 8, "weight_kg": 80}],
    }
    assert client.post("/api/v1/workouts", json=foreign_payload).status_code == 422
    assert (
        client.put(f"/api/v1/workouts/{alice_workout['id']}", json=foreign_payload).status_code
        == 404
    )
    assert client.delete(f"/api/v1/workouts/{alice_workout['id']}").status_code == 404

    client.post("/api/v1/auth/logout")
    client.post(
        "/api/v1/auth/login",
        json={"username": "alice", "password": "alice-password-123"},
    )
    assert [workout["id"] for workout in client.get("/api/v1/workouts").json()] == [
        alice_workout["id"]
    ]
