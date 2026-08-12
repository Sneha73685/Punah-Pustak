"""Unit tests for `Settings._reject_unsafe_production_config` — a fail-fast
startup guard (added this milestone, since JWT/cookie settings are now
actually consumed) ensuring `environment=production` can't silently run
with the local-dev default secret, a too-short secret, or an insecure
cookie flag.
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


class TestProductionConfigValidation:
    def test_rejects_default_jwt_secret_in_production(self) -> None:
        with pytest.raises(ValidationError, match="jwt_secret MUST be overridden"):
            Settings(environment="production")

    def test_rejects_short_jwt_secret_in_production(self) -> None:
        with pytest.raises(ValidationError, match="at least 256 bits"):
            Settings(environment="production", jwt_secret="too-short")

    def test_rejects_insecure_cookie_in_production(self) -> None:
        with pytest.raises(ValidationError, match="cookie_secure MUST be true"):
            Settings(environment="production", jwt_secret="a" * 40, cookie_secure=False)

    def test_accepts_valid_production_config(self) -> None:
        settings = Settings(environment="production", jwt_secret="a" * 40, cookie_secure=True)

        assert settings.environment == "production"

    def test_local_environment_is_unaffected_by_the_guard(self) -> None:
        """The guard only fires for environment=production — local dev keeps
        its convenience defaults.
        """
        settings = Settings(environment="local")

        assert settings.cookie_secure is True  # the field's own default, not overridden


class TestDatabaseUrlDriverNormalization:
    """Managed Postgres providers (Render, Railway, Heroku-style) hand out a
    bare `postgresql://`/`postgres://` connection string with no SQLAlchemy
    driver qualifier. SQLAlchemy's default dialect for that bare scheme is
    psycopg2, not the psycopg3 this project installs (`psycopg[binary]`) —
    confirmed directly against this project's own dependencies:
    `create_engine("postgresql://...")` raises `ModuleNotFoundError: No
    module named 'psycopg2'` without this normalization, which is exactly
    the crash a first production deploy hit. `_normalize_database_url_driver`
    rewrites the scheme so pasting a provider's connection string straight
    into `DATABASE_URL` just works.
    """

    def test_bare_postgresql_scheme_gets_psycopg_driver(self) -> None:
        settings = Settings(database_url="postgresql://user:pass@host:5432/db")

        assert settings.database_url == "postgresql+psycopg://user:pass@host:5432/db"

    def test_legacy_postgres_scheme_gets_psycopg_driver(self) -> None:
        """`postgres://` (no trailing 'ql') is the older, still-common alias
        some providers use — normalized the same way.
        """
        settings = Settings(database_url="postgres://user:pass@host:5432/db")

        assert settings.database_url == "postgresql+psycopg://user:pass@host:5432/db"

    def test_already_qualified_url_is_untouched(self) -> None:
        settings = Settings(database_url="postgresql+psycopg://user:pass@host:5432/db")

        assert settings.database_url == "postgresql+psycopg://user:pass@host:5432/db"

    def test_local_dev_default_is_already_qualified_and_unaffected(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Isolated from the ambient environment: `Settings()` is
        `pydantic-settings` and reads `DATABASE_URL` from the process
        environment/`.env` if present, falling back to this field's
        hardcoded default only when absent. Without clearing it here, this
        assertion only holds by coincidence whenever the runner's ambient
        `DATABASE_URL` happens to already match the hardcoded default
        (true in CI, false for a developer whose local Postgres runs on a
        non-default port) — it wasn't actually testing the field's default
        in isolation.
        """
        monkeypatch.delenv("DATABASE_URL", raising=False)
        settings = Settings()

        assert (
            settings.database_url == "postgresql+psycopg://punah:punah@localhost:5432/punah_pustak"
        )

    def test_normalized_url_resolves_to_the_installed_psycopg3_driver(self) -> None:
        """End-to-end proof, not just string manipulation: the normalized
        URL actually makes SQLAlchemy pick the driver this project installs.
        """
        from sqlalchemy import create_engine

        settings = Settings(database_url="postgresql://user:pass@host:5432/db")
        engine = create_engine(settings.database_url)

        assert engine.dialect.driver == "psycopg"


class TestTrustedProxyHopCount:
    """SEC-040: `trusted_proxy_hop_count` drives `_extract_client_ip`'s
    trust model (see `test_auth_api.py::TestExtractClientIp` for the
    extraction logic itself) — this only covers the setting's own
    defaults/validation.
    """

    def test_defaults_to_zero(self) -> None:
        """0 is the safe default: local dev, CI, and any environment that
        doesn't explicitly opt in never trusts X-Forwarded-For at all.
        """
        settings = Settings()

        assert settings.trusted_proxy_hop_count == 0

    def test_rejects_a_negative_hop_count(self) -> None:
        with pytest.raises(ValidationError):
            Settings(trusted_proxy_hop_count=-1)

    def test_accepts_the_configured_production_value(self) -> None:
        """2 is what `render.yaml` sets in production (Render's own edge/
        load-balancer + Cloudflare in front of it).
        """
        settings = Settings(trusted_proxy_hop_count=2)

        assert settings.trusted_proxy_hop_count == 2
