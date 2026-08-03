"""Data access for `User` (BE-001: repositories are the only layer that
issues SQLAlchemy queries against this module's models).
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationFailedError
from app.modules.users.models import RoleEnum, User


@dataclass(frozen=True)
class Page:
    """Mirrors `app.modules.listings.repository.Page`'s shape for the same
    reason that one exists: API-003's pagination metadata (`total`, `page`,
    `page_size`) is generic, but a literal `Page[T]` generic wasn't
    introduced across modules for a single two-field dataclass — that would
    couple `users` and `listings` together (or push both through a shared
    `app.core` type) for a shape this trivial to duplicate. FR-040 is the
    only user of this (`GET /admin/users`).
    """

    items: list[User]
    total: int


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
        whether it was set — a successful password change (self-initiated
        or completing the forced-change flow, FR-015) always means the
        account is no longer pending one. Setting it to `False` when it was
        already `False` is a harmless no-op, not a special case to branch
        on. Distinct from `set_temporary_password` below, which sets the
        opposite value — the two are never interchangeable.
        """
        user.password_hash = password_hash
        user.must_change_password = False
        self._db.flush()
        return user

    def set_temporary_password(self, user: User, password_hash: str) -> User:
        """FR-045 (Milestone 4): the admin-assisted reset's counterpart to
        `set_password` above — sets `must_change_password = True` (the
        opposite value) rather than clearing it, since the whole point of
        an admin-issued temporary password is to force the target through
        FR-015's change-password flow on next login. Two separate methods
        rather than one parameterized by a boolean: the two call sites
        (self-service change vs. admin-triggered reset) are conceptually
        opposite operations that happen to touch the same two columns, and
        a boolean flag parameter (`set_password(user, hash, clear_flag=...)`)
        would obscure which caller means which at every call site.
        """
        user.password_hash = password_hash
        user.must_change_password = True
        self._db.flush()
        return user

    def suspend(self, user: User) -> User:
        """FR-041/UC-6 (Milestone 4). Does not touch `RefreshToken` rows —
        that's `auth`'s domain (SEC-025), orchestrated by `AdminService`
        calling both this and `AuthService.revoke_all_tokens_for_user`
        (BE-002: each module owns only its own primitive).
        """
        user.is_active = False
        self._db.flush()
        return user

    def reinstate(self, user: User) -> User:
        """FR-041/UC-6 (Milestone 4)."""
        user.is_active = True
        self._db.flush()
        return user

    def list_users(self, *, page: int, page_size: int) -> Page:
        """FR-040: "list all users with basic metadata" — every user,
        admins included (FR-040 doesn't say to exclude them, unlike the
        admin-target restrictions on suspend/reinstate/reset-password,
        which are about who can be *acted on*, not who appears in a list).

        Orders by `created_at DESC, id DESC`, not `created_at DESC` alone.
        This is a bugfix, discovered by this method's own test: Postgres's
        `now()` (this project's `server_default` for every `created_at`
        column, including `User.created_at`) returns the *transaction's*
        start time, not the statement's, so multiple rows inserted within
        one transaction can share a byte-for-byte identical `created_at`
        — confirmed directly against a real transaction while writing this
        method's test, which failed on a strict newest-first ordering
        assertion because three users created back-to-back in the same
        test transaction all got the exact same timestamp. `ORDER BY
        created_at DESC` alone never actually guaranteed stable pagination
        for ties either way (Postgres may return tied rows in any order on
        repeated execution), so this was a latent bug, not a new one — it
        just needed a test that created multiple rows in one transaction
        to surface. `id` (already a unique primary key) is a free,
        always-available tiebreaker. The identical issue was found and
        fixed the same way in `ListingRepository.browse`/`list_all`/
        `get_by_owner` — see IMPLEMENTATION_SUMMARY.md.
        """
        total = self._db.scalar(select(func.count()).select_from(User)) or 0
        items_query = (
            select(User)
            .order_by(User.created_at.desc(), User.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        items = list(self._db.scalars(items_query))
        return Page(items=items, total=total)
