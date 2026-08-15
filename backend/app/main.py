from pathlib import Path

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import router as api_router
from app.auth import router as auth_router
from app.config import get_settings
from app.db import engine

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
)
app.include_router(auth_router)
app.include_router(api_router)


@app.get("/api/v1", tags=["system"])
def api_root() -> dict[str, str]:
    return {"name": "Athletica Log API", "version": app.version}


@app.get("/health/live")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def readiness(response: Response) -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not ready"}
    return {"status": "ready"}


static_files_dir = Path(settings.static_files_dir) if settings.static_files_dir else None
if static_files_dir and static_files_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_files_dir, html=True), name="frontend")
