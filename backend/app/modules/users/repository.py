"""Data access for `User` (BE-001: repositories are the only layer that
issues SQLAlchemy queries against this module's models).
"""

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationFailedError
from app.modules.users.models import RoleEnum, User


class UserRepository:
    """Thin wrapper around `Session` for `User` — no business rules here,
    only persistence. FR-014 (case-insensitive duplicate rejection) is
    enforced by the `citext` column type + unique constraint (DB-004), not
    by application logic in this repository — `create` below exists to
    translate a violation of that constraint into the shared `DomainError`
    vocabulary, not to duplicate the check itself.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_email(self, email: str) -> User | None:
        return self._db.query(User).filter(User.email == email).one_or_none()

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._db.get(User, user_id)

    def create(self, *, email: str, password_hash: str, display_name: str) -> User:
        """Raises `ValidationFailedError` if `email` is already taken.

        `AuthService.register` already checks `get_by_email` first so the
        common case never reaches the database with a doomed insert, but
        that check-then-write is inherently racy under concurrent
        registrations for the same email — the citext unique constraint
        (DB-004) is the actual source of truth, not the pre-check. Without
        this except clause, a concurrent duplicate raises a raw
        `IntegrityError` that reaches the client as an opaque 500 instead
        of the same clean 422 the pre-check path already returns; the
        session must also be rolled back here (not left by the caller),
        since a failed flush leaves the transaction unusable until it is.
        """
        user = User(
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            role=RoleEnum.USER,
        )
        self._db.add(user)
        try:
            self._db.flush()
        except IntegrityError as exc:
            self._db.rollback()
            raise ValidationFailedError(
                "Validation failed.",
                fields={"email": ["An account with this email already exists."]},
            ) from exc
        return user

    def update_display_name(self, user: User, display_name: str) -> User:
        """FR-030. No uniqueness or format constraint beyond schema-level
        length limits (§7.4 states none) — unlike `email`, `display_name` is
        not an identifier.
        """
        user.display_name = display_name
        self._db.flush()
        return user

    def set_password(self, user: User, password_hash: str) -> User:
        """FR-031. Always clears `must_change_password`, regardless of
        whether it was set — this is the only place in the codebase that
        writes a new `password_hash` after registration (FR-045's admin
        -assisted reset, Milestone 4, will be the other), and in both the
        self-initiated and forced-change cases (FR-015) a successful
        password change means the account is no longer in a
        pending-forced-change state. Setting it to `False` when it was
        already `False` is a harmless no-op, not a special case to branch
        on.
        """
        user.password_hash = password_hash
        user.must_change_password = False
        self._db.flush()
        return user
