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
from app.modules.users.models import User


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

        FR-041/UC-6 (Milestone 4): also joins `User` to exclude listings
        owned by a suspended (`is_active = False`) seller — DB-044 indexes
        `User.is_active` specifically for this join, anticipated back in
        Milestone 0. This is unconditional, exactly like the `status =
        available` constraint above, for the same reason: a suspended
        seller's listings must never appear in public browse/search
        results regardless of what any caller-supplied filter says, and
        there is no filter parameter that could ever widen it. Deliberately
        NOT applied to `get_by_id` (single-listing detail): the SRS's own
        wording is specific to "excluded from public **browse**," and a
        suspended seller's listing is treated the same way a `sold`
        listing already is — still individually resolvable via a direct
        link, just absent from the list/search results (see `get_detail`'s
        own docstring in `ListingService` for the identical reasoning
        applied to `sold`).

        Orders by `created_at DESC, id DESC` — see `list_all`'s docstring
        (Milestone 4 bugfix) for why the `id` tiebreaker is required, not
        cosmetic.
        """
        base_query = (
            self._filtered_query(filters)
            .join(User, User.id == Listing.owner_id)
            .where(Listing.status == ListingStatusEnum.AVAILABLE)
            .where(User.is_active.is_(True))
        )

        total = self._count(base_query)

        items_query = (
            base_query.options(selectinload(Listing.images))
            .order_by(Listing.created_at.desc(), Listing.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        items = list(self._db.scalars(items_query).unique())
        return Page(items=items, total=total)

    def list_all(self, *, status: ListingStatusEnum | None, page: int, page_size: int) -> Page:
        """FR-043 (Milestone 4): "an admin MUST be able to view any listing
        regardless of status" — the admin list view, filterable to any one
        status or, with none given, every listing regardless of status
        (§8.4: "Admin opens Admin > Listings, filters by any status").

        Deliberately a separate method from `browse`, not a parameter on
        it: `browse`'s `status = available` and `is_active = True`
        constraints are security-relevant and MUST stay unconditional and
        un-parameterizable (see that method's own docstring) — a privileged
        "see everything, any status, from any seller including suspended
        ones" query path must never share a code path where a caller
        -supplied value could accidentally widen the public one. No
        search/category/condition/price filtering here: FR-043 asks only
        for status-based visibility, and adding filters nothing in §7.5 or
        §8.4 asks for would be scope beyond what this milestone requires.

        Orders by `created_at DESC, id DESC`, not `created_at DESC` alone
        — a bugfix, not a style choice. Postgres's `now()` (this project's
        `server_default` for every `created_at` column) returns the
        *transaction's* start time, not the statement's — so any two rows
        inserted within the same transaction get a byte-for-byte identical
        `created_at`. Application code (a real request) commits per
        request, so this rarely collides in production, but nothing about
        `ORDER BY created_at DESC` alone actually *guarantees* a stable
        row order for ties either way — Postgres is free to return tied
        rows in any order on repeated execution of the same query, which
        silently breaks offset pagination (a row could appear on two
        pages, or neither) whenever it happens. `id` (already a unique
        primary key on every row) is a free, always-available tiebreaker
        that makes the order fully deterministic regardless of whether any
        two `created_at` values collide. Found via a genuinely flaky test
        while adding `UserRepository.list_users` (Milestone 4) — see
        IMPLEMENTATION_SUMMARY.md for the full incident writeup — and
        applied here and to `browse`/`get_by_owner` since all three share
        the exact same latent bug, not just the one method that happened
        to get a test that created three rows in the same transaction
        first.
        """
        query = select(Listing)
        if status is not None:
            query = query.where(Listing.status == status)

        total = self._count(query)

        items_query = (
            query.options(selectinload(Listing.images))
            .order_by(Listing.created_at.desc(), Listing.id.desc())
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
        """FR-025: My Listings — every status, no filtering. Orders by
        `created_at DESC, id DESC` — see `list_all`'s docstring for why
        the `id` tiebreaker is a bugfix, not cosmetic.
        """
        query = (
            select(Listing)
            .where(Listing.owner_id == owner_id)
            .options(selectinload(Listing.images))
            .order_by(Listing.created_at.desc(), Listing.id.desc())
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

    def count_by_owner_status(self, owner_id: uuid.UUID) -> dict[ListingStatusEnum, int]:
        """FR-032: "a summary of their own listings' counts by status."

        A single `GROUP BY` query rather than three separate `COUNT(*)`
        queries (one per status) or fetching every row and counting in
        Python — `get_by_owner` (FR-025) already exists for "give me every
        row"; this method exists specifically because a status *summary*
        shouldn't need to transfer and deserialize every listing row (with
        its eagerly-`selectinload`-ed images) just to produce three
        integers. Every status is present in the returned dict even at
        zero — the caller (the service layer) should never need to
        special-case "this status had no listings" as "the key is missing".
        """
        query = (
            select(Listing.status, func.count())
            .where(Listing.owner_id == owner_id)
            .group_by(Listing.status)
        )
        counts: dict[ListingStatusEnum, int] = {}
        for listing_status, count in self._db.execute(query):
            counts[listing_status] = count
        return {status: counts.get(status, 0) for status in ListingStatusEnum}

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
