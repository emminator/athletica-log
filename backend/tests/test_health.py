import json
import logging

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.observability import JsonLogFormatter, request_logger

TEST_ERROR_PATH = "/_test/unexpected-error"
TEST_HTTP_ERROR_PATH = "/_test/expected-http-error"


def unexpected_error() -> None:
    raise RuntimeError("expected test error")


def expected_http_error() -> None:
    raise HTTPException(status_code=409, detail="expected conflict")


app.add_api_route(TEST_ERROR_PATH, unexpected_error, methods=["GET"])
app.add_api_route(TEST_HTTP_ERROR_PATH, expected_http_error, methods=["GET"])


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
    monkeypatch.setattr(settings, "hsts_enabled", True)
    monkeypatch.setattr(settings, "render_git_commit", "1234567890abcdef")

    response = client.get("/health/live", headers={"CF-Ray": "render-request-id"})

    assert response.json()["release"] == "1234567890ab"
    assert response.headers["strict-transport-security"] == "max-age=31536000"
    assert response.headers["x-request-id"] != "render-request-id"


def test_hsts_is_independent_from_secure_session_cookies(
    client: TestClient, monkeypatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "session_cookie_secure", True)
    monkeypatch.setattr(settings, "hsts_enabled", False)
    assert "strict-transport-security" not in client.get("/health/live").headers

    monkeypatch.setattr(settings, "session_cookie_secure", False)
    monkeypatch.setattr(settings, "hsts_enabled", True)
    assert client.get("/health/live").headers["strict-transport-security"] == (
        "max-age=31536000"
    )


def test_request_id_is_stored_on_request_and_cf_ray_is_logged_separately(
    client: TestClient,
) -> None:
    records: list[logging.LogRecord] = []

    class RecordingHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = RecordingHandler()
    request_logger.addHandler(handler)
    try:
        response = client.get("/api/v1", headers={"CF-Ray": "cloudflare-ray-id"})
    finally:
        request_logger.removeHandler(handler)

    request_id = response.headers["x-request-id"]
    assert request_id != "cloudflare-ray-id"
    record = records[-1]
    assert record.request_id == request_id
    assert record.cf_ray == "cloudflare-ray-id"
    assert record.method == "GET"
    assert record.path == "/api/v1"
    assert record.status == 200
    assert isinstance(record.duration_ms, float)
    structured_log = json.loads(JsonLogFormatter().format(record))
    assert structured_log["request_id"] == request_id
    assert structured_log["cf_ray"] == "cloudflare-ray-id"


def test_unexpected_error_returns_request_id_and_safe_response() -> None:
    records: list[logging.LogRecord] = []

    class RecordingHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = RecordingHandler()
    request_logger.addHandler(handler)
    try:
        with TestClient(app, raise_server_exceptions=False) as error_client:
            response = error_client.get(TEST_ERROR_PATH)
    finally:
        request_logger.removeHandler(handler)

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert response.headers["x-request-id"] == records[-1].request_id
    assert records[-1].status == 500
    assert records[-1].exc_info is not None
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_expected_http_error_is_not_replaced_by_global_error_handler(
    client: TestClient,
) -> None:
    response = client.get(TEST_HTTP_ERROR_PATH)

    assert response.status_code == 409
    assert response.json() == {"detail": "expected conflict"}
    assert response.headers["x-request-id"]


def test_cache_policy_has_explicit_route_boundaries(client: TestClient) -> None:
    assert client.get("/api/v1/auth/session").headers["cache-control"] == "no-store"
    assert client.get("/health/live").headers["cache-control"] == "no-store"
    assert "cache-control" not in client.get("/api/v1").headers
    assert "cache-control" not in client.get("/healthcheck").headers
    assert "cache-control" not in client.get("/api/v1/authentication").headers


def test_cross_origin_writes_are_rejected_with_request_id(
    client: TestClient, monkeypatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "backend_cors_origins", "https://athletica.example")

    rejected_origin = client.post(
        "/api/v1/auth/login",
        headers={"Origin": "https://attacker.example"},
        json={},
    )
    rejected_fetch = client.post(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://athletica.example",
            "Sec-Fetch-Site": "cross-site",
        },
        json={},
    )
    allowed_origin = client.post(
        "/api/v1/auth/login",
        headers={"Origin": "https://athletica.example"},
        json={},
    )

    assert rejected_origin.status_code == 403
    assert rejected_origin.json() == {"detail": "Cross-origin request rejected"}
    assert rejected_origin.headers["x-request-id"]
    assert rejected_fetch.status_code == 403
    assert allowed_origin.status_code == 422


def test_non_browser_clients_without_origin_headers_remain_supported(
    client: TestClient,
) -> None:
    assert client.post("/api/v1/auth/login", json={}).status_code == 422


def test_api_identity(client: TestClient) -> None:
    response = client.get("/api/v1")
    assert response.json()["name"] == "Athletica Log API"
    assert response.json()["release"] == "development"


def test_render_database_url_uses_psycopg_driver() -> None:
    settings = Settings(database_url="postgresql://user:password@database:5432/athletica")
    assert settings.database_url == (
        "postgresql+psycopg://user:password@database:5432/athletica"
    )


@pytest.mark.parametrize(
    ("app_release", "render_git_commit", "expected"),
    [
        ("v1.2.3", "1234567890abcdef", "v1.2.3"),
        ("", "1234567890abcdef", "1234567890ab"),
        ("  ", "  ", "development"),
    ],
)
def test_release_identifier_priority(
    app_release: str, render_git_commit: str, expected: str
) -> None:
    settings = Settings(app_release=app_release, render_git_commit=render_git_commit)
    assert settings.release_version == expected
