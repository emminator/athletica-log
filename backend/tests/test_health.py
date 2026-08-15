from fastapi.testclient import TestClient

from app.config import Settings


def test_liveness(client: TestClient) -> None:
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_identity(client: TestClient) -> None:
    response = client.get("/api/v1")
    assert response.json()["name"] == "Athletica Log API"


def test_render_database_url_uses_psycopg_driver() -> None:
    settings = Settings(database_url="postgresql://user:password@database:5432/athletica")
    assert settings.database_url == (
        "postgresql+psycopg://user:password@database:5432/athletica"
    )
