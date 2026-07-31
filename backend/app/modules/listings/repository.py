"""Data access for `Listing`/`ListingImage` (BE-001: repositories are the
only layer that issues SQLAlchemy queries against this module's models).

No business rules here — ownership checks, status-transition legality
(FR-028), and idempotency (FR-029) all live in the service layer. This
layer's job is exactly: run the right query, with the right index-friendly
shape, and load images eagerly (avoiding N+1 queries on a page of listings).
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.modules.listings.models import (
    Listing,
    ListingCategoryEnum,
    ListingConditionEnum,
    ListingImage,
    ListingStatusEnum,
)


@dataclass(frozen=True)
class ListingFilters:
    """FR-002/003/004: full-text search plus filters, combinable in one
    query. All fields `None` means "no constraint" for that dimension.
    """

    search: str | None = None
    category: ListingCategoryEnum | None = None
    condition: ListingConditionEnum | None = None
    min_price: Decimal | None = None
    max_price: Decimal | None = None


@dataclass(frozen=True)
class Page:
    items: list[Listing]
    total: int


class ListingRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def browse(self, *, filters: ListingFilters, page: int, page_size: int) -> Page:
        """FR-001: `status = available` is a hard constraint baked into
        this query, never a client-controllable filter value — public
        browse/search MUST NEVER return `sold` or `deleted` listings
        (FR-026), so there is no filter parameter here that could widen
        that, unlike category/condition/price which the caller does control.
        """
        base_query = self._filtered_query(filters).where(
            Listing.status == ListingStatusEnum.AVAILABLE
        )

        total = self._count(base_query)

        items_query = (
            base_query.options(selectinload(Listing.images))
            .order_by(Listing.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        items = list(self._db.scalars(items_query).unique())
        return Page(items=items, total=total)

    def get_by_id(self, listing_id: uuid.UUID) -> Listing | None:
        query = (
            select(Listing).where(Listing.id == listing_id).options(selectinload(Listing.images))
        )
        return self._db.scalars(query).unique().one_or_none()

    def get_by_owner(self, owner_id: uuid.UUID) -> list[Listing]:
        """FR-025: My Listings — every status, no filtering."""
        query = (
            select(Listing)
            .where(Listing.owner_id == owner_id)
            .options(selectinload(Listing.images))
            .order_by(Listing.created_at.desc())
        )
        return list(self._db.scalars(query).unique())

    def create(
        self,
        *,
        owner_id: uuid.UUID,
        title: str,
        author: str,
        description: str,
        category: ListingCategoryEnum,
        condition: ListingConditionEnum,
        price: Decimal,
    ) -> Listing:
        listing = Listing(
            owner_id=owner_id,
            title=title,
            author=author,
            description=description,
            category=category,
            condition=condition,
            price=price,
        )
        self._db.add(listing)
        self._db.flush()
        self._db.refresh(listing)
        return listing

    def update_fields(self, listing: Listing, fields: dict[str, object]) -> Listing:
        """`fields` is the caller's already-validated, already-authorized
        partial update (FR-021/FR-028's checks happen in the service layer,
        before this is called) — this method just applies it.
        """
        for key, value in fields.items():
            setattr(listing, key, value)
        self._db.flush()
        return listing

    def mark_sold(self, listing: Listing) -> Listing:
        listing.status = ListingStatusEnum.SOLD
        listing.sold_at = datetime.now(UTC)
        self._db.flush()
        return listing

    def soft_delete(self, listing: Listing) -> Listing:
        listing.status = ListingStatusEnum.DELETED
        self._db.flush()
        return listing

    def count_images(self, listing_id: uuid.UUID) -> int:
        query = (
            select(func.count())
            .select_from(ListingImage)
            .where(ListingImage.listing_id == listing_id)
        )
        return self._db.scalar(query) or 0

    def add_images(
        self, listing_id: uuid.UUID, images: list[tuple[str, int]]
    ) -> list[ListingImage]:
        """`images`: `(object_key, position)` pairs, already positioned by
        the caller (service layer owns the "where does this land in 0..5"
        decision — API-032's atomicity guarantee needs that decided before
        any row is written, not derived independently per row here).
        """
        rows = [
            ListingImage(listing_id=listing_id, object_key=key, position=pos) for key, pos in images
        ]
        self._db.add_all(rows)
        self._db.flush()
        return rows

    def _filtered_query(self, filters: ListingFilters) -> Select[tuple[Listing]]:
        query = select(Listing)
        if filters.search:
            # DB-010/DB-042: the generated tsvector column + GIN index.
            # plainto_tsquery treats the input as plain text (not
            # tsquery-operator syntax like `&`/`|`), which is the right
            # choice for a free-text search box — a user typing `fantasy &
            # dragon` should search for that literal phrase-ish text, not
            # accidentally construct a boolean query operator.
            query = query.where(
                Listing.search_vector.op("@@")(func.plainto_tsquery("english", filters.search))
            )
        if filters.category is not None:
            query = query.where(Listing.category == filters.category)
        if filters.condition is not None:
            query = query.where(Listing.condition == filters.condition)
        if filters.min_price is not None:
            query = query.where(Listing.price >= filters.min_price)
        if filters.max_price is not None:
            query = query.where(Listing.price <= filters.max_price)
        return query

    def _count(self, query: Select[tuple[Listing]]) -> int:
        count_query = select(func.count()).select_from(
            query.with_only_columns(Listing.id).subquery()
        )
        return self._db.scalar(count_query) or 0
