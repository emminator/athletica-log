from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://athletica_log:change-me-locally@localhost:5432/athletica_log"
    )
    backend_cors_origins: str = "http://localhost:3000"
    auth_enabled: bool = False
    auth_username: str = "athletica"
    auth_password_hash: str = ""
    session_secret: str = ""
    session_max_age_seconds: int = 60 * 60 * 24 * 30
    session_cookie_secure: bool = False
    static_files_dir: str = ""
    docs_enabled: bool = True
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url", mode="before")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @model_validator(mode="after")
    def validate_authentication(self) -> "Settings":
        if self.auth_enabled and (not self.auth_password_hash or not self.session_secret):
            raise ValueError(
                "AUTH_PASSWORD_HASH and SESSION_SECRET are required when AUTH_ENABLED is true"
            )
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [value.strip() for value in self.backend_cors_origins.split(",") if value.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
