import hashlib
import math
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import LoginThrottle


def identifier_hash(username: str) -> str:
    return hashlib.sha256(username.encode("utf-8")).hexdigest()


def _postgres_advisory_key(value: str) -> int:
    unsigned = int.from_bytes(hashlib.sha256(value.encode("utf-8")).digest()[:8], "big")
    return unsigned if unsigned < 2**63 else unsigned - 2**64


def lock_login_identifier(db: Session, value: str) -> None:
    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": _postgres_advisory_key(value)},
        )


def retry_after_seconds(
    db: Session, value: str, *, now: datetime | None = None
) -> int | None:
    checked_at = now or datetime.now(UTC)
    throttle = db.get(LoginThrottle, identifier_hash(value))
    if throttle is None or throttle.blocked_until is None:
        return None
    blocked_until = _as_utc(throttle.blocked_until)
    if blocked_until <= checked_at:
        return None
    return max(1, math.ceil((blocked_until - checked_at).total_seconds()))


def record_failed_login(
    db: Session, value: str, settings: Settings, *, now: datetime | None = None
) -> int | None:
    failed_at = now or datetime.now(UTC)
    key = identifier_hash(value)
    throttle = db.get(LoginThrottle, key)
    window = timedelta(seconds=settings.login_attempt_window_seconds)
    if throttle is None:
        throttle = LoginThrottle(
            identifier_hash=key,
            failed_attempts=1,
            window_started_at=failed_at,
            updated_at=failed_at,
        )
        db.add(throttle)
    elif failed_at - _as_utc(throttle.window_started_at) >= window:
        throttle.failed_attempts = 1
        throttle.window_started_at = failed_at
        throttle.blocked_until = None
        throttle.updated_at = failed_at
    else:
        throttle.failed_attempts += 1
        throttle.updated_at = failed_at

    retry_after = None
    if throttle.failed_attempts >= settings.login_max_attempts:
        throttle.blocked_until = failed_at + timedelta(seconds=settings.login_lockout_seconds)
        retry_after = settings.login_lockout_seconds

    retention_period = max(window, timedelta(seconds=settings.login_lockout_seconds))
    retention_cutoff = failed_at - retention_period * 2
    db.execute(
        delete(LoginThrottle).where(
            LoginThrottle.identifier_hash != key,
            LoginThrottle.updated_at < retention_cutoff,
        )
    )
    db.commit()
    return retry_after


def clear_failed_logins(db: Session, value: str) -> None:
    db.execute(
        delete(LoginThrottle).where(LoginThrottle.identifier_hash == identifier_hash(value))
    )


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
