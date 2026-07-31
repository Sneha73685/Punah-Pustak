"""User service — the `users` module's public interface (BE-002).

Other modules (starting with `auth` in Milestone 1) MUST call into this
service rather than importing `UserRepository`/`User` directly — that is
what "cross-module calls go through service interfaces, not direct
repository access" means in practice. Business logic that belongs to the
`users` domain (account creation, profile edits, password changes) lives
here, not duplicated into whichever module happens to call it first.

BE-001: services MUST NOT import FastAPI request/response types. `change_password`
raises `app.core.exceptions.DomainError` subclasses on failure, translated
centrally by `app.core.errors` — this module never builds an HTTP response.
"""

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import ValidationFailedError
from app.modules.auth.security import hash_password, verify_password
from app.modules.users.models import User
from app.modules.users.repository import UserRepository


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
