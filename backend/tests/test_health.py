from fastapi.testclient import TestClient

from app.config import Settings, get_settings


def test_liveness(client: TestClient) -> None:
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "release": "development"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == (
        "camera=(), microphone=(), geolocation=()"
    )
    assert response.headers["x-request-id"]
    assert "strict-transport-security" not in response.headers


def test_production_security_and_release_headers(client: TestClient, monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "session_cookie_secure", True)
    monkeypatch.setattr(settings, "render_git_commit", "1234567890abcdef")

    response = client.get("/health/live", headers={"CF-Ray": "render-request-id"})

    assert response.json()["release"] == "1234567890ab"
    assert response.headers["strict-transport-security"] == "max-age=31536000"
    assert response.headers["x-request-id"] == "render-request-id"


def test_api_identity(client: TestClient) -> None:
    response = client.get("/api/v1")
    assert response.json()["name"] == "Athletica Log API"
    assert response.json()["release"] == "development"


def test_render_database_url_uses_psycopg_driver() -> None:
    settings = Settings(database_url="postgresql://user:password@database:5432/athletica")
    assert settings.database_url == (
        "postgresql+psycopg://user:password@database:5432/athletica"
    )


def test_explicit_release_overrides_render_commit() -> None:
    settings = Settings(app_release="v1.2.3", render_git_commit="1234567890abcdef")
    assert settings.release_version == "v1.2.3"
