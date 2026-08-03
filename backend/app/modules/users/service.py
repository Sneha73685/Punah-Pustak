"""User service — the `users` module's public interface (BE-002).

Other modules (starting with `auth` in Milestone 1) MUST call into this
service rather than importing `UserRepository`/`User` directly — that is
what "cross-module calls go through service interfaces, not direct
repository access" means in practice. Business logic that belongs to the
`users` domain (account creation, profile edits, password changes,
suspension/reinstatement, admin-assisted password reset) lives here, not
duplicated into whichever module happens to call it first — including
`AdminService` (Milestone 4), which orchestrates this module together with
`auth` and its own audit log rather than reimplementing either's rules.

BE-001: services MUST NOT import FastAPI request/response types. Every
mutating method here raises `app.core.exceptions.DomainError` subclasses on
failure, translated centrally by `app.core.errors` — this module never
builds an HTTP response.
"""

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ForbiddenError, ValidationFailedError
from app.modules.auth.security import generate_temporary_password, hash_password, verify_password
from app.modules.users.models import RoleEnum, User
from app.modules.users.repository import Page, UserRepository


class UserService:
    def __init__(self, db: Session) -> None:
        self._repository = UserRepository(db)

    def get_by_email(self, email: str) -> User | None:
        return self._repository.get_by_email(email)

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._repository.get_by_id(user_id)

    def create_user(self, *, email: str, password_hash: str, display_name: str) -> User:
        """Persist a new user. Callers are responsible for password hashing
        (SEC-010) and for checking `get_by_email` first if they need to
        return a specific "already registered" error — the citext unique
        constraint (DB-004) is the authoritative enforcement either way, so
        a race between the check and the insert cannot create a duplicate.
        """
        return self._repository.create(
            email=email, password_hash=password_hash, display_name=display_name
        )

    def update_display_name(self, user: User, display_name: str) -> User:
        """FR-030. `user` is always the caller's own account — resolved
        exclusively from the verified access token via `get_current_user`
        (SEC-030) — never a client-supplied id, so there is no separate
        ownership check to perform here (the same reasoning Milestone 2's
        `ListingService.get_my_listings` already documents for the
        equivalent "inherently self-scoped" case).
        """
        return self._repository.update_display_name(user, display_name)

    def change_password(self, user: User, *, current_password: str, new_password: str) -> None:
        """FR-031/FR-015. `current_password` is verified identically whether
        it's a remembered password (self-initiated change) or the one-time
        temporary password from FR-045's admin-assisted reset (the forced
        -change flow) — both are "the password currently on the account",
        and `verify_password` doesn't need to know which case it is.

        A wrong `current_password` is a `ValidationFailedError` (422, field
        -level), the same class Milestone 1's duplicate-email registration
        case uses — this is "a well-formed request that fails a
        business-rule validation against existing state" (that class's own
        docstring), which describes this case exactly. `InvalidCredentialsError`
        (login's 401) was deliberately not reused here: that error's whole
        purpose is resisting account-enumeration for an *unauthenticated*
        caller ("never reveal which of email/password was wrong"); here the
        caller is already authenticated (a valid access token got them past
        `get_current_user_for_password_change`), so there is no
        enumeration risk left to hide, and a field-level `fields` error
        pointing at `current_password` is more useful to a real client than
        deliberately vague login-style wording would be.

        Returns `None`, not the updated `User`: the one caller
        (`POST /users/me/password`) responds `204 No Content` and has no use
        for it — the same "repository returns the mutated row, service
        returns only what its caller actually needs" split already used by
        `ListingService.delete`/`AuthService.logout` (both of which discard
        their repository call's return value for the same reason).
        """
        if not verify_password(current_password, user.password_hash):
            raise ValidationFailedError(
                "Validation failed.",
                fields={"current_password": ["Current password is incorrect."]},
            )
        self._repository.set_password(user, hash_password(new_password))

    def list_users(self, *, page: int, page_size: int) -> Page:
        """FR-040. No filtering, no ownership scoping — an admin-only
        capability (the router's `require_admin` dependency is what
        actually gates this; nothing here re-checks role, matching how
        `ListingService.browse` doesn't re-check "is this a guest" either
        — visibility/authorization is enforced once, at the boundary
        appropriate to it, not duplicated into every layer beneath it).
        """
        return self._repository.list_users(page=page, page_size=page_size)

    def suspend(self, target: User) -> User:
        """FR-041/UC-6 (Milestone 4). Owns both preconditions UC-6 states —
        target is not an admin, target is not already suspended — as this
        module's own state-machine legality, the same way
        `ListingService.mark_sold`/`delete` own `_require_available`/
        idempotency for `Listing` regardless of which caller (owner or
        admin) reaches them. `AdminService` orchestrates this together with
        `AuthService.revoke_all_tokens_for_user` (SEC-025) and its own audit
        log, but does not re-implement either precondition itself.

        Raises `ForbiddenError` (403) for an admin target — UC-6: "admins
        cannot suspend other admins via this endpoint — prevents privilege
        -escalation footguns." Raises `ConflictError` (409) if already
        suspended — UC-6 states this as a precondition, and (unlike FR-029's
        explicit idempotent-delete carve-out for listings) nothing in §7.5
        or §9 asks for suspend/reinstate to be idempotent no-ops instead;
        the absence of an explicit idempotency exception is read the same
        way API-011's general "409 state conflict" is used everywhere else
        in this codebase a precondition is violated without one.
        """
        if target.role == RoleEnum.ADMIN:
            raise ForbiddenError("Admin accounts cannot be suspended.")
        if not target.is_active:
            raise ConflictError("User is already suspended.")
        return self._repository.suspend(target)

    def reinstate(self, target: User) -> User:
        """FR-041/UC-6 (Milestone 4). Mirrors `suspend`'s preconditions —
        see that method's docstring for the reasoning behind both the
        admin-target restriction and the lack of idempotency.
        """
        if target.role == RoleEnum.ADMIN:
            raise ForbiddenError("Admin accounts cannot be reinstated via this endpoint.")
        if target.is_active:
            raise ConflictError("User is already active.")
        return self._repository.reinstate(target)

    def reset_password(self, target: User) -> str:
        """FR-045/UC-7 (Milestone 4): admin-assisted password reset. Raises
        `ForbiddenError` (403) for an admin target — UC-7's exception flow
        states this explicitly ("Target is an admin -> 403"), consistent
        with `suspend`/`reinstate`'s identical restriction. Unlike those
        two, there is no "already in this state" conflict to guard against
        — triggering a second reset before the first temporary password was
        ever used is legitimate (e.g., the admin needs to issue a fresh one
        because the first was lost before being relayed).

        Returns the plaintext temporary password — the one and only place
        it ever exists outside `generate_temporary_password`'s return value
        and the admin's own out-of-band relay to the user (FR-045: "return
        the temporary password once"). Never logged, never stored: only
        its Argon2id hash (`hash_password`, SEC-010) is persisted.
        """
        if target.role == RoleEnum.ADMIN:
            raise ForbiddenError("Cannot reset the password of an admin account.")
        temporary_password = generate_temporary_password()
        self._repository.set_temporary_password(target, hash_password(temporary_password))
        return temporary_password
