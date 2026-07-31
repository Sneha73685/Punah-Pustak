"""FastAPI dependency for identifying the current authenticated user.

SEC-030/SEC-031: the current user's identity and role come only from the
verified token's subject re-resolved against the database — never inferred
from a client-supplied ID or trusted directly from a token claim. This is
the `auth` module's public interface (BE-002) for every other module that
needs to know "who is making this request" — starting with `logout` in this
milestone, and every ownership/role check from Milestone 2 onward.
"""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.exceptions import InvalidAccessTokenError
from app.core.rate_limit import auth_rate_limiter
from app.modules.auth.tokens import decode_access_token
from app.modules.users.models import User
from app.modules.users.service import UserService

# auto_error=False: a missing header should raise the same InvalidAccessTokenError
# (401, code UNAUTHORIZED, API-010 envelope) as a malformed or expired one,
# rather than FastAPI's own default 403 "Not authenticated" HTTPException,
# which would bypass this module's error contract.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    """Verifies the `Authorization: Bearer <token>` header and re-loads the
    corresponding user from the database on every call — never trusts a
    token claim for anything beyond "which user id". This is also what lets
    Milestone 4's suspension check (`user.is_active`) plug in later without
    redesigning this dependency: it already re-fetches the row fresh on
    every request.
    """
    if credentials is None:
        raise InvalidAccessTokenError()

    user_id = decode_access_token(credentials.credentials, settings)
    user = UserService(db).get_by_id(user_id)
    if user is None:
        raise InvalidAccessTokenError()
    return user


def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User | None:
    """For endpoints that are genuinely public but behave differently for a
    known requester — Milestone 2's `GET /listings/{id}` (FR-006a's
    owner/admin visibility exception) is the first user of this.

    Unlike `get_current_user`, ANY failure to authenticate (no header,
    malformed token, expired token) resolves to `None` — treated as a
    guest — rather than raising `InvalidAccessTokenError`. This is a
    deliberate difference, not an oversight: a stale/expired access token
    (15-minute TTL) is a routine, expected state for a logged-in user
    who's simply been browsing for a while, and a genuinely public page
    must not hard-fail for them — it should just render as if they were a
    guest, exactly as it would for a visitor who was never logged in.
    """
    if credentials is None:
        return None
    try:
        user_id = decode_access_token(credentials.credentials, settings)
    except InvalidAccessTokenError:
        return None
    return UserService(db).get_by_id(user_id)


def enforce_auth_rate_limit(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """SEC-040: applied to `/auth/login`, `/auth/register`, `/auth/refresh`.

    Reading the client IP off the request is an HTTP concern, which is why
    this wrapper — rather than `FixedWindowRateLimiter` itself — lives here
    in `app.modules.auth.dependencies` and not in the framework-agnostic
    `app.core.rate_limit`. `request.url.path` is the bucket, so each of the
    three rate-limited endpoints gets its own independent counter per IP.
    """
    client_ip = request.client.host if request.client else "unknown"
    auth_rate_limiter.check(
        bucket=request.url.path, key=client_ip, limit=settings.auth_rate_limit_per_minute
    )
