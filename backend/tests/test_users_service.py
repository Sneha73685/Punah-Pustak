"""Unit tests for `UserService`'s Milestone 3 additions (TEST-001).

`UserService`'s constructor takes a real `Session` directly (Milestone 1's
existing design — unlike `AuthService`/`ListingService`, it has no
Protocol-typed collaborator to fake), so there is no way to construct one
without *a* `Session` object to hand it. These tests still avoid touching
the database for anything that matters: every `User` here is a plain,
never-persisted object (constructed directly, exactly like
`test_auth_service.py`'s `_make_user` helper does), so `UserRepository`'s
`self._db.flush()` calls are no-ops against the session's pending state —
what's actually under test is the business logic (password verification,
which fields get mutated, whether `must_change_password` is cleared), not
persistence. Real, round-trip persistence is covered separately in
`test_users_repository.py` (TEST-002).
"""

import uuid

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationFailedError
from app.modules.auth.security import hash_password, verify_password
from app.modules.users.models import RoleEnum, User
from app.modules.users.service import UserService


def _make_user(**overrides: object) -> User:
    defaults: dict[str, object] = {
        "id": uuid.uuid4(),
        "email": f"{uuid.uuid4()}@example.com",
        "password_hash": hash_password("original-password"),
        "display_name": "Original Name",
        "role": RoleEnum.USER,
        "is_active": True,
        "must_change_password": False,
    }
    defaults.update(overrides)
    return User(**defaults)


class TestUpdateDisplayName:
    def test_happy_path(self, db_session: Session) -> None:
        user = _make_user()
        service = UserService(db_session)

        updated = service.update_display_name(user, "New Name")

        assert updated is user
        assert updated.display_name == "New Name"


class TestChangePassword:
    def test_happy_path_rehashes_and_clears_forced_flag(self, db_session: Session) -> None:
        """FR-031/FR-015: the forced-change case — `current_password` is
        the one-time temporary password from FR-045, verified identically
        to a remembered one.
        """
        user = _make_user(
            password_hash=hash_password("temp-password-123"), must_change_password=True
        )
        service = UserService(db_session)

        service.change_password(
            user, current_password="temp-password-123", new_password="brand-new-password"
        )

        assert verify_password("brand-new-password", user.password_hash)
        assert not verify_password("temp-password-123", user.password_hash)
        assert user.must_change_password is False

    def test_self_initiated_change_when_flag_already_false_is_a_no_op_on_the_flag(
        self, db_session: Session
    ) -> None:
        """FR-031's ordinary (non-forced) case: the flag was already False
        and stays False — clearing it is a harmless no-op, not something
        that needs special-casing.
        """
        user = _make_user(
            password_hash=hash_password("original-password"), must_change_password=False
        )
        service = UserService(db_session)

        service.change_password(
            user, current_password="original-password", new_password="a-new-password-value"
        )

        assert user.must_change_password is False
        assert verify_password("a-new-password-value", user.password_hash)

    def test_wrong_current_password_is_rejected_and_does_not_change_hash(
        self, db_session: Session
    ) -> None:
        user = _make_user(password_hash=hash_password("original-password"))
        service = UserService(db_session)
        original_hash = user.password_hash

        with pytest.raises(ValidationFailedError) as exc_info:
            service.change_password(
                user, current_password="totally-wrong", new_password="a-new-password-value"
            )

        assert exc_info.value.fields == {"current_password": ["Current password is incorrect."]}
        assert user.password_hash == original_hash
        assert user.must_change_password is False
