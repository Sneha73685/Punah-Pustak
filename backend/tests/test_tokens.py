"""Unit tests for `app.modules.auth.tokens` — the JWT/opaque-token logic
directly, isolated from `AuthService`. Covers the defensive branches in
`decode_access_token` that only trigger on malformed or tampered input:
these are reachable from a real, hostile client (anyone can send an
arbitrary `Authorization` header), unlike most other untested branches in
this milestone's code, which are either time-based or currently
unreachable given DB-021 (users are never hard-deleted).
"""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import Settings
from app.core.exceptions import InvalidAccessTokenError
from app.modules.auth.tokens import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
)


@pytest.fixture
def settings() -> Settings:
    return Settings()


class TestAccessTokens:
    def test_round_trips(self, settings: Settings) -> None:
        user_id = uuid.uuid4()

        token = create_access_token(user_id, settings)

        assert decode_access_token(token, settings) == user_id

    def test_rejects_expired_token(self, settings: Settings) -> None:
        payload = {
            "sub": str(uuid.uuid4()),
            "type": "access",
            "iat": datetime.now(UTC) - timedelta(minutes=20),
            "exp": datetime.now(UTC) - timedelta(minutes=5),
        }
        expired = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

        with pytest.raises(InvalidAccessTokenError):
            decode_access_token(expired, settings)

    def test_rejects_wrong_signature(self, settings: Settings) -> None:
        token = create_access_token(uuid.uuid4(), settings)
        wrong_secret_settings = Settings(jwt_secret="a-completely-different-secret-value")

        with pytest.raises(InvalidAccessTokenError):
            decode_access_token(token, wrong_secret_settings)

    def test_rejects_malformed_token(self, settings: Settings) -> None:
        with pytest.raises(InvalidAccessTokenError):
            decode_access_token("not.a.jwt", settings)

    def test_rejects_wrong_token_type(self, settings: Settings) -> None:
        """A token that is validly signed but not actually an access token
        (e.g. if a future token type is ever introduced) must be rejected —
        this is what stops a token minted for a different purpose from
        being replayed as an access token.
        """
        payload = {
            "sub": "11111111-1111-1111-1111-111111111111",
            "type": "not-access",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=15),
        }
        token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

        with pytest.raises(InvalidAccessTokenError):
            decode_access_token(token, settings)

    def test_rejects_non_uuid_subject(self, settings: Settings) -> None:
        payload = {
            "sub": "not-a-uuid",
            "type": "access",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=15),
        }
        token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

        with pytest.raises(InvalidAccessTokenError):
            decode_access_token(token, settings)

    def test_rejects_missing_subject(self, settings: Settings) -> None:
        payload = {
            "type": "access",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=15),
        }
        token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

        with pytest.raises(InvalidAccessTokenError):
            decode_access_token(token, settings)


class TestRefreshTokens:
    def test_generate_produces_distinct_tokens(self) -> None:
        assert generate_refresh_token() != generate_refresh_token()

    def test_hash_is_deterministic(self, settings: Settings) -> None:
        token = generate_refresh_token()

        assert hash_refresh_token(token, settings) == hash_refresh_token(token, settings)

    def test_hash_differs_for_different_tokens(self, settings: Settings) -> None:
        assert hash_refresh_token("token-a", settings) != hash_refresh_token("token-b", settings)

    def test_hash_differs_across_secrets(self) -> None:
        """SEC-021: the hash is keyed with `jwt_secret` — a leaked hash
        database is not enough to forge a matching hash without also
        holding the application secret.
        """
        token = generate_refresh_token()
        hash_with_one_secret = hash_refresh_token(token, Settings(jwt_secret="secret-one-value"))
        hash_with_another_secret = hash_refresh_token(
            token, Settings(jwt_secret="secret-two-value")
        )

        assert hash_with_one_secret != hash_with_another_secret
