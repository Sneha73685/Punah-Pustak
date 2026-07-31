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
