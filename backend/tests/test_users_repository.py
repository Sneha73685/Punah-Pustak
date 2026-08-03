"""Integration tests for `UserRepository`'s Milestone 3 additions
(`update_display_name`, `set_password`) and Milestone 4 additions
(`suspend`, `reinstate`, `set_temporary_password`, `list_users`) against
the real, migrated Postgres schema (TEST-002). Milestone 1's methods
(`get_by_email`, `get_by_id`, `create`) are already covered in
`test_auth_repository.py`; this file adds coverage for what later
milestones introduce rather than duplicating that.
"""

import uuid
from datetime import UTC, datetime, timedelta

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


class TestSetTemporaryPassword:
    """Milestone 4, FR-045: the admin-assisted reset's counterpart to
    `TestSetPassword` above — sets the *opposite* `must_change_password`
    value.
    """

    def test_persists_the_new_hash_and_sets_forced_flag(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        user = _make_user(db_session, password_hash="old-hash")
        assert user.must_change_password is False

        repo.set_temporary_password(user, "temp-hash")

        db_session.expire_all()
        fetched = db_session.get(User, user.id)
        assert fetched is not None
        assert fetched.password_hash == "temp-hash"
        assert fetched.must_change_password is True

    def test_sets_flag_even_when_already_true(self, db_session: Session) -> None:
        """A second reset before the first temporary password was ever
        used is legitimate — the flag simply stays `True`.
        """
        repo = UserRepository(db_session)
        user = _make_user(db_session, password_hash="old-hash")
        user.must_change_password = True
        db_session.flush()

        repo.set_temporary_password(user, "second-temp-hash")

        db_session.expire_all()
        fetched = db_session.get(User, user.id)
        assert fetched is not None
        assert fetched.password_hash == "second-temp-hash"
        assert fetched.must_change_password is True


class TestSuspendReinstate:
    """Milestone 4, FR-041/UC-6."""

    def test_suspend_persists_is_active_false(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        user = _make_user(db_session)
        assert user.is_active is True

        repo.suspend(user)

        db_session.expire_all()
        fetched = db_session.get(User, user.id)
        assert fetched is not None
        assert fetched.is_active is False

    def test_reinstate_persists_is_active_true(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        user = _make_user(db_session)
        repo.suspend(user)

        repo.reinstate(user)

        db_session.expire_all()
        fetched = db_session.get(User, user.id)
        assert fetched is not None
        assert fetched.is_active is True

    def test_suspend_does_not_touch_other_fields(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        user = _make_user(db_session, display_name="Untouched Name")

        repo.suspend(user)

        assert user.display_name == "Untouched Name"


class TestListUsers:
    """Milestone 4, FR-040."""

    def test_returns_every_created_user(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        created_ids = {
            _make_user(db_session, email=f"{uuid.uuid4()}@example.com").id for _ in range(3)
        }

        page = repo.list_users(page=1, page_size=50)

        returned_ids = {user.id for user in page.items}
        assert created_ids <= returned_ids
        assert page.total >= 3

    def test_orders_newest_first_when_created_at_differs(self, db_session: Session) -> None:
        """Explicit `created_at` values (bypassing the column's `server_default`
        by assigning before flush) rather than relying on two real
        `INSERT`s far enough apart in wall-clock time to differ — see
        `UserRepository.list_users`'s own docstring for why that would be
        unreliable: Postgres's `now()` returns the *transaction's* start
        time, so two rows inserted in the same transaction (exactly what
        `db_session` gives every test) get an identical `created_at`
        regardless of how much real time elapses between the two `create`
        calls in Python.
        """
        repo = UserRepository(db_session)
        older = _make_user(db_session, email=f"{uuid.uuid4()}@example.com")
        older.created_at = datetime.now(UTC) - timedelta(days=1)
        newer = _make_user(db_session, email=f"{uuid.uuid4()}@example.com")
        newer.created_at = datetime.now(UTC)
        db_session.flush()

        page = repo.list_users(page=1, page_size=50)

        ids_in_order = [user.id for user in page.items]
        assert ids_in_order.index(newer.id) < ids_in_order.index(older.id)

    def test_pagination_has_no_duplicates_or_gaps_across_pages(self, db_session: Session) -> None:
        """The regression this file's `created_at`-tiebreaker bugfix
        actually guards against: without a deterministic `ORDER BY`,
        Postgres is free to return tied rows in a different order on each
        query execution, which can silently duplicate or drop rows across
        offset-paginated pages. Five users created here all land in the
        same transaction and therefore (per the bug this fixes) the same
        `created_at` — exactly the condition that used to make this flaky.
        """
        repo = UserRepository(db_session)
        created_ids = {
            _make_user(db_session, email=f"{uuid.uuid4()}@example.com").id for _ in range(5)
        }

        page_1 = repo.list_users(page=1, page_size=2)
        page_2 = repo.list_users(page=2, page_size=2)
        page_3 = repo.list_users(page=3, page_size=2)

        assert len(page_1.items) == 2
        assert len(page_2.items) == 2
        assert len(page_3.items) == 1
        all_returned = [u.id for u in page_1.items + page_2.items + page_3.items]
        assert len(all_returned) == len(set(all_returned)), "pagination returned a duplicate row"
        assert created_ids <= set(all_returned)
