from fastapi.testclient import TestClient

from app.auth import SESSION_COOKIE, create_session_token, hash_password, session_username
from app.config import get_settings


def test_protected_api_requires_login(client: TestClient, monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "auth_password_hash", hash_password("a-strong-test-password"))
    monkeypatch.setattr(settings, "session_secret", "test-session-secret-with-enough-entropy")

    assert client.get("/health/live").status_code == 200
    assert client.get("/api/v1/exercises").status_code == 401

    failed_login = client.post(
        "/api/v1/auth/login", json={"username": "athletica", "password": "wrong-password"}
    )
    assert failed_login.status_code == 401

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "athletica", "password": "a-strong-test-password"},
    )
    assert login.status_code == 200
    assert login.json() == {"authenticated": True, "username": "athletica"}
    assert SESSION_COOKIE in client.cookies
    assert client.get("/api/v1/exercises").status_code == 200

    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/exercises").status_code == 401


def test_session_tokens_reject_tampering_and_expiration(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "session_secret", "test-session-secret-with-enough-entropy")
    monkeypatch.setattr(settings, "session_max_age_seconds", 60)

    token = create_session_token(settings.auth_username, settings, now=1_000)
    assert session_username(token, settings, now=1_030) == settings.auth_username
    assert session_username(f"{token}tampered", settings, now=1_030) is None
    assert session_username(token, settings, now=1_061) is None
