import logging
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import router as api_router
from app.auth import router as auth_router
from app.config import get_settings
from app.db import engine

settings = get_settings()
request_logger = logging.getLogger("athletica.requests")
app = FastAPI(
    title="Athletica Log API",
    version="0.1.0",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(api_router)


@app.middleware("http")
async def add_operational_headers(request: Request, call_next) -> Response:
    request_id = request.headers.get("cf-ray") or uuid4().hex
    started_at = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        request_logger.exception(
            "request failed request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        raise

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.session_cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    if request.url.path.startswith(("/api/v1/auth/", "/health/")):
        response.headers["Cache-Control"] = "no-store"

    if not request.url.path.startswith("/health/") or response.status_code >= 400:
        request_logger.info(
            "request request_id=%s method=%s path=%s status=%s duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            (perf_counter() - started_at) * 1000,
        )
    return response


@app.get("/api/v1", tags=["system"])
def api_root() -> dict[str, str]:
    return {
        "name": "Athletica Log API",
        "version": app.version,
        "release": settings.release_version,
    }


@app.get("/health/live")
def liveness() -> dict[str, str]:
    return {"status": "ok", "release": settings.release_version}


@app.get("/health/ready")
def readiness(response: Response) -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not ready", "release": settings.release_version}
    return {"status": "ready", "release": settings.release_version}


static_files_dir = Path(settings.static_files_dir) if settings.static_files_dir else None
if static_files_dir and static_files_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_files_dir, html=True), name="frontend")
