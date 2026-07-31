"""Unit tests for `AuthService` (TEST-001): `UserServiceProtocol` and
`RefreshTokenRepositoryProtocol` are faked with plain in-memory objects —
no database, no FastAPI, no HTTP anywhere in this file.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import Settings
from app.core.exceptions import (
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    ValidationFailedError,
)
from app.modules.auth.models import RefreshToken
from app.modules.auth.security import hash_password
from app.modules.auth.service import AuthService
from app.modules.auth.tokens import decode_access_token, hash_refresh_token
from app.modules.users.models import RoleEnum, User


def _make_settings() -> Settings:
    return Settings()


def _make_user(email: str = "reader@example.com", password: str = "correct-horse-battery") -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(password),
        display_name="Reader",
        role=RoleEnum.USER,
        is_active=True,
        must_change_password=False,
    )


class FakeUserService:
    """Fakes `UserServiceProtocol` (see `app.modules.auth.service`) — a
    plain in-memory dict, no database, no SQLAlchemy `Session`.
    """

    def __init__(self, users: list[User] | None = None) -> None:
        self._by_id: dict[uuid.UUID, User] = {u.id: u for u in (users or [])}

    def get_by_email(self, email: str) -> User | None:
        return next((u for u in self._by_id.values() if u.email.lower() == email.lower()), None)

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._by_id.get(user_id)

    def create_user(self, *, email: str, password_hash: str, display_name: str) -> User:
        user = User(
            id=uuid.uuid4(),
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            role=RoleEnum.USER,
            is_active=True,
            must_change_password=False,
        )
        self._by_id[user.id] = user
        return user


class FakeRefreshTokenRepository:
    """Fakes `RefreshTokenRepositoryProtocol` — a plain in-memory dict."""

    def __init__(self) -> None:
        self._by_hash: dict[str, RefreshToken] = {}

    def create(
        self, *, user_id: uuid.UUID, token_hash: str, family_id: uuid.UUID, expires_at: datetime
    ) -> RefreshToken:
        token = RefreshToken(
            id=uuid.uuid4(),
            user_id=user_id,
            token_hash=token_hash,
            family_id=family_id,
            revoked=False,
            expires_at=expires_at,
        )
        self._by_hash[token_hash] = token
        return token

    def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        return self._by_hash.get(token_hash)

    def revoke(self, token: RefreshToken) -> None:
        token.revoked = True

    def revoke_family(self, family_id: uuid.UUID) -> None:
        for token in self._by_hash.values():
            if token.family_id == family_id:
                token.revoked = True


@pytest.fixture
def settings() -> Settings:
    return _make_settings()


def _service(*, users: FakeUserService | None = None, settings: Settings) -> AuthService:
    return AuthService(
        users=users or FakeUserService(),
        refresh_tokens=FakeRefreshTokenRepository(),
        settings=settings,
    )


class TestRegister:
    def test_creates_user_with_hashed_password(self, settings: Settings) -> None:
        users = FakeUserService()
        service = AuthService(
            users=users, refresh_tokens=FakeRefreshTokenRepository(), settings=settings
        )

        user = service.register(
            email="new@example.com", password="a-long-enough-password", display_name="New"
        )

        assert user.email == "new@example.com"
        assert user.password_hash != "a-long-enough-password"  # never stored plaintext
        assert users.get_by_email("new@example.com") is user

    def test_rejects_duplicate_email(self, settings: Settings) -> None:
        existing = _make_user(email="dup@example.com")
        service = _service(users=FakeUserService([existing]), settings=settings)

        with pytest.raises(ValidationFailedError) as exc_info:
            service.register(
                email="dup@example.com", password="a-long-enough-password", display_name="Dup"
            )

        assert exc_info.value.fields == {"email": ["An account with this email already exists."]}


class TestLogin:
    def test_issues_token_pair_for_correct_credentials(self, settings: Settings) -> None:
        user = _make_user(password="correct-horse-battery")
        service = _service(users=FakeUserService([user]), settings=settings)

        pair = service.login(email=user.email, password="correct-horse-battery")

        assert decode_access_token(pair.access_token, settings) == user.id
        assert pair.expires_in == settings.access_token_ttl_minutes * 60

    def test_rejects_wrong_password(self, settings: Settings) -> None:
        user = _make_user(password="correct-horse-battery")
        service = _service(users=FakeUserService([user]), settings=settings)

        with pytest.raises(InvalidCredentialsError):
            service.login(email=user.email, password="wrong-password")

    def test_rejects_unknown_email(self, settings: Settings) -> None:
        service = _service(settings=settings)

        with pytest.raises(InvalidCredentialsError):
            service.login(email="nobody@example.com", password="whatever-long-enough")


class TestRefresh:
    """§18.1's Milestone 1 exit criterion, exercised at the unit level:
    normal refresh rotates the token; presenting an already-rotated token
    revokes the family.
    """

    def test_rotates_token_and_keeps_family(self, settings: Settings) -> None:
        user = _make_user(password="correct-horse-battery")
        refresh_tokens = FakeRefreshTokenRepository()
        service = AuthService(
            users=FakeUserService([user]), refresh_tokens=refresh_tokens, settings=settings
        )
        first = service.login(email=user.email, password="correct-horse-battery")

        second = service.refresh(presented_token=first.refresh_token)

        first_stored = refresh_tokens.get_by_hash(hash_refresh_token(first.refresh_token, settings))
        second_stored = refresh_tokens.get_by_hash(
            hash_refresh_token(second.refresh_token, settings)
        )
        assert first_stored is not None and first_stored.revoked is True
        assert second_stored is not None and second_stored.revoked is False
        assert second_stored.family_id == first_stored.family_id  # SEC-023: same family

    def test_reuse_of_rotated_token_revokes_whole_family(self, settings: Settings) -> None:
        user = _make_user(password="correct-horse-battery")
        refresh_tokens = FakeRefreshTokenRepository()
        service = AuthService(
            users=FakeUserService([user]), refresh_tokens=refresh_tokens, settings=settings
        )
        first = service.login(email=user.email, password="correct-horse-battery")
        second = service.refresh(presented_token=first.refresh_token)  # rotates; first now revoked

        with pytest.raises(InvalidRefreshTokenError):
            service.refresh(
                presented_token=first.refresh_token
            )  # SEC-024: reuse of a revoked token

        second_stored = refresh_tokens.get_by_hash(
            hash_refresh_token(second.refresh_token, settings)
        )
        assert second_stored is not None
        assert second_stored.revoked is True  # whole family revoked, not just the reused token

    def test_rejects_unknown_token(self, settings: Settings) -> None:
        service = _service(settings=settings)

        with pytest.raises(InvalidRefreshTokenError):
            service.refresh(presented_token="not-a-real-token")

    def test_rejects_expired_token(self, settings: Settings) -> None:
        user = _make_user()
        refresh_tokens = FakeRefreshTokenRepository()
        service = AuthService(
            users=FakeUserService([user]), refresh_tokens=refresh_tokens, settings=settings
        )
        expired_plaintext = "expired-token-value"
        refresh_tokens.create(
            user_id=user.id,
            token_hash=hash_refresh_token(expired_plaintext, settings),
            family_id=uuid.uuid4(),
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )

        with pytest.raises(InvalidRefreshTokenError):
            service.refresh(presented_token=expired_plaintext)


class TestLogout:
    def test_revokes_presented_token(self, settings: Settings) -> None:
        user = _make_user(password="correct-horse-battery")
        refresh_tokens = FakeRefreshTokenRepository()
        service = AuthService(
            users=FakeUserService([user]), refresh_tokens=refresh_tokens, settings=settings
        )
        pair = service.login(email=user.email, password="correct-horse-battery")

        service.logout(presented_token=pair.refresh_token)

        stored = refresh_tokens.get_by_hash(hash_refresh_token(pair.refresh_token, settings))
        assert stored is not None
        assert stored.revoked is True

    def test_is_idempotent_for_unknown_token(self, settings: Settings) -> None:
        service = _service(settings=settings)

        service.logout(presented_token="never-issued")  # must not raise
