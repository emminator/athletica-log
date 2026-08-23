import argparse
import base64
import getpass
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, BeforeValidator, Field, StringConstraints
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import Invitation, PasswordReset, User, UserSession

SESSION_COOKIE = "athletica_session"
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
USERNAME_PATTERN = r"^[a-z0-9][a-z0-9._-]{2,31}$"


def normalize_username(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


Username = Annotated[
    str,
    StringConstraints(min_length=3, max_length=32, pattern=USERNAME_PATTERN),
    BeforeValidator(normalize_username),
]


class LoginRequest(BaseModel):
    username: Username
    password: str = Field(min_length=1, max_length=256)


class RegistrationRequest(BaseModel):
    invitation_token: str = Field(min_length=32, max_length=256)
    username: Username
    password: str = Field(min_length=12, max_length=256)


class InvitationCreate(BaseModel):
    expires_in_days: int = Field(default=7, ge=1, le=30)


class InvitationRead(BaseModel):
    id: UUID
    token: str
    expires_at: datetime


class InvitationSummary(BaseModel):
    id: UUID
    created_at: datetime
    expires_at: datetime


class PasswordResetCreate(BaseModel):
    expires_in_hours: int = Field(default=1, ge=1, le=24)


class PasswordResetRead(BaseModel):
    token: str
    expires_at: datetime


class PasswordResetRequest(BaseModel):
    reset_token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class UserActiveUpdate(BaseModel):
    is_active: bool


class UserRead(BaseModel):
    id: UUID
    username: str
    is_admin: bool
    is_active: bool
    created_at: datetime


class SessionRead(BaseModel):
    authenticated: bool
    username: str
    is_admin: bool


SettingsDependency = Annotated[Settings, Depends(get_settings)]
DatabaseSession = Annotated[Session, Depends(get_db)]
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str, salt: bytes | None = None) -> str:
    password_salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=password_salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_encode(password_salt)}${_encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = password_hash.split("$", 5)
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
        )
        return hmac.compare_digest(digest, _decode(expected))
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def get_or_create_bootstrap_user(db: Session, settings: Settings) -> User:
    username = settings.auth_username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    if user is not None:
        return user
    user = User(
        username=username,
        password_hash=settings.auth_password_hash,
        is_admin=True,
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            raise
    return user


def set_session_cookie(response: Response, user: User, db: Session, settings: Settings) -> None:
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    db.add(
        UserSession(
            token_hash=token_hash(raw_token),
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(seconds=settings.session_max_age_seconds),
        )
    )
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        raw_token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )


def current_user(request: Request, db: Session, settings: Settings) -> User | None:
    if not settings.auth_enabled:
        return get_or_create_bootstrap_user(db, settings)
    raw_token = request.cookies.get(SESSION_COOKIE)
    if not raw_token:
        return None
    now = datetime.now(UTC)
    statement = (
        select(User)
        .join(UserSession, UserSession.user_id == User.id)
        .where(
            UserSession.token_hash == token_hash(raw_token),
            UserSession.expires_at > now,
            User.is_active.is_(True),
        )
    )
    return db.scalar(statement)


def require_authenticated(
    request: Request, db: DatabaseSession, settings: SettingsDependency
) -> User:
    user = current_user(request, db, settings)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return user


AuthenticatedUser = Annotated[User, Depends(require_authenticated)]


def session_read(user: User) -> SessionRead:
    return SessionRead(authenticated=True, username=user.username, is_admin=user.is_admin)


def require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.get("/session", response_model=SessionRead)
def read_session(user: AuthenticatedUser) -> SessionRead:
    return session_read(user)


@router.post("/login", response_model=SessionRead)
def login(
    payload: LoginRequest,
    response: Response,
    db: DatabaseSession,
    settings: SettingsDependency,
) -> SessionRead:
    user = db.scalar(select(User).where(User.username == payload.username))
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    set_session_cookie(response, user, db, settings)
    return session_read(user)


@router.post("/register", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegistrationRequest,
    response: Response,
    db: DatabaseSession,
    settings: SettingsDependency,
) -> SessionRead:
    now = datetime.now(UTC)
    invitation = db.scalar(
        select(Invitation).where(
            Invitation.token_hash == token_hash(payload.invitation_token),
            Invitation.used_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > now,
        ).with_for_update()
    )
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invitation")
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    invitation.used_at = now
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username unavailable"
        ) from error
    set_session_cookie(response, user, db, settings)
    return session_read(user)


@router.post("/invitations", response_model=InvitationRead, status_code=status.HTTP_201_CREATED)
def create_invitation(
    payload: InvitationCreate, user: AuthenticatedUser, db: DatabaseSession
) -> InvitationRead:
    require_admin(user)
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    invitation = Invitation(
        token_hash=token_hash(raw_token),
        invited_by_id=user.id,
        created_at=now,
        expires_at=now + timedelta(days=payload.expires_in_days),
    )
    db.add(invitation)
    db.commit()
    return InvitationRead(id=invitation.id, token=raw_token, expires_at=invitation.expires_at)


@router.get("/invitations", response_model=list[InvitationSummary])
def list_open_invitations(
    user: AuthenticatedUser, db: DatabaseSession
) -> list[InvitationSummary]:
    require_admin(user)
    now = datetime.now(UTC)
    invitations = db.scalars(
        select(Invitation)
        .where(
            Invitation.used_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > now,
        )
        .order_by(Invitation.created_at.desc())
    )
    return [
        InvitationSummary(
            id=invitation.id,
            created_at=as_utc(invitation.created_at),
            expires_at=as_utc(invitation.expires_at),
        )
        for invitation in invitations
    ]


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invitation(
    invitation_id: UUID,
    user: AuthenticatedUser,
    db: DatabaseSession,
) -> None:
    require_admin(user)
    now = datetime.now(UTC)
    invitation = db.scalar(
        select(Invitation)
        .where(
            Invitation.id == invitation_id,
            Invitation.used_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > now,
        )
        .with_for_update()
    )
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Open invitation not found"
        )
    invitation.revoked_at = now
    db.commit()


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChangeRequest,
    response: Response,
    user: AuthenticatedUser,
    db: DatabaseSession,
) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different"
        )
    user.password_hash = hash_password(payload.new_password)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/users", response_model=list[UserRead])
def list_users(user: AuthenticatedUser, db: DatabaseSession) -> list[User]:
    require_admin(user)
    return list(db.scalars(select(User).order_by(User.created_at, User.username)))


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user_status(
    user_id: UUID,
    payload: UserActiveUpdate,
    user: AuthenticatedUser,
    db: DatabaseSession,
) -> User:
    require_admin(user)
    managed_user = db.get(User, user_id)
    if managed_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if managed_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Admin accounts cannot be managed here"
        )
    managed_user.is_active = payload.is_active
    if not managed_user.is_active:
        db.execute(delete(UserSession).where(UserSession.user_id == managed_user.id))
    db.commit()
    db.refresh(managed_user)
    return managed_user


@router.post(
    "/users/{user_id}/password-resets",
    response_model=PasswordResetRead,
    status_code=status.HTTP_201_CREATED,
)
def create_password_reset(
    user_id: UUID,
    payload: PasswordResetCreate,
    user: AuthenticatedUser,
    db: DatabaseSession,
) -> PasswordResetRead:
    require_admin(user)
    managed_user = db.get(User, user_id)
    if managed_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if managed_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Admin passwords cannot be reset here"
        )
    if not managed_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive users cannot reset passwords"
        )
    now = datetime.now(UTC)
    open_resets = db.scalars(
        select(PasswordReset).where(
            PasswordReset.user_id == managed_user.id,
            PasswordReset.used_at.is_(None),
            PasswordReset.revoked_at.is_(None),
        )
    )
    for open_reset in open_resets:
        open_reset.revoked_at = now
    raw_token = secrets.token_urlsafe(32)
    reset = PasswordReset(
        token_hash=token_hash(raw_token),
        user_id=managed_user.id,
        created_by_id=user.id,
        created_at=now,
        expires_at=now + timedelta(hours=payload.expires_in_hours),
    )
    db.add(reset)
    db.commit()
    return PasswordResetRead(token=raw_token, expires_at=reset.expires_at)


@router.post("/password-reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: PasswordResetRequest, db: DatabaseSession) -> None:
    now = datetime.now(UTC)
    reset = db.scalar(
        select(PasswordReset)
        .where(
            PasswordReset.token_hash == token_hash(payload.reset_token),
            PasswordReset.used_at.is_(None),
            PasswordReset.revoked_at.is_(None),
            PasswordReset.expires_at > now,
        )
        .with_for_update()
    )
    if reset is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid password reset"
        )
    managed_user = db.get(User, reset.user_id)
    if managed_user is None or not managed_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid password reset"
        )
    if verify_password(payload.new_password, managed_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different"
        )
    managed_user.password_hash = hash_password(payload.new_password)
    reset.used_at = now
    db.execute(delete(UserSession).where(UserSession.user_id == managed_user.id))
    db.commit()


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: DatabaseSession) -> None:
    raw_token = request.cookies.get(SESSION_COOKIE)
    if raw_token:
        db.execute(delete(UserSession).where(UserSession.token_hash == token_hash(raw_token)))
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


def main() -> None:
    parser = argparse.ArgumentParser(description="Athletica Log authentication utilities")
    parser.add_argument("command", choices=["hash-password", "set-password"])
    parser.add_argument("--username")
    args = parser.parse_args()
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match")
    if len(password) < 12:
        raise SystemExit("Use at least 12 characters")
    if args.command == "hash-password":
        print(hash_password(password))
        return
    if not args.username:
        raise SystemExit("--username is required for set-password")
    from app.db import SessionLocal

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == args.username.strip().lower()))
        if user is None:
            raise SystemExit("User not found")
        user.password_hash = hash_password(password)
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
        db.commit()
    print("Password updated")


if __name__ == "__main__":
    main()
