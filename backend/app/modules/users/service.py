"""User service — the `users` module's public interface (BE-002).

Other modules (starting with `auth` in Milestone 1) MUST call into this
service rather than importing `UserRepository`/`User` directly — that is
what "cross-module calls go through service interfaces, not direct
repository access" means in practice. Business logic that belongs to the
`users` domain (currently just "does this email already exist") lives here,
not duplicated into whichever module happens to call it first.
"""

import uuid

from sqlalchemy.orm import Session

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
