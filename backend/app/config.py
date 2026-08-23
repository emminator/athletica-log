from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://athletica_log:change-me-locally@localhost:5432/athletica_log"
    )
    backend_cors_origins: str = "http://localhost:3000"
    auth_enabled: bool = False
    auth_username: str = "athletica"
    auth_password_hash: str = ""
    session_max_age_seconds: int = 60 * 60 * 24 * 30
    session_cookie_secure: bool = False
    hsts_enabled: bool = False
    static_files_dir: str = ""
    docs_enabled: bool = True
    app_release: str = ""
    render_git_commit: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url", mode="before")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [value.strip() for value in self.backend_cors_origins.split(",") if value.strip()]

    @property
    def release_version(self) -> str:
        explicit_release = self.app_release.strip()
        if explicit_release:
            return explicit_release
        render_commit = self.render_git_commit.strip()
        if render_commit:
            return render_commit[:12]
        return "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
