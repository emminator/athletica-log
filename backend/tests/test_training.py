from fastapi.testclient import TestClient


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

