from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, hash_password, token_hash
from app.config import get_settings
from app.models import Invitation, PasswordReset, User, UserSession


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
        json={"username": "athletica", "password": "a-strong-test-password"},
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
            "username": "tester",
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


@pytest.mark.parametrize(
    "username",
    ["Tester", " tester", "tester ", "new tester", "new%tester", "_tester"],
)
def test_username_rules_are_enforced_for_all_auth_clients(
    client: TestClient, username: str
) -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "a-strong-test-password"},
    )
    registration = client.post(
        "/api/v1/auth/register",
        json={
            "invitation_token": "valid-length-invitation-token-123",
            "username": username,
            "password": "a-strong-test-password",
        },
    )

    assert login.status_code == 422
    assert registration.status_code == 422


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


def test_admin_lists_and_revokes_open_invitations(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    add_user(db, "owner", "owner-test-password", is_admin=True)
    client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "owner-test-password"},
    )

    created = client.post("/api/v1/auth/invitations", json={"expires_in_days": 7})
    assert created.status_code == 201
    invitation_id = created.json()["id"]
    invitation_token = created.json()["token"]

    invitations = client.get("/api/v1/auth/invitations")
    assert invitations.status_code == 200
    assert len(invitations.json()) == 1
    assert invitations.json()[0]["id"] == invitation_id
    assert invitations.json()[0]["expires_at"] == created.json()["expires_at"]
    assert set(invitations.json()[0]) == {"id", "created_at", "expires_at"}
    assert invitation_token not in invitations.text
    assert "token_hash" not in invitations.text

    revoked = client.delete(f"/api/v1/auth/invitations/{invitation_id}")
    assert revoked.status_code == 204
    assert db.get(Invitation, UUID(invitation_id)).revoked_at is not None
    assert client.get("/api/v1/auth/invitations").json() == []
    assert client.post(
        "/api/v1/auth/register",
        json={
            "invitation_token": invitation_token,
            "username": "tester",
            "password": "tester-password-123",
        },
    ).status_code == 400


def test_password_reset_is_single_use_and_revokes_sessions(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    owner = add_user(db, "owner", "owner-test-password", is_admin=True)
    tester = add_user(db, "tester", "tester-password-123")
    client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    )
    assert db.scalar(select(UserSession).where(UserSession.user_id == tester.id)) is not None
    client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "owner-test-password"},
    )

    created = client.post(
        f"/api/v1/auth/users/{tester.id}/password-resets",
        json={"expires_in_hours": 2},
    )
    assert created.status_code == 201
    reset_token = created.json()["token"]
    reset = db.scalar(select(PasswordReset).where(PasswordReset.user_id == tester.id))
    assert reset is not None
    assert reset.created_by_id == owner.id
    assert reset_token not in reset.token_hash

    client.post("/api/v1/auth/logout")
    unchanged = client.post(
        "/api/v1/auth/password-reset",
        json={"reset_token": reset_token, "new_password": "tester-password-123"},
    )
    assert unchanged.status_code == 400
    assert db.get(PasswordReset, reset.id).used_at is None
    changed = client.post(
        "/api/v1/auth/password-reset",
        json={"reset_token": reset_token, "new_password": "new-password-456"},
    )
    assert changed.status_code == 204
    assert db.scalar(select(UserSession).where(UserSession.user_id == tester.id)) is None
    assert db.get(PasswordReset, reset.id).used_at is not None
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "new-password-456"},
    ).status_code == 200
    assert client.post(
        "/api/v1/auth/password-reset",
        json={"reset_token": reset_token, "new_password": "third-password-789"},
    ).status_code == 400


def test_password_reset_replaces_previous_link_and_protects_admins(
    client: TestClient, db: Session, monkeypatch
) -> None:
    enable_authentication(monkeypatch)
    owner = add_user(db, "owner", "owner-test-password", is_admin=True)
    tester = add_user(db, "tester", "tester-password-123")
    client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "owner-test-password"},
    )

    first = client.post(f"/api/v1/auth/users/{tester.id}/password-resets", json={})
    second = client.post(f"/api/v1/auth/users/{tester.id}/password-resets", json={})
    assert first.status_code == 201
    assert second.status_code == 201
    assert client.post(
        "/api/v1/auth/password-reset",
        json={"reset_token": first.json()["token"], "new_password": "new-password-456"},
    ).status_code == 400
    assert client.post(
        f"/api/v1/auth/users/{owner.id}/password-resets", json={}
    ).status_code == 400

    client.post("/api/v1/auth/logout")
    client.post(
        "/api/v1/auth/login",
        json={"username": "tester", "password": "tester-password-123"},
    )
    assert client.post(
        f"/api/v1/auth/users/{tester.id}/password-resets", json={}
    ).status_code == 403
    assert client.get("/api/v1/auth/invitations").status_code == 403
