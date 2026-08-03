"""Admin service — moderation orchestration (§7.5, UC-6/UC-7).

BE-001: services MUST NOT import FastAPI request/response types. Failures
are `app.core.exceptions.DomainError` subclasses, translated centrally by
`app.core.errors` — this module never builds an HTTP response itself.

BE-002: `AdminService` is the orchestration layer for actions that span
module boundaries — suspending a user touches both `users` (`is_active`)
and `auth` (revoking refresh tokens, SEC-025); every admin action writes an
audit record (SEC-050) this module owns via `AdminActionRepository`. It
does this by calling into `UserService`/`ListingService`/`AuthService`
(taken as `Protocol`s, per the pattern `AuthService`/`ListingService`
already established, so unit tests can hand this class fully in-memory
fakes — TEST-001) rather than importing `UserRepository`/`ListingRepository`
directly — each module's own service still owns its own business rules
(e.g. "can't suspend an admin" lives in `UserService.suspend`, not
duplicated here); this module's own job is coordinating *across* those
rules and writing the audit trail, not reimplementing them.
"""

import uuid
from typing import Protocol

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import NotFoundError
from app.modules.admin.models import AdminAction, AdminActionTypeEnum, AdminTargetTypeEnum
from app.modules.admin.repository import AdminActionRepository
from app.modules.auth.service import build_auth_service
from app.modules.listings.models import ListingStatusEnum
from app.modules.listings.repository import ListingRepository
from app.modules.listings.repository import Page as ListingPage
from app.modules.listings.service import ListingService
from app.modules.storage.backend import StorageBackend
from app.modules.users.models import User
from app.modules.users.repository import Page as UserPage
from app.modules.users.service import UserService


class UserServiceProtocol(Protocol):
    def get_by_id(self, user_id: uuid.UUID) -> User | None: ...
    def list_users(self, *, page: int, page_size: int) -> UserPage: ...
    def suspend(self, target: User) -> User: ...
    def reinstate(self, target: User) -> User: ...
    def reset_password(self, target: User) -> str: ...


class ListingServiceProtocol(Protocol):
    def admin_list(
        self, *, status: ListingStatusEnum | None, page: int, page_size: int
    ) -> ListingPage: ...
    def admin_remove(self, listing_id: uuid.UUID) -> bool: ...


class AuthServiceProtocol(Protocol):
    def revoke_all_tokens_for_user(self, user_id: uuid.UUID) -> None: ...


class AdminActionRepositoryProtocol(Protocol):
    def create(
        self,
        *,
        admin_id: uuid.UUID,
        action_type: AdminActionTypeEnum,
        target_type: AdminTargetTypeEnum,
        target_id: uuid.UUID,
        reason_code: str | None = None,
    ) -> AdminAction: ...


class AdminService:
    def __init__(
        self,
        *,
        users: UserServiceProtocol,
        listings: ListingServiceProtocol,
        auth: AuthServiceProtocol,
        admin_actions: AdminActionRepositoryProtocol,
    ) -> None:
        self._users = users
        self._listings = listings
        self._auth = auth
        self._admin_actions = admin_actions

    def list_users(self, *, page: int, page_size: int) -> UserPage:
        """FR-040."""
        return self._users.list_users(page=page, page_size=page_size)

    def suspend_user(self, *, admin: User, target_user_id: uuid.UUID, reason_code: str) -> User:
        """FR-041/UC-6/SEC-025. Precondition checks (target isn't an admin,
        target isn't already suspended) live in `UserService.suspend`
        itself, not here — see that method's docstring for why. Ordering
        matters: `UserService.suspend` is called *first* and may raise
        (`ForbiddenError`/`ConflictError`) before either the token
        revocation or the audit write happens, so a rejected request has no
        side effects at all, not a partial one.
        """
        target = self._get_user_or_404(target_user_id)
        updated = self._users.suspend(target)
        self._auth.revoke_all_tokens_for_user(target.id)
        self._admin_actions.create(
            admin_id=admin.id,
            action_type=AdminActionTypeEnum.SUSPEND_USER,
            target_type=AdminTargetTypeEnum.USER,
            target_id=target.id,
            reason_code=reason_code,
        )
        return updated

    def reinstate_user(self, *, admin: User, target_user_id: uuid.UUID) -> User:
        """FR-041/UC-6. No `reason_code` (§10.1: only `remove_listing` and
        `suspend_user` require one) and no token-revocation counterpart to
        undo — reinstatement only lifts the login block; it doesn't need to
        issue anything, the user simply logs in normally afterward.
        """
        target = self._get_user_or_404(target_user_id)
        updated = self._users.reinstate(target)
        self._admin_actions.create(
            admin_id=admin.id,
            action_type=AdminActionTypeEnum.REINSTATE_USER,
            target_type=AdminTargetTypeEnum.USER,
            target_id=target.id,
            reason_code=None,
        )
        return updated

    def reset_password(self, *, admin: User, target_user_id: uuid.UUID) -> str:
        """FR-045/UC-7. Returns the plaintext temporary password — see
        `UserService.reset_password`'s docstring for why this is the only
        place it's ever available outside this one response.
        """
        target = self._get_user_or_404(target_user_id)
        temporary_password = self._users.reset_password(target)
        self._admin_actions.create(
            admin_id=admin.id,
            action_type=AdminActionTypeEnum.RESET_PASSWORD,
            target_type=AdminTargetTypeEnum.USER,
            target_id=target.id,
            reason_code=None,
        )
        return temporary_password

    def list_listings(
        self, *, status: ListingStatusEnum | None, page: int, page_size: int
    ) -> ListingPage:
        """FR-043."""
        return self._listings.admin_list(status=status, page=page, page_size=page_size)

    def remove_listing(self, *, admin: User, listing_id: uuid.UUID, reason_code: str) -> None:
        """FR-042/UC-5, and FR-029's admin-specific idempotency clause:
        "without creating a duplicate admin audit entry when performed by
        an admin." `ListingService.admin_remove` returns whether a real
        transition happened; the audit record is written only if it did —
        an already-`deleted` listing produces no new `AdminAction` row,
        satisfying FR-029 exactly.
        """
        transitioned = self._listings.admin_remove(listing_id)
        if transitioned:
            self._admin_actions.create(
                admin_id=admin.id,
                action_type=AdminActionTypeEnum.REMOVE_LISTING,
                target_type=AdminTargetTypeEnum.LISTING,
                target_id=listing_id,
                reason_code=reason_code,
            )

    def _get_user_or_404(self, user_id: uuid.UUID) -> User:
        user = self._users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found.")
        return user


def build_admin_service(db: Session, settings: Settings, storage: StorageBackend) -> AdminService:
    """Production wiring: real `UserService`/`ListingService`/`AuthService`/
    `AdminActionRepository` bound to a request-scoped `Session`. Mirrors
    `app.modules.auth.service.build_auth_service`'s existing pattern — the
    only place these concrete classes and `AdminService` are wired
    together; routes call this, unit tests never do.

    `storage` is required only because `ListingService.__init__` requires
    one (Milestone 2) — `AdminService`'s own listing operations
    (`admin_list`/`admin_remove`) never touch object storage themselves,
    but a `ListingService` instance can't be constructed without it.
    """
    return AdminService(
        users=UserService(db),
        listings=ListingService(listings=ListingRepository(db), storage=storage),
        auth=build_auth_service(db, settings),
        admin_actions=AdminActionRepository(db),
    )
