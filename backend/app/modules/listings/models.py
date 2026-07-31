"""Listing and ListingImage entities (§10.1).

- category / condition: fixed Postgres enums (§10.3). No `Category` table —
  six values that essentially never change don't warrant CRUD + admin UI
  (§10.4).
- status: `available` / `sold` / `deleted`. `deleted` is a soft delete
  (DB-020) — never a row removal.
- price: `numeric(10,2)` with a `CHECK (price > 0)` constraint (DB-030) —
  never a float.
- search_vector: a stored *generated* column (DB-010), computed by Postgres
  itself from `title` and `author` on every insert/update — the application
  never writes to this column directly.
- ListingImage.listing_id FK: ON DELETE CASCADE (DB-031) — an image is
  meaningless without its listing.
- Listing.owner_id FK: ON DELETE RESTRICT (DB-031) — documents intent; moot
  today since users are never hard-deleted (DB-021).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
)
from sqlalchemy import func as sa_func
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Enum as SAEnum

from app.core.db import Base, enum_values


class ListingCategoryEnum(str, Enum):
    """Fixed category list (§10.3) — adding a category is a migration, not a feature."""

    FICTION = "fiction"
    NON_FICTION = "non_fiction"
    ACADEMIC_TEXTBOOK = "academic_textbook"
    CHILDREN = "children"
    COMICS_GRAPHIC_NOVELS = "comics_graphic_novels"
    OTHER = "other"


class ListingConditionEnum(str, Enum):
    NEW = "new"
    LIKE_NEW = "like_new"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class ListingStatusEnum(str, Enum):
    AVAILABLE = "available"
    SOLD = "sold"
    DELETED = "deleted"


class Listing(Base):
    __tablename__ = "listings"
    __table_args__ = (
        CheckConstraint("price > 0", name="ck_listings_price_positive"),
        # DB-041: composite index for the common filter combination. Declared
        # here (rather than as three individual `index=True` flags) because
        # it must be a single multi-column index, matching the migration.
        Index(
            "ix_listings_status_category_condition",
            "status",
            "category",
            "condition",
        ),
        # DB-042: GIN index backing full-text search. Declared here so
        # `Base.metadata` — and therefore `alembic revision --autogenerate`
        # — actually knows about it. The migration creates the equivalent
        # index via a raw `op.execute("CREATE INDEX ... USING GIN")` rather
        # than `op.create_index(..., postgresql_using="gin")` (both work
        # equally well; the migration just predates this declaration), but
        # without a matching declaration here every future autogenerate run
        # would propose dropping it as "no longer in the model".
        Index("ix_listings_search_vector", "search_vector", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(nullable=False)
    author: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    category: Mapped[ListingCategoryEnum] = mapped_column(
        SAEnum(
            ListingCategoryEnum,
            name="listing_category_enum",
            native_enum=True,
            values_callable=enum_values,
        ),
        nullable=False,
    )
    condition: Mapped[ListingConditionEnum] = mapped_column(
        SAEnum(
            ListingConditionEnum,
            name="listing_condition_enum",
            native_enum=True,
            values_callable=enum_values,
        ),
        nullable=False,
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # DB-040: indexed — heavily filtered on its own, in addition to being the
    # lead column of the composite index above (both are required by the SRS;
    # the composite index does not make this one redundant to omit, since the
    # migration creates both explicitly).
    status: Mapped[ListingStatusEnum] = mapped_column(
        SAEnum(
            ListingStatusEnum,
            name="listing_status_enum",
            native_enum=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ListingStatusEnum.AVAILABLE,
        index=True,
    )
    sold_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa_func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa_func.now(),
        onupdate=sa_func.now(),
    )

    # DB-010: generated column, maintained by Postgres itself — never assigned
    # to from application code.
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(author, ''))",
            persisted=True,
        ),
        nullable=True,
    )

    # Milestone 0 left this module with bare FK columns only (no ORM-level
    # relationship — see this module's own __init__.py: "search/filter...
    # logic is Milestone 2 work"). `selectinload(Listing.images)` (used by
    # the Milestone 2 repository) needs this to avoid an N+1 query when
    # rendering a page of listings. No `cascade="all, delete-orphan"`: a
    # `Listing` is never hard-deleted through the ORM (DB-020: soft delete
    # only), so that cascade would never fire — the DB-level `ON DELETE
    # CASCADE` on `ListingImage.listing_id` (DB-031) already documents the
    # intended behavior for the case (a raw SQL delete) where it would.
    #
    # `passive_deletes=True` is required, not optional, precisely because a
    # relationship now exists: without it, SQLAlchemy's unit-of-work
    # defaults to managing the child side itself on parent delete — it
    # emits `UPDATE listing_images SET listing_id = NULL ...` before the
    # parent `DELETE`, which violates `listing_id`'s `NOT NULL` constraint
    # and masks the DB-level `ON DELETE CASCADE` entirely (a regression
    # caught by `test_listing_image_cascades_on_listing_delete`, a
    # Milestone 0 test that predates this relationship). `passive_deletes`
    # tells the ORM to do nothing on the child side and let Postgres's own
    # `ON DELETE CASCADE` handle it, matching DB-031's intent.
    images: Mapped[list["ListingImage"]] = relationship(
        "ListingImage",
        back_populates="listing",
        order_by="ListingImage.position",
        passive_deletes=True,
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"Listing(id={self.id!r}, title={self.title!r}, status={self.status!r})"


class ListingImage(Base):
    __tablename__ = "listing_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    object_key: Mapped[str] = mapped_column(nullable=False)
    # 0-5, bounded to a max of 6 images per listing — enforced at the
    # application layer (API-032), not via a DB constraint (§10.2 rationale).
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa_func.now()
    )

    listing: Mapped["Listing"] = relationship("Listing", back_populates="images")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"ListingImage(id={self.id!r}, listing_id={self.listing_id!r})"
