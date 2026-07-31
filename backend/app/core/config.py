"""Typed application settings (BE-020).

All configuration MUST come from environment variables via this single typed
Settings object — no hardcoded values, no scattered `os.environ.get` calls
anywhere else in the codebase. Fields for features not yet implemented in
Milestone 0 (JWT/token TTLs, object storage credentials) were included ahead
of time because BE-020 explicitly requires them to live in this one place
regardless of which milestone consumes them; Milestone 1 (auth) is the first
to actually read jwt_secret/access_token_ttl_minutes/refresh_token_ttl_days/
cookie_secure.
"""

from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "local-dev-secret-change-me-before-deploying"


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Runtime environment -------------------------------------------------
    # Drives conditional behavior that MUST differ between local dev and any
    # deployed environment: structured (JSON) logging (NFR-006) and the
    # refresh-token cookie's Secure flag (DEPLOY-025). "test" is used by CI.
    environment: Literal["local", "test", "production"] = "local"

    # --- Database (§11) -------------------------------------------------------
    database_url: str = Field(
        default="postgresql+psycopg://punah:punah@localhost:5432/punah_pustak",
        description="SQLAlchemy connection URL, psycopg3 driver.",
    )

    # --- Auth / tokens (§15.3) -------------------------------------------------
    jwt_secret: str = Field(
        default=_DEFAULT_JWT_SECRET,
        description="HS256 signing secret (SEC-020). MUST be overridden outside local dev.",
    )
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    # --- Rate limiting (SEC-040) -------------------------------------------------
    # Single-process, in-memory limiter per NFR-002's single-instance target;
    # applies to /auth/login, /auth/register, /auth/refresh.
    auth_rate_limit_per_minute: int = 10

    # --- CORS (DEPLOY-024) ------------------------------------------------------
    cors_allowed_origins: str = Field(
        default="http://localhost:5173",
        description="Comma-separated list of allowed frontend origins (exact match, no wildcard).",
    )

    # --- Object storage (BE-030) -------------------------------------------------
    # storage_endpoint_url is what the API container uses server-to-server to
    # talk to the storage backend (in docker-compose, the internal hostname
    # `http://storage:9000` — never reachable from a browser). storage_public_url
    # is the base URL returned to clients in image URLs (StorageBackend.get_url) —
    # in local dev, the same MinIO instance's host-published port
    # (`http://localhost:9000`); in production, the bucket's real public/CDN
    # URL. These are deliberately two different settings: conflating them was
    # caught during Milestone 2 implementation before it shipped as a bug — see
    # IMPLEMENTATION_SUMMARY.md.
    storage_endpoint_url: str = "http://localhost:9000"
    storage_public_url: str = "http://localhost:9000"
    storage_bucket: str = "punah-pustak-listing-images"
    storage_access_key: str = "punah-pustak-local"
    storage_secret_key: str = "punah-pustak-local-secret"

    # --- Cookies (SEC-022, DEPLOY-025) -----------------------------------------
    # MUST be True in every deployed environment; relaxed to False only for
    # local HTTP development. Driven by this setting, never a hardcoded branch.
    cookie_secure: bool = True

    # --- Logging (NFR-006) ------------------------------------------------------
    log_level: str = "INFO"

    @field_validator("cors_allowed_origins")
    @classmethod
    def _no_wildcard_origin(cls, value: str) -> str:
        """DEPLOY-024 forbids a wildcard CORS origin — fail fast if misconfigured."""
        if "*" in value:
            raise ValueError(
                "cors_allowed_origins MUST NOT contain a wildcard ('*') per DEPLOY-024; "
                "list exact origins instead."
            )
        return value

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        """Parsed, whitespace-trimmed list form of `cors_allowed_origins`."""
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    @property
    def is_local(self) -> bool:
        return self.environment == "local"

    @model_validator(mode="after")
    def _reject_unsafe_production_config(self) -> Self:
        """Fail fast on startup rather than silently running an insecure prod deployment.

        Not required by any single SRS requirement letter-for-letter, but a
        direct consequence of SEC-020 ("a single, strong, randomly generated
        secret") and SEC-022/DEPLOY-025 (cookie MUST be Secure in every
        deployed environment) — those requirements are meaningless if
        `environment=production` can silently run with the local-dev default
        secret or a relaxed cookie flag.
        """
        if self.environment != "production":
            return self
        if self.jwt_secret == _DEFAULT_JWT_SECRET:
            raise ValueError(
                "jwt_secret MUST be overridden when environment=production "
                "(SEC-020) — refusing to start with the local-dev default."
            )
        if len(self.jwt_secret.encode()) < 32:
            raise ValueError(
                "jwt_secret MUST be at least 256 bits (32 bytes) when "
                "environment=production, per SEC-020."
            )
        if not self.cookie_secure:
            raise ValueError(
                "cookie_secure MUST be true when environment=production, " "per SEC-022/DEPLOY-025."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Process-wide cached Settings instance.

    `lru_cache` gives a single-instance-per-process singleton without a
    manual global variable, and plays well with FastAPI's `Depends` for
    tests that need to override configuration.
    """
    return Settings()
