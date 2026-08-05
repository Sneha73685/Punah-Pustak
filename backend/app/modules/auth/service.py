"""Auth service — orchestrates registration, login, refresh, and logout
(§8.2, §8.3 user flows; SEC-021/023/024 token lifecycle).

BE-001: services MUST NOT import FastAPI request/response types. Failures
are raised as `app.core.exceptions.DomainError` subclasses, which
`app.core.errors` translates into HTTP responses centrally — this module
never constructs an HTTP status code or response body itself.

BE-002: `User` belongs to the `users` module. This service depends on
`UserService` (the `users` module's public interface) rather than importing
`UserRepository`/`User` directly — that is the cross-module boundary rule
in practice.

`AuthService` takes its collaborators as constructor arguments (typed as
`Protocol`s below, not the concrete classes) rather than building them
itself from a raw `Session` — this is what TEST-001 means by "unit tests
MUST cover the service layer with the repository layer mocked/faked":
a test can hand this class a hand-written fake satisfying the same narrow
interface, with no real database and no need to subclass anything.
`build_auth_service` at the bottom of this module is the production
wiring FastAPI routes actually call.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import (
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    ValidationFailedError,
)
from app.modules.auth.models import RefreshToken
from app.modules.auth.repository import RefreshTokenRepository
from app.modules.auth.security import hash_password, verify_password
from app.modules.auth.tokens import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from app.modules.users.models import User
from app.modules.users.service import UserService


class UserServiceProtocol(Protocol):
    def get_by_email(self, email: str) -> User | None: ...
    def get_by_id(self, user_id: uuid.UUID) -> User | None: ...
    def create_user(self, *, email: str, password_hash: str, display_name: str) -> User: ...


class RefreshTokenRepositoryProtocol(Protocol):
    def create(
        self, *, user_id: uuid.UUID, token_hash: str, family_id: uuid.UUID, expires_at: datetime
    ) -> RefreshToken: ...
    def get_by_hash(self, token_hash: str) -> RefreshToken | None: ...
    def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None: ...
    def revoke(self, token: RefreshToken) -> None: ...
    def revoke_family(self, family_id: uuid.UUID) -> None: ...
    def revoke_all_for_user(self, user_id: uuid.UUID) -> None: ...


@dataclass(frozen=True)
class TokenPair:
    """An issued access token (returned in the response body) and the
    plaintext opaque refresh token (never returned in a body — the router
    sets it as an HttpOnly cookie per SEC-022 and discards this value).
    """

    access_token: str
    refresh_token: str
    expires_in: int


class AuthService:
    def __init__(
        self,
        *,
        users: UserServiceProtocol,
        refresh_tokens: RefreshTokenRepositoryProtocol,
        settings: Settings,
    ) -> None:
        self._users = users
        self._refresh_tokens = refresh_tokens
        self._settings = settings

    def register(self, *, email: str, password: str, display_name: str) -> User:
        """FR-010/FR-014. Deliberately does NOT log the new user in (§8.2:
        "redirected to login (not auto-logged-in, to keep auth flow
        single-path and testable)") — no tokens are issued here.
        """
        if self._users.get_by_email(email) is not None:
            raise ValidationFailedError(
                "Validation failed.",
                fields={"email": ["An account with this email already exists."]},
            )
        password_hash = hash_password(password)
        return self._users.create_user(
            email=email, password_hash=password_hash, display_name=display_name
        )

    def login(self, *, email: str, password: str) -> TokenPair:
        """FR-012. `InvalidCredentialsError` is raised identically whether
        the email doesn't exist, the password is wrong, or the account is
        suspended (Milestone 4, FR-041: "A suspended user cannot log in")
        — never reveal which, to avoid account enumeration. This reuses the
        same generic error `AuthService` already raises for a wrong
        password rather than introducing a distinct "ACCOUNT_SUSPENDED"
        code: telling an anonymous caller "this specific account exists and
        is suspended" leaks exactly the account-existence information
        `InvalidCredentialsError` exists to withhold. A legitimately
        suspended user already learns why through the same out-of-band
        channel this product uses for every other human-mediated
        interaction (§2, §8.5) — the API response itself doesn't need to
        say it.
        """
        user = self._users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise InvalidCredentialsError()
        if not user.is_active:
            raise InvalidCredentialsError()
        return self._issue_token_pair(user_id=user.id, family_id=uuid.uuid4())

    def refresh(self, *, presented_token: str) -> TokenPair:
        """SEC-023/024: rotate on every use; presenting an already-rotated
        (revoked) token is treated as evidence of theft and revokes the
        entire family, forcing full re-authentication.

        Reads via `get_by_hash_for_update` (a row lock), not the plain
        `get_by_hash` — without it, two requests presenting the same
        not-yet-rotated token concurrently (e.g. two tabs of one session
        both restoring on mount) both observe `revoked=False` before either
        commits, so both rotate it: at least two valid tokens end up
        issued from what should be a single linear chain, and a stolen
        -token replay racing a legitimate refresh could win outright
        instead of being caught. The lock makes exactly one such request
        the winner, deterministically.

        Known residual limitation, not fixed by the lock above: the
        *loser* of that race, once unblocked, correctly finds the token
        `revoked` and revokes the whole family (`revoke_family` below) —
        which also revokes the *winner's* brand-new token, since family
        -wide revocation can't distinguish "this is stale reuse from
        earlier" from "this was rotated a few milliseconds ago by a
        concurrent, equally-legitimate request." So a genuine multi-tab
        race can still force a full re-login for the tab that "won." Fully
        closing this would need a time-boxed grace period on top of the
        reuse check (the standard mitigation real-world OAuth providers
        use for exactly this race) — that's a real behavior change to the
        reuse-detection model, not a bugfix, so it's left as a documented
        trade-off rather than made here.
        """
        token_hash = hash_refresh_token(presented_token, self._settings)
        stored = self._refresh_tokens.get_by_hash_for_update(token_hash)

        if stored is None or stored.expires_at < datetime.now(UTC):
            raise InvalidRefreshTokenError()

        if stored.revoked:
            self._refresh_tokens.revoke_family(stored.family_id)
            raise InvalidRefreshTokenError()

        self._refresh_tokens.revoke(stored)
        return self._issue_token_pair(user_id=stored.user_id, family_id=stored.family_id)

    def logout(self, *, presented_token: str) -> None:
        """FR-013. Idempotent by design: revoking a token that's already
        revoked, or that isn't found at all (stale/forged cookie), is not an
        error — the caller is already authenticated via their access token
        (that's what makes this a "User"-level endpoint per §12.2), so the
        worst case is "there was nothing left to revoke," not "unauthorized".
        """
        token_hash = hash_refresh_token(presented_token, self._settings)
        stored = self._refresh_tokens.get_by_hash(token_hash)
        if stored is not None and not stored.revoked:
            self._refresh_tokens.revoke(stored)

    def revoke_all_tokens_for_user(self, user_id: uuid.UUID) -> None:
        """SEC-025 (Milestone 4): the auth-side half of suspending a user —
        called by `AdminService.suspend_user`, which also flips
        `User.is_active` via `UserService` (BE-002: admin orchestrates
        across module boundaries; each module owns only its own primitive).
        Revokes every `RefreshToken` row for this user across every family,
        not just one — this is what makes suspension immediately block
        further refresh/re-login. It deliberately does NOT and cannot touch
        an access token already issued: that's a stateless JWT (SEC-020),
        so it remains valid until its own ≤15-minute expiry regardless —
        the accepted "bounded-immediate, not instantaneous" trade-off this
        SRS documents as SEC-025 (the document's own cross-reference to
        this calls it "§15.4a", which does not exist as an actual section
        in this SRS revision — SEC-025, in §15.3, is the actual content;
        flagged as a documentation issue in IMPLEMENTATION_SUMMARY.md, not
        a reason to guess at different behavior).
        """
        self._refresh_tokens.revoke_all_for_user(user_id)

    def _issue_token_pair(self, *, user_id: uuid.UUID, family_id: uuid.UUID) -> TokenPair:
        access_token = create_access_token(user_id, self._settings)
        refresh_token = generate_refresh_token()
        self._refresh_tokens.create(
            user_id=user_id,
            token_hash=hash_refresh_token(refresh_token, self._settings),
            family_id=family_id,
            expires_at=datetime.now(UTC) + timedelta(days=self._settings.refresh_token_ttl_days),
        )
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=self._settings.access_token_ttl_minutes * 60,
        )


def build_auth_service(db: Session, settings: Settings) -> AuthService:
    """Production wiring: real `UserService`/`RefreshTokenRepository` bound
    to a request-scoped `Session`. The only place these concrete classes and
    `AuthService` are wired together — routes call this, never `AuthService`
    directly, and unit tests never call this at all.
    """
    return AuthService(
        users=UserService(db),
        refresh_tokens=RefreshTokenRepository(db),
        settings=settings,
    )
