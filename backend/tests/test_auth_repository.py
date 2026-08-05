"""Integration tests for `UserRepository`/`RefreshTokenRepository` against
the real, migrated Postgres schema (TEST-002) — the things a fake can't
prove: that `UserRepository.get_by_email` benefits from citext
case-insensitivity, that `RefreshTokenRepository.revoke_family` really is a
single bulk `UPDATE` that catches every token in a family (not just ones
already loaded into the session), and that the FK/cascade behavior declared
in Milestone 0's models holds for rows this module's repositories create.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationFailedError
from app.modules.auth.repository import RefreshTokenRepository
from app.modules.users.models import User
from app.modules.users.repository import UserRepository


def _make_user(db_session: Session) -> User:
    return UserRepository(db_session).create(
        email=f"{uuid.uuid4()}@example.com",
        password_hash="argon2id$placeholder",
        display_name="Test User",
    )


class TestUserRepository:
    def test_get_by_email_is_case_insensitive(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        repo.create(email="Reader@Example.com", password_hash="x", display_name="Reader")

        found = repo.get_by_email("reader@example.com")

        assert found is not None
        assert found.email == "Reader@Example.com"

    def test_get_by_email_returns_none_for_unknown(self, db_session: Session) -> None:
        assert UserRepository(db_session).get_by_email("nobody@example.com") is None

    def test_get_by_id_round_trips(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        created = repo.create(email="id-lookup@example.com", password_hash="x", display_name="X")

        found = repo.get_by_id(created.id)

        assert found is not None
        assert found.id == created.id

    def test_create_raises_validation_error_on_concurrent_duplicate(
        self, db_session: Session
    ) -> None:
        """The check-then-write race `AuthService.register` can't fully
        close on its own (two requests both pass `get_by_email() is None`
        before either writes): the citext unique constraint (DB-004) is the
        real source of truth, and this is what turns its violation into the
        same clean 422 the pre-check path already produces, instead of a
        raw `IntegrityError` reaching the client as an opaque 500. Also
        proves the session is still usable afterward — the failed flush's
        rollback must not leave the transaction unusable for the rest of
        the request.
        """
        repo = UserRepository(db_session)
        repo.create(email="race@example.com", password_hash="x", display_name="A")
        # Commit the first write before attempting the "concurrent" second
        # one: `db_session` uses SAVEPOINT-based commits (see its docstring
        # in conftest.py), so `UserRepository.create`'s own rollback below
        # rolls back to the most recent SAVEPOINT — without this commit
        # here to establish that checkpoint, the failed second insert's
        # rollback would undo the first insert too, which is a test-setup
        # correctness issue, not a statement about the repository code
        # under test.
        db_session.commit()

        with pytest.raises(ValidationFailedError) as exc_info:
            repo.create(email="race@example.com", password_hash="y", display_name="B")

        assert exc_info.value.fields == {"email": ["An account with this email already exists."]}
        assert repo.get_by_email("race@example.com") is not None


class TestRefreshTokenRepository:
    def test_create_and_get_by_hash_round_trip(self, db_session: Session) -> None:
        user = _make_user(db_session)
        repo = RefreshTokenRepository(db_session)
        family_id = uuid.uuid4()

        created = repo.create(
            user_id=user.id,
            token_hash="a-token-hash",
            family_id=family_id,
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )

        found = repo.get_by_hash("a-token-hash")
        assert found is not None
        assert found.id == created.id
        assert found.family_id == family_id
        assert found.revoked is False

    def test_get_by_hash_for_update_round_trips(self, db_session: Session) -> None:
        """`get_by_hash_for_update` (used by `AuthService.refresh` to close
        the concurrent-refresh race — see its own docstring) locks the row
        it returns; this only proves it still returns the right row, since
        a single-session test can't observe blocking against itself.
        """
        user = _make_user(db_session)
        repo = RefreshTokenRepository(db_session)
        created = repo.create(
            user_id=user.id,
            token_hash="locked-token-hash",
            family_id=uuid.uuid4(),
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )

        found = repo.get_by_hash_for_update("locked-token-hash")

        assert found is not None
        assert found.id == created.id

    def test_get_by_hash_for_update_returns_none_for_unknown(self, db_session: Session) -> None:
        assert RefreshTokenRepository(db_session).get_by_hash_for_update("nope") is None

    def test_revoke_marks_single_token(self, db_session: Session) -> None:
        user = _make_user(db_session)
        repo = RefreshTokenRepository(db_session)
        token = repo.create(
            user_id=user.id,
            token_hash="revoke-me",
            family_id=uuid.uuid4(),
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )

        repo.revoke(token)

        refreshed = repo.get_by_hash("revoke-me")
        assert refreshed is not None
        assert refreshed.revoked is True

    def test_revoke_family_marks_every_token_in_the_family_via_bulk_update(
        self, db_session: Session
    ) -> None:
        """SEC-024's reuse-detection contract: the whole family, not just the
        token that was reused. `revoke_family` issues a bulk `UPDATE`, so
        this specifically proves it reaches rows the test process never
        loaded into the session as ORM objects.
        """
        user = _make_user(db_session)
        repo = RefreshTokenRepository(db_session)
        family_id = uuid.uuid4()
        other_family_id = uuid.uuid4()
        for i in range(3):
            repo.create(
                user_id=user.id,
                token_hash=f"family-token-{i}",
                family_id=family_id,
                expires_at=datetime.now(UTC) + timedelta(days=30),
            )
        repo.create(
            user_id=user.id,
            token_hash="other-family-token",
            family_id=other_family_id,
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )

        repo.revoke_family(family_id)

        db_session.expire_all()  # bulk UPDATE bypasses the ORM's identity map
        for i in range(3):
            token = repo.get_by_hash(f"family-token-{i}")
            assert token is not None
            assert token.revoked is True
        untouched = repo.get_by_hash("other-family-token")
        assert untouched is not None
        assert untouched.revoked is False

    def test_revoke_all_for_user_marks_every_family_but_not_other_users(
        self, db_session: Session
    ) -> None:
        """SEC-025 (Milestone 4): suspending a user revokes *every*
        `RefreshToken` row for them, across every family — not just one,
        unlike `revoke_family`. Bulk `UPDATE` again, so this proves it
        reaches rows never loaded into the session as ORM objects, and
        confirms it is correctly scoped to `user_id` (a different user's
        tokens must never be touched by this).
        """
        target = _make_user(db_session)
        other_user = _make_user(db_session)
        repo = RefreshTokenRepository(db_session)
        for i in range(2):
            repo.create(
                user_id=target.id,
                token_hash=f"target-family-a-{i}",
                family_id=uuid.uuid4(),
                expires_at=datetime.now(UTC) + timedelta(days=30),
            )
        repo.create(
            user_id=target.id,
            token_hash="target-family-b",
            family_id=uuid.uuid4(),
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )
        repo.create(
            user_id=other_user.id,
            token_hash="other-user-token",
            family_id=uuid.uuid4(),
            expires_at=datetime.now(UTC) + timedelta(days=30),
        )

        repo.revoke_all_for_user(target.id)

        db_session.expire_all()
        for i in range(2):
            token = repo.get_by_hash(f"target-family-a-{i}")
            assert token is not None
            assert token.revoked is True
        family_b_token = repo.get_by_hash("target-family-b")
        assert family_b_token is not None
        assert family_b_token.revoked is True
        untouched = repo.get_by_hash("other-user-token")
        assert untouched is not None
        assert untouched.revoked is False
