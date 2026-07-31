"""Integration tests for `UserRepository`'s Milestone 3 additions
(`update_display_name`, `set_password`) against the real, migrated
Postgres schema (TEST-002). Milestone 1's methods (`get_by_email`,
`get_by_id`, `create`) are already covered in `test_auth_repository.py`;
this file adds coverage for what Milestone 3 introduces rather than
duplicating that.
"""

from sqlalchemy.orm import Session

from app.modules.users.models import User
from app.modules.users.repository import UserRepository


def _make_user(
    db_session: Session,
    *,
    email: str = "profile-target@example.com",
    password_hash: str = "argon2id$placeholder",
    display_name: str = "Original Name",
) -> User:
    return UserRepository(db_session).create(
        email=email, password_hash=password_hash, display_name=display_name
    )


class TestUpdateDisplayName:
    def test_persists_the_new_display_name(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        user = _make_user(db_session, display_name="Old Name")

        repo.update_display_name(user, "New Name")

        db_session.expire_all()
        fetched = db_session.get(User, user.id)
        assert fetched is not None
        assert fetched.display_name == "New Name"

    def test_does_not_touch_other_fields(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        user = _make_user(db_session, email="untouched@example.com")
        original_hash = user.password_hash

        repo.update_display_name(user, "Renamed")

        assert user.email == "untouched@example.com"
        assert user.password_hash == original_hash


class TestSetPassword:
    def test_persists_the_new_hash_and_clears_forced_flag(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        user = _make_user(db_session, password_hash="old-hash")
        user.must_change_password = True
        db_session.flush()

        repo.set_password(user, "new-hash")

        db_session.expire_all()
        fetched = db_session.get(User, user.id)
        assert fetched is not None
        assert fetched.password_hash == "new-hash"
        assert fetched.must_change_password is False

    def test_clears_flag_even_when_already_false(self, db_session: Session) -> None:
        """FR-031's ordinary (non-forced) path — no special-casing needed
        for "the flag wasn't set to begin with".
        """
        repo = UserRepository(db_session)
        user = _make_user(db_session, password_hash="old-hash")
        assert user.must_change_password is False

        repo.set_password(user, "new-hash")

        db_session.expire_all()
        fetched = db_session.get(User, user.id)
        assert fetched is not None
        assert fetched.must_change_password is False
