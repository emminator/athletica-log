import argparse
import base64
import getpass
import hashlib
import hmac
import json
import secrets
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings

SESSION_COOKIE = "athletica_session"
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=256)


class SessionRead(BaseModel):
    authenticated: bool
    username: str


SettingsDependency = Annotated[Settings, Depends(get_settings)]
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


def create_session_token(username: str, settings: Settings, now: int | None = None) -> str:
    issued_at = now if now is not None else int(time.time())
    payload = json.dumps(
        {
            "username": username,
            "expires_at": issued_at + settings.session_max_age_seconds,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    encoded_payload = _encode(payload)
    signature = hmac.new(
        settings.session_secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{encoded_payload}.{_encode(signature)}"


def session_username(token: str, settings: Settings, now: int | None = None) -> str | None:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected_signature = hmac.new(
            settings.session_secret.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(expected_signature, _decode(encoded_signature)):
            return None
        payload = json.loads(_decode(encoded_payload))
        current_time = now if now is not None else int(time.time())
        if payload["expires_at"] < current_time or payload["username"] != settings.auth_username:
            return None
        return str(payload["username"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def current_username(request: Request, settings: Settings) -> str | None:
    if not settings.auth_enabled:
        return settings.auth_username
    token = request.cookies.get(SESSION_COOKIE)
    return session_username(token, settings) if token else None


def require_authenticated(request: Request, settings: SettingsDependency) -> str:
    username = current_username(request, settings)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return username


@router.get("/session", response_model=SessionRead)
def read_session(request: Request, settings: SettingsDependency) -> SessionRead:
    username = current_username(request, settings)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return SessionRead(authenticated=True, username=username)


@router.post("/login", response_model=SessionRead)
def login(payload: LoginRequest, response: Response, settings: SettingsDependency) -> SessionRead:
    valid_username = hmac.compare_digest(payload.username, settings.auth_username)
    valid_password = verify_password(payload.password, settings.auth_password_hash)
    if settings.auth_enabled and not (valid_username and valid_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(settings.auth_username, settings),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )
    return SessionRead(authenticated=True, username=settings.auth_username)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def main() -> None:
    parser = argparse.ArgumentParser(description="Athletica Log authentication utilities")
    parser.add_argument("command", choices=["hash-password"])
    args = parser.parse_args()
    if args.command == "hash-password":
        password = getpass.getpass("Password: ")
        confirmation = getpass.getpass("Confirm password: ")
        if password != confirmation:
            raise SystemExit("Passwords do not match")
        if len(password) < 12:
            raise SystemExit("Use at least 12 characters")
        print(hash_password(password))


if __name__ == "__main__":
    main()
