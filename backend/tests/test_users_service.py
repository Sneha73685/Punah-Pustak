"""Unit tests for `UserService`'s Milestone 3 and Milestone 4 additions
(TEST-001).

`UserService`'s constructor takes a real `Session` directly (Milestone 1's
existing design — unlike `AuthService`/`ListingService`, it has no
Protocol-typed collaborator to fake), so there is no way to construct one
without *a* `Session` object to hand it. These tests still avoid touching
the database for anything that matters: every `User` here is a plain,
never-persisted object (constructed directly, exactly like
`test_auth_service.py`'s `_make_user` helper does), so `UserRepository`'s
`self._db.flush()` calls are no-ops against the session's pending state —
what's actually under test is the business logic (password verification,
which fields get mutated, whether `must_change_password` is cleared,
suspend/reinstate preconditions), not persistence. Real, round-trip
persistence is covered separately in `test_users_repository.py` (TEST-002).
"""

import uuid

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ForbiddenError, ValidationFailedError
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


class TestSuspend:
    """Milestone 4, FR-041/UC-6."""

    def test_happy_path(self, db_session: Session) -> None:
        user = _make_user(role=RoleEnum.USER, is_active=True)
        service = UserService(db_session)

        updated = service.suspend(user)

        assert updated is user
        assert updated.is_active is False

    def test_admin_target_is_forbidden(self, db_session: Session) -> None:
        """UC-6: "admins cannot suspend other admins via this endpoint —
        prevents privilege-escalation footguns."
        """
        admin = _make_user(role=RoleEnum.ADMIN, is_active=True)
        service = UserService(db_session)

        with pytest.raises(ForbiddenError):
            service.suspend(admin)

        assert admin.is_active is True  # untouched — the check runs before any mutation

    def test_already_suspended_is_conflict(self, db_session: Session) -> None:
        """UC-6 states "target is not already suspended" as a precondition
        — see `UserService.suspend`'s docstring for why this is a 409, not
        a silent idempotent no-op (unlike FR-029's listing-delete case).
        """
        user = _make_user(role=RoleEnum.USER, is_active=False)
        service = UserService(db_session)

        with pytest.raises(ConflictError):
            service.suspend(user)


class TestReinstate:
    """Milestone 4, FR-041/UC-6."""

    def test_happy_path(self, db_session: Session) -> None:
        user = _make_user(role=RoleEnum.USER, is_active=False)
        service = UserService(db_session)

        updated = service.reinstate(user)

        assert updated is user
        assert updated.is_active is True

    def test_admin_target_is_forbidden(self, db_session: Session) -> None:
        admin = _make_user(role=RoleEnum.ADMIN, is_active=True)
        service = UserService(db_session)

        with pytest.raises(ForbiddenError):
            service.reinstate(admin)

    def test_already_active_is_conflict(self, db_session: Session) -> None:
        user = _make_user(role=RoleEnum.USER, is_active=True)
        service = UserService(db_session)

        with pytest.raises(ConflictError):
            service.reinstate(user)


class TestResetPassword:
    """Milestone 4, FR-045/UC-7."""

    def test_happy_path_returns_a_working_temporary_password_and_sets_forced_flag(
        self, db_session: Session
    ) -> None:
        user = _make_user(
            role=RoleEnum.USER,
            password_hash=hash_password("original-password"),
            must_change_password=False,
        )
        service = UserService(db_session)

        temporary_password = service.reset_password(user)

        assert verify_password(temporary_password, user.password_hash)
        assert not verify_password("original-password", user.password_hash)
        assert user.must_change_password is True
        # SEC-011: admin-generated temporary passwords SHOULD exceed the
        # 10-character minimum (the SRS's own example: 16+ characters).
        assert len(temporary_password) >= 16

    def test_admin_target_is_forbidden(self, db_session: Session) -> None:
        """UC-7's exception flow: "Target is an admin -> 403"."""
        admin = _make_user(role=RoleEnum.ADMIN)
        service = UserService(db_session)
        original_hash = admin.password_hash

        with pytest.raises(ForbiddenError):
            service.reset_password(admin)

        assert admin.password_hash == original_hash  # untouched
        assert admin.must_change_password is False

    def test_two_consecutive_resets_both_succeed(self, db_session: Session) -> None:
        """Triggering a second reset before the first temporary password
        was ever used is legitimate — e.g. the first was lost before being
        relayed to the user out-of-band.
        """
        user = _make_user(role=RoleEnum.USER, must_change_password=True)
        service = UserService(db_session)

        first_temp = service.reset_password(user)
        second_temp = service.reset_password(user)

        assert first_temp != second_temp
        assert verify_password(second_temp, user.password_hash)
        assert not verify_password(first_temp, user.password_hash)
        assert user.must_change_password is True
