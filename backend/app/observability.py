import json
import logging
from contextvars import ContextVar, Token
from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid4

from fastapi import Request, Response

from app.config import Settings

REQUEST_ID_HEADER = "X-Request-ID"
NO_STORE_ROUTE_PREFIXES = ("/api/v1/auth", "/health")
STRUCTURED_LOG_FIELDS = (
    "request_id",
    "method",
    "path",
    "status",
    "duration_ms",
    "cf_ray",
)
request_id_context: ContextVar[str] = ContextVar("request_id", default="")


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        for field in STRUCTURED_LOG_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_request_logger() -> logging.Logger:
    logger = logging.getLogger("athletica.requests")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonLogFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


request_logger = configure_request_logger()


def start_request_context(request: Request) -> Token[str]:
    request_id = uuid4().hex
    request.state.request_id = request_id
    request.state.started_at = perf_counter()
    return request_id_context.set(request_id)


def get_request_id(request: Request | None = None) -> str:
    if request is not None:
        request_id = getattr(request.state, "request_id", "")
        if request_id:
            return request_id
    return request_id_context.get()


def reset_request_context(token: Token[str]) -> None:
    request_id_context.reset(token)


def add_security_headers(response: Response, settings: Settings) -> None:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.hsts_enabled:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"


def matches_route_prefix(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


def add_cache_headers(request: Request, response: Response) -> None:
    is_sensitive_route = any(
        matches_route_prefix(request.url.path, prefix) for prefix in NO_STORE_ROUTE_PREFIXES
    )
    if is_sensitive_route or response.status_code >= 500:
        response.headers["Cache-Control"] = "no-store"


def add_response_headers(request: Request, response: Response, settings: Settings) -> None:
    response.headers[REQUEST_ID_HEADER] = get_request_id(request)
    add_security_headers(response, settings)
    add_cache_headers(request, response)


def should_log_request(request: Request, status_code: int) -> bool:
    return not matches_route_prefix(request.url.path, "/health") or status_code >= 400


def request_duration_ms(request: Request) -> float:
    started_at = getattr(request.state, "started_at", perf_counter())
    return round((perf_counter() - started_at) * 1000, 2)


def log_request(
    request: Request,
    status_code: int,
    *,
    exception: Exception | None = None,
) -> None:
    has_exception = exception is not None
    level = logging.ERROR if has_exception else logging.INFO
    request_logger.log(
        level,
        "request failed" if has_exception else "request completed",
        extra={
            "request_id": get_request_id(request),
            "method": request.method,
            "path": request.url.path,
            "status": status_code,
            "duration_ms": request_duration_ms(request),
            "cf_ray": request.headers.get("cf-ray"),
        },
        exc_info=(type(exception), exception, exception.__traceback__)
        if has_exception
        else None,
    )
