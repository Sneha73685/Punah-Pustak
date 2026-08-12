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
from app.core.exceptions import ForbiddenError, InvalidAccessTokenError, PasswordChangeRequiredError
from app.core.rate_limit import auth_rate_limiter
from app.modules.auth.tokens import decode_access_token
from app.modules.users.models import RoleEnum, User
from app.modules.users.service import UserService

# auto_error=False: a missing header should raise the same InvalidAccessTokenError
# (401, code UNAUTHORIZED, API-010 envelope) as a malformed or expired one,
# rather than FastAPI's own default 403 "Not authenticated" HTTPException,
# which would bypass this module's error contract.
_bearer_scheme = HTTPBearer(auto_error=False)


def _resolve_current_user(
    credentials: HTTPAuthorizationCredentials | None, db: Session, settings: Settings
) -> User:
    """Verifies the `Authorization: Bearer <token>` header and re-loads the
    corresponding user from the database on every call — never trusts a
    token claim for anything beyond "which user id".

    Factored out of `get_current_user` so `get_current_user_for_password_change`
    (Milestone 3, FR-015) can resolve identity through the exact same
    token-verification path without also going through FR-015's
    `must_change_password` gate — see that function's docstring for why a
    second, near-identical dependency exists instead of a parameter/flag on
    this one.

    Deliberately does NOT check `user.is_active` (Milestone 4's suspension
    flag) — an earlier version of this docstring suggested a future
    suspension check might "plug in" here, which would have been wrong: per
    SEC-025, suspension is required to be *bounded-immediate*, not
    instantaneous — an access token issued before suspension remains valid
    until its own ≤15-minute expiry by explicit design, because true
    per-request revocation "would reintroduce the statefulness JWTs exist
    to avoid, and is not justified here." Adding an `is_active` check to
    this function would silently make suspension instantaneous, contradicting
    that accepted trade-off. The actual enforcement points are: login
    (`AuthService.login` rejects a suspended user before issuing tokens),
    refresh (blocked as a side effect of `AdminService.suspend_user`
    revoking every `RefreshToken` row, not a separate `is_active` check),
    and public listing visibility (`ListingRepository.browse`'s join). This
    function's only job stays "which user does this valid token belong to."
    """
    if credentials is None:
        raise InvalidAccessTokenError()

    user_id = decode_access_token(credentials.credentials, settings)
    user = UserService(db).get_by_id(user_id)
    if user is None:
        raise InvalidAccessTokenError()
    return user


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    """The standard "who is calling" dependency every mutating/owned-resource
    endpoint depends on (listings' ownership checks, users' profile
    endpoints, auth's logout, and — via `require_admin` below, built
    directly on top of this function — every admin endpoint's role gate).

    FR-015 *(Milestone 3)*: also enforces the forced-password-change gate
    here, at this single choke point, rather than adding a second
    dependency to every router that already depends on this one. That is
    what makes FR-015's "any authenticated request other than the
    password-change endpoint" apply automatically to every current and
    future endpoint built on top of `get_current_user` — Milestone 2's
    listings endpoints included — with zero changes needed to those
    routers. The one endpoint that must NOT be blocked here
    (`POST /users/me/password`) uses `get_current_user_for_password_change`
    instead, which shares `_resolve_current_user` but skips this check —
    see that function's docstring.

    Deliberately NOT applied to `get_current_user_optional`: that dependency
    backs genuinely public endpoints (Milestone 2's `GET /listings/{id}`)
    that already tolerate every other form of auth failure (missing,
    malformed, expired token) by degrading to a guest view rather than
    hard-failing. A user mid-forced-password-change looking at public
    listing content is not "performing an authenticated action" in the
    sense FR-015 is guarding against — it would be a stranger product
    behavior for such a user to see *less* than an anonymous guest on a
    page that has no mutating capability to begin with. See
    IMPLEMENTATION_SUMMARY.md for the full reasoning.
    """
    user = _resolve_current_user(credentials, db, settings)
    if user.must_change_password:
        raise PasswordChangeRequiredError()
    return user


def get_current_user_for_password_change(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    """FR-015's one deliberate exception to `get_current_user`'s gate: used
    solely by `POST /users/me/password`.

    A user with `must_change_password=True` MUST be able to reach exactly
    this one endpoint despite the flag — otherwise the flag could never be
    cleared and the account would be permanently locked out after an
    admin-assisted reset (FR-045). This resolves identity through the same
    `_resolve_current_user` token-verification path as `get_current_user`
    (still 401s on a missing/invalid/expired token — this is not a way to
    skip authentication, only the `must_change_password` gate specifically)
    but never raises `PasswordChangeRequiredError`.
    """
    return _resolve_current_user(credentials, db, settings)


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


def require_admin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    """SEC-030/SEC-031 (Milestone 4): gates every `/api/v1/admin/*` endpoint.
    `current_user.role` comes from `get_current_user`, which re-resolves it
    fresh from the database against the verified token's subject on every
    request — never from a client-supplied field (a request body/query
    param has no `role` to spoof in the first place; nothing here reads
    one). Built on `get_current_user` rather than `_resolve_current_user`
    directly, so an admin is subject to the exact same FR-015
    forced-password-change gate as anyone else — there is no reason an
    admin account mid-forced-change should be exempt from it.
    """
    if current_user.role != RoleEnum.ADMIN:
        raise ForbiddenError("Admin access required.")
    return current_user


def _extract_client_ip(request: Request, settings: Settings) -> str:
    """Resolves the IP address SEC-040's rate limiter keys on.

    Trust model (recorded here, the one place this decision is made): this
    project is deployed on Render, reachable only through Render's own
    edge/load-balancer layer — and, per Render's documented platform
    architecture, Cloudflare in front of that — never by a direct
    connection to the running container. Those fronting hops are therefore
    trusted *by construction of the platform*, not because we trust
    arbitrary header content: a client cannot bypass them to open a raw
    TCP connection to this service. But neither hop strips or resets an
    `X-Forwarded-For` value a client sends of their own accord — each hop
    only *appends* the address it received its own connection from — so
    blindly trusting the header (e.g. always taking its first, left-most
    entry, which is what `X-Forwarded-For` would report if the client set
    it themselves and nothing trustworthy overwrote it) would let any
    client forge their own rate-limit bucket by pre-populating the header.

    This function only reads `X-Forwarded-For` at all when
    `settings.trusted_proxy_hop_count > 0` — 0 in every local/dev/test
    environment (docker-compose, pytest, CI: nothing sits in front of
    uvicorn there, so `request.client.host` is already the real peer).
    When it is set (2, in production, for Render's edge + Cloudflare),
    this takes exactly the entry `trusted_proxy_hop_count` positions from
    the right — the "N trusted hops" algorithm also used by, e.g.,
    Express's `trust proxy: <number>`: each trusted hop appends the peer
    *it* observed, so with N trusted hops in front of this app the real
    client sits N positions from the right end of the list, and anything
    further left may be attacker-supplied.

    If the header doesn't carry enough entries for the configured hop
    count (a hop that failed to append, or a short/malformed header),
    this falls back to `request.client.host` rather than guessing — it
    fails toward "definitely not attacker-controlled", not toward "best
    guess at the real client".
    """
    if settings.trusted_proxy_hop_count > 0:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
            if len(hops) >= settings.trusted_proxy_hop_count:
                return hops[-settings.trusted_proxy_hop_count]
    return request.client.host if request.client else "unknown"


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
    See `_extract_client_ip` for how "per IP" is resolved behind Render's
    reverse proxy without trusting arbitrary client-supplied headers.
    """
    client_ip = _extract_client_ip(request, settings)
    auth_rate_limiter.check(
        bucket=request.url.path, key=client_ip, limit=settings.auth_rate_limit_per_minute
    )
