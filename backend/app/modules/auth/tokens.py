"""Token issuance and verification (§15.3).

Two distinct token types, deliberately different in kind: access tokens are
short-lived, stateless JWTs (SEC-020, HS256); refresh tokens are opaque,
cryptographically random strings, never JWTs (SEC-021) — a stateless
refresh JWT cannot be revoked before expiry, which would break FR-013
logout and the suspension model in §15.4a.
"""

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import Settings
from app.core.exceptions import InvalidAccessTokenError

_JWT_ALGORITHM = "HS256"  # SEC-020: committed, single algorithm.


def create_access_token(user_id: uuid.UUID, settings: Settings) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str, settings: Settings) -> uuid.UUID:
    """Verify signature + expiry and return the subject's user id.

    Raises `InvalidAccessTokenError` for every failure mode (expired,
    malformed, wrong signature, missing/non-UUID subject, wrong token
    `type`) — the caller (the `get_current_user` dependency) doesn't need
    to distinguish why a token didn't work, only that it didn't; the client
    response is identical either way.
    """
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[_JWT_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise InvalidAccessTokenError() from exc

    if payload.get("type") != "access":
        raise InvalidAccessTokenError()

    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise InvalidAccessTokenError() from exc


def generate_refresh_token() -> str:
    """A cryptographically random, opaque, URL-safe string (SEC-021) — never
    a JWT.
    """
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str, settings: Settings) -> str:
    """SEC-021: refresh tokens are stored server-side as a salted hash, never
    the opaque token itself. Keyed with `jwt_secret` via HMAC-SHA256 rather
    than a per-token random salt: the token is already a cryptographically
    random 256-bit value, so the actual risk this guards against is a leaked
    database being directly usable to forge valid-looking token hashes
    without also holding the application's secret. A dedicated second secret
    just for this would add configuration surface without defending against
    a meaningfully distinct threat at this project's scale — the same
    trade-off DB-031 and similar decisions in this codebase make throughout.
    """
    return hmac.new(settings.jwt_secret.encode(), token.encode(), hashlib.sha256).hexdigest()
