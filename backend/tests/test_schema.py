"""Integration tests against the real, migrated Postgres schema (TEST-002).

These are the tests that actually prove the Milestone 0 scope item in §23
("Database schema + first Alembic migration (User, Listing, ListingImage,
RefreshToken, AdminAction ...)") — not just that the ORM classes are
importable, but
that inserting through them round-trips correctly against a database that
has had `alembic upgrade head` applied to it, and that the constraints
declared in §11.5 are enforced by Postgres itself.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.admin.models import AdminAction, AdminActionTypeEnum, AdminTargetTypeEnum
from app.modules.auth.models import RefreshToken
from app.modules.listings.models import (
    Listing,
    ListingCategoryEnum,
    ListingConditionEnum,
    ListingImage,
    ListingStatusEnum,
)
from app.modules.users.models import RoleEnum, User


def _make_user(db_session: Session, **overrides: object) -> User:
    defaults: dict[str, object] = {
        "email": f"{uuid.uuid4()}@example.com",
        "password_hash": "argon2id$placeholder",
        "display_name": "Test User",
    }
    defaults.update(overrides)
    user = User(**defaults)
    db_session.add(user)
    db_session.flush()
    return user


def test_user_round_trip_and_defaults(db_session: Session) -> None:
    user = _make_user(db_session, email="Reader@Example.com")

    fetched = db_session.get(User, user.id)
    assert fetched is not None
    assert fetched.role == RoleEnum.USER
    assert fetched.is_active is True
    assert fetched.must_change_password is False

    # DB-004/citext: email lookups must be case-insensitive.
    same_user_different_case = (
        db_session.query(User).filter(User.email == "reader@example.com").one()
    )
    assert same_user_different_case.id == user.id


def test_duplicate_email_is_rejected_case_insensitively(db_session: Session) -> None:
    _make_user(db_session, email="dup@example.com")
    db_session.add(
        User(
            email="DUP@example.com",
            password_hash="x",
            display_name="Second",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_listing_round_trip_and_search_vector_generated(db_session: Session) -> None:
    owner = _make_user(db_session)
    listing = Listing(
        owner_id=owner.id,
        title="The Pragmatic Programmer",
        author="David Thomas",
        description="Good condition, some highlighting.",
        category=ListingCategoryEnum.NON_FICTION,
        condition=ListingConditionEnum.GOOD,
        price=Decimal("12.50"),
    )
    db_session.add(listing)
    db_session.flush()
    db_session.refresh(listing)

    assert listing.status == ListingStatusEnum.AVAILABLE
    assert listing.search_vector is not None  # DB-010: Postgres-generated column


def test_listing_price_must_be_positive(db_session: Session) -> None:
    owner = _make_user(db_session)
    listing = Listing(
        owner_id=owner.id,
        title="Free Book",
        author="Nobody",
        description="Should not be insertable at price 0.",
        category=ListingCategoryEnum.OTHER,
        condition=ListingConditionEnum.POOR,
        price=Decimal("0.00"),
    )
    db_session.add(listing)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_listing_image_cascades_on_listing_delete(db_session: Session) -> None:
    owner = _make_user(db_session)
    listing = Listing(
        owner_id=owner.id,
        title="Clean Code",
        author="Robert C. Martin",
        description="Like new.",
        category=ListingCategoryEnum.ACADEMIC_TEXTBOOK,
        condition=ListingConditionEnum.LIKE_NEW,
        price=Decimal("20.00"),
    )
    db_session.add(listing)
    db_session.flush()

    image = ListingImage(listing_id=listing.id, object_key="listings/abc/0.jpg", position=0)
    db_session.add(image)
    db_session.flush()
    image_id = image.id

    db_session.delete(listing)
    db_session.flush()

    # The cascade delete happens in Postgres, not via an ORM-level
    # `relationship(cascade=...)` (none is declared between Listing and
    # ListingImage). `Session.get()` checks the identity map before it
    # checks the database, so without `expire_all()` here this assertion
    # would silently pass against a stale in-memory `image` object even if
    # the DB-level `ON DELETE CASCADE` were broken or missing entirely.
    db_session.expire_all()
    assert db_session.get(ListingImage, image_id) is None  # DB-031: ON DELETE CASCADE


def test_refresh_token_round_trip(db_session: Session) -> None:
    user = _make_user(db_session)
    family_id = uuid.uuid4()
    token = RefreshToken(
        user_id=user.id,
        token_hash="hashed-opaque-token",
        family_id=family_id,
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )
    db_session.add(token)
    db_session.flush()
    db_session.refresh(token)

    assert token.revoked is False
    assert token.family_id == family_id


def test_admin_action_round_trip(db_session: Session) -> None:
    admin = _make_user(db_session, role=RoleEnum.ADMIN)
    action = AdminAction(
        admin_id=admin.id,
        action_type=AdminActionTypeEnum.SUSPEND_USER,
        target_type=AdminTargetTypeEnum.USER,
        target_id=uuid.uuid4(),
        reason_code="policy_violation",
    )
    db_session.add(action)
    db_session.flush()
    db_session.refresh(action)

    assert action.created_at is not None
