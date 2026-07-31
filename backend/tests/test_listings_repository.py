"""Integration tests for `ListingRepository` against the real, migrated
Postgres schema (TEST-002) — the things a fake can't prove: that the
tsvector/GIN full-text search (DB-010/DB-042) actually matches real
queries, that filters combine correctly in one SQL query (FR-004), that
pagination metadata is accurate, and that `status = available` really is
unconditional in `browse` regardless of what a caller might otherwise be
tempted to pass.
"""

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.modules.listings.models import (
    Listing,
    ListingCategoryEnum,
    ListingConditionEnum,
    ListingStatusEnum,
)
from app.modules.listings.repository import ListingFilters, ListingRepository
from app.modules.users.models import User
from app.modules.users.repository import UserRepository


def _make_owner(db_session: Session) -> User:
    return UserRepository(db_session).create(
        email=f"{uuid.uuid4()}@example.com", password_hash="x", display_name="Owner"
    )


def _make_listing(
    repo: ListingRepository,
    owner_id: uuid.UUID,
    *,
    title: str = "A Book",
    author: str = "An Author",
    category: ListingCategoryEnum = ListingCategoryEnum.FICTION,
    condition: ListingConditionEnum = ListingConditionEnum.GOOD,
    price: Decimal = Decimal("10.00"),
) -> Listing:
    return repo.create(
        owner_id=owner_id,
        title=title,
        author=author,
        description="A description",
        category=category,
        condition=condition,
        price=price,
    )


class TestBrowse:
    def test_full_text_search_matches_title_and_author(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        _make_listing(repo, owner.id, title="The Great Gatsby", author="F. Scott Fitzgerald")
        _make_listing(repo, owner.id, title="Python Crash Course", author="Eric Matthes")

        by_title = repo.browse(filters=ListingFilters(search="Gatsby"), page=1, page_size=10)
        by_author = repo.browse(filters=ListingFilters(search="Matthes"), page=1, page_size=10)
        no_match = repo.browse(filters=ListingFilters(search="Nonexistent"), page=1, page_size=10)

        assert [listing.title for listing in by_title.items] == ["The Great Gatsby"]
        assert [listing.title for listing in by_author.items] == ["Python Crash Course"]
        assert no_match.items == []
        assert no_match.total == 0

    def test_category_and_condition_filters(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        _make_listing(
            repo,
            owner.id,
            title="Textbook",
            category=ListingCategoryEnum.ACADEMIC_TEXTBOOK,
            condition=ListingConditionEnum.NEW,
        )
        _make_listing(
            repo,
            owner.id,
            title="Novel",
            category=ListingCategoryEnum.FICTION,
            condition=ListingConditionEnum.FAIR,
        )

        by_category = repo.browse(
            filters=ListingFilters(category=ListingCategoryEnum.ACADEMIC_TEXTBOOK),
            page=1,
            page_size=10,
        )
        by_condition = repo.browse(
            filters=ListingFilters(condition=ListingConditionEnum.FAIR), page=1, page_size=10
        )

        assert [listing.title for listing in by_category.items] == ["Textbook"]
        assert [listing.title for listing in by_condition.items] == ["Novel"]

    def test_price_range_filter(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        _make_listing(repo, owner.id, title="Cheap", price=Decimal("5.00"))
        _make_listing(repo, owner.id, title="Mid", price=Decimal("15.00"))
        _make_listing(repo, owner.id, title="Expensive", price=Decimal("50.00"))

        result = repo.browse(
            filters=ListingFilters(min_price=Decimal("10.00"), max_price=Decimal("20.00")),
            page=1,
            page_size=10,
        )

        assert [listing.title for listing in result.items] == ["Mid"]

    def test_search_and_filters_combine_in_one_query(self, db_session: Session) -> None:
        """FR-004: search + filters combinable."""
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        _make_listing(
            repo,
            owner.id,
            title="Dune",
            author="Frank Herbert",
            category=ListingCategoryEnum.FICTION,
        )
        _make_listing(
            repo,
            owner.id,
            title="Dune Encyclopedia",
            author="Someone Else",
            category=ListingCategoryEnum.ACADEMIC_TEXTBOOK,
        )

        result = repo.browse(
            filters=ListingFilters(search="Dune", category=ListingCategoryEnum.FICTION),
            page=1,
            page_size=10,
        )

        assert [listing.title for listing in result.items] == ["Dune"]

    def test_pagination_total_and_slicing(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        for i in range(5):
            _make_listing(repo, owner.id, title=f"Book {i}")

        page_1 = repo.browse(filters=ListingFilters(), page=1, page_size=2)
        page_2 = repo.browse(filters=ListingFilters(), page=2, page_size=2)
        page_3 = repo.browse(filters=ListingFilters(), page=3, page_size=2)

        assert page_1.total == page_2.total == page_3.total == 5
        assert len(page_1.items) == 2
        assert len(page_2.items) == 2
        assert len(page_3.items) == 1
        # No overlap across pages.
        all_ids = {listing.id for listing in page_1.items + page_2.items + page_3.items}
        assert len(all_ids) == 5

    def test_never_returns_sold_or_deleted_regardless_of_filters(self, db_session: Session) -> None:
        """FR-001/FR-026: public browse is unconditionally available-only —
        proven here by NOT passing any status-related filter at all (there
        is none to pass) and confirming sold/deleted listings never appear.
        """
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        available = _make_listing(repo, owner.id, title="Available Book")
        sold = _make_listing(repo, owner.id, title="Sold Book")
        deleted = _make_listing(repo, owner.id, title="Deleted Book")
        repo.mark_sold(sold)
        repo.soft_delete(deleted)

        result = repo.browse(filters=ListingFilters(), page=1, page_size=10)

        assert [listing.id for listing in result.items] == [available.id]


class TestGetByIdAndOwner:
    def test_get_by_id_loads_images(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        listing = _make_listing(repo, owner.id)
        repo.add_images(listing.id, [("k0.jpg", 0), ("k1.jpg", 1)])

        fetched = repo.get_by_id(listing.id)

        assert fetched is not None
        assert [(img.object_key, img.position) for img in fetched.images] == [
            ("k0.jpg", 0),
            ("k1.jpg", 1),
        ]

    def test_get_by_id_returns_none_for_unknown(self, db_session: Session) -> None:
        repo = ListingRepository(db_session)
        assert repo.get_by_id(uuid.uuid4()) is None

    def test_get_by_id_returns_regardless_of_status(self, db_session: Session) -> None:
        """The repository itself applies no visibility rule — FR-006a is
        enforced by the service layer, not here.
        """
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        listing = _make_listing(repo, owner.id)
        repo.soft_delete(listing)

        fetched = repo.get_by_id(listing.id)

        assert fetched is not None
        assert fetched.status == ListingStatusEnum.DELETED

    def test_get_by_owner_returns_every_status(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        available = _make_listing(repo, owner.id, title="Available")
        sold = _make_listing(repo, owner.id, title="Sold")
        deleted = _make_listing(repo, owner.id, title="Deleted")
        repo.mark_sold(sold)
        repo.soft_delete(deleted)

        mine = repo.get_by_owner(owner.id)

        assert {listing.id for listing in mine} == {available.id, sold.id, deleted.id}

    def test_get_by_owner_excludes_other_owners(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        other = _make_owner(db_session)
        repo = ListingRepository(db_session)
        mine = _make_listing(repo, owner.id, title="Mine")
        _make_listing(repo, other.id, title="Not Mine")

        result = repo.get_by_owner(owner.id)

        assert [listing.id for listing in result] == [mine.id]


class TestStatusTransitions:
    def test_mark_sold_sets_status_and_sold_at(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        listing = _make_listing(repo, owner.id)

        repo.mark_sold(listing)

        assert listing.status == ListingStatusEnum.SOLD
        assert listing.sold_at is not None

    def test_soft_delete_sets_status(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        listing = _make_listing(repo, owner.id)

        repo.soft_delete(listing)

        assert listing.status == ListingStatusEnum.DELETED

    def test_update_fields_applies_partial_update(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        listing = _make_listing(repo, owner.id, title="Original")

        repo.update_fields(listing, {"title": "Updated", "price": Decimal("99.99")})

        assert listing.title == "Updated"
        assert listing.price == Decimal("99.99")
        assert listing.author == "An Author"  # untouched


class TestImages:
    def test_count_images(self, db_session: Session) -> None:
        owner = _make_owner(db_session)
        repo = ListingRepository(db_session)
        listing = _make_listing(repo, owner.id)

        assert repo.count_images(listing.id) == 0
        repo.add_images(listing.id, [("k0.jpg", 0)])
        assert repo.count_images(listing.id) == 1
        repo.add_images(listing.id, [("k1.jpg", 1), ("k2.jpg", 2)])
        assert repo.count_images(listing.id) == 3
