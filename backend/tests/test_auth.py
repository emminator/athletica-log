from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, hash_password, token_hash
from app.config import get_settings
from app.models import Invitation, User, UserSession


def enable_authentication(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "session_cookie_secure", False)


def add_user(db: Session, username: str, password: str, *, is_admin: bool = False) -> User:
    user = User(
        username=username,
        password_hash=hash_password(password),
        is_admin=is_admin,
        is_active=True,
    )
    db.add(user)
    db.commit()
    return user


def test_protected_api_requires_database_login(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    add_user(db, "athletica", "a-strong-test-password", is_admin=True)

    assert client.get("/health/live").status_code == 200
    assert client.get("/api/v1/exercises").status_code == 401

    failed_login = client.post(
        "/api/v1/auth/login", json={"username": "athletica", "password": "wrong-password"}
    )
    assert failed_login.status_code == 401

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "ATHLETICA", "password": "a-strong-test-password"},
    )
    assert login.status_code == 200
    assert login.json() == {
        "authenticated": True,
        "username": "athletica",
        "is_admin": True,
    }
    assert SESSION_COOKIE in client.cookies
    assert db.scalar(select(UserSession)) is not None
    assert client.get("/api/v1/exercises").status_code == 200

    assert client.post("/api/v1/auth/logout").status_code == 204
    assert db.scalar(select(UserSession)) is None
    assert client.get("/api/v1/exercises").status_code == 401


def test_expired_session_is_rejected(client: TestClient, db: Session, monkeypatch) -> None:
    enable_authentication(monkeypatch)
    user = add_user(db, "athletica", "a-strong-test-password")
    raw_token = "expired-session-token"
    db.add(
        UserSession(
            token_hash=token_hash(raw_token),
            user_id=user.id,
            created_at=datetime.now(UTC) - timedelta(days=2),
            expires_at=datetime.now(UTC) - timedelta(days=1),
        )
    )
    db.commit()
    client.cookies.set(SESSION_COOKIE, raw_token)

    assert client.get("/api/v1/auth/session").status_code == 401


def test_admin_invitation_registers_user_once(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    add_user(db, "owner", "owner-test-password", is_admin=True)
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "owner-test-password"},
    )
    assert login.status_code == 200

    invitation_response = client.post(
        "/api/v1/auth/invitations", json={"expires_in_days": 3}
    )
    assert invitation_response.status_code == 201
    invitation_token = invitation_response.json()["token"]
    assert invitation_token not in db.scalar(select(Invitation)).token_hash

    client.post("/api/v1/auth/logout")
    registration = client.post(
        "/api/v1/auth/register",
        json={
            "invitation_token": invitation_token,
            "username": "Tester",
            "password": "tester-password-123",
        },
    )
    assert registration.status_code == 201
    assert registration.json() == {
        "authenticated": True,
        "username": "tester",
        "is_admin": False,
    }
    assert client.get("/api/v1/auth/session").status_code == 200

    client.post("/api/v1/auth/logout")
    reused = client.post(
        "/api/v1/auth/register",
        json={
            "invitation_token": invitation_token,
            "username": "another-tester",
            "password": "another-password-123",
        },
    )
    assert reused.status_code == 400


def test_non_admin_cannot_create_invitation(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    add_user(db, "tester", "tester-password-123")
    client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    )

    assert client.post("/api/v1/auth/invitations", json={}).status_code == 403


def test_user_changes_password_and_all_sessions_are_revoked(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    user = add_user(db, "tester", "tester-password-123")
    client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    )

    incorrect = client.post(
        "/api/v1/auth/password",
        json={"current_password": "wrong-password", "new_password": "new-password-456"},
    )
    assert incorrect.status_code == 400
    assert db.scalar(select(UserSession).where(UserSession.user_id == user.id)) is not None

    unchanged = client.post(
        "/api/v1/auth/password",
        json={
            "current_password": "tester-password-123",
            "new_password": "tester-password-123",
        },
    )
    assert unchanged.status_code == 400

    changed = client.post(
        "/api/v1/auth/password",
        json={
            "current_password": "tester-password-123",
            "new_password": "new-password-456",
        },
    )
    assert changed.status_code == 204
    assert db.scalar(select(UserSession).where(UserSession.user_id == user.id)) is None
    assert client.get("/api/v1/auth/session").status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "new-password-456"},
    ).status_code == 200


def test_admin_lists_and_deactivates_testers(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    admin = add_user(db, "owner", "owner-test-password", is_admin=True)
    tester = add_user(db, "tester", "tester-password-123")
    client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "owner-test-password"},
    )

    users = client.get("/api/v1/auth/users")
    assert users.status_code == 200
    assert [(item["username"], item["is_active"]) for item in users.json()] == [
        ("owner", True),
        ("tester", True),
    ]

    deactivated = client.patch(
        f"/api/v1/auth/users/{tester.id}", json={"is_active": False}
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    assert db.scalar(select(UserSession).where(UserSession.user_id == tester.id)) is None
    assert db.scalar(select(UserSession).where(UserSession.user_id == admin.id)) is not None
    assert client.patch(
        f"/api/v1/auth/users/{admin.id}", json={"is_active": False}
    ).status_code == 400
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    ).status_code == 401

    reactivated = client.patch(
        f"/api/v1/auth/users/{tester.id}", json={"is_active": True}
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    ).status_code == 200


def test_non_admin_cannot_manage_users(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    tester = add_user(db, "tester", "tester-password-123")
    client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    )

    assert client.get("/api/v1/auth/users").status_code == 403
    assert client.patch(
        f"/api/v1/auth/users/{tester.id}", json={"is_active": False}
    ).status_code == 403
