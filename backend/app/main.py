from pathlib import Path

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import router as api_router
from app.auth import router as auth_router
from app.config import get_settings
from app.db import engine
from app.observability import (
    REQUEST_ID_HEADER,
    add_response_headers,
    initialize_request,
    log_request,
    should_log_request,
)
from app.request_security import is_trusted_browser_request

settings = get_settings()
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
    expose_headers=[REQUEST_ID_HEADER],
)
app.include_router(auth_router)
app.include_router(api_router)


@app.middleware("http")
async def observe_request(request: Request, call_next) -> Response:
    initialize_request(request)
    if is_trusted_browser_request(request, settings):
        response = await call_next(request)
    else:
        response = JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Cross-origin request rejected"},
        )
    add_response_headers(request, response, settings)
    if should_log_request(request, response.status_code):
        log_request(request, response.status_code)
    return response


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exception: Exception) -> JSONResponse:
    response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    add_response_headers(request, response, settings)
    log_request(request, response.status_code, exception=exception)
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
