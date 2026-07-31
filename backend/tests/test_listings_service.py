"""Unit tests for `ListingService` (TEST-001): `ListingRepositoryProtocol`
and `StorageBackend` are faked with plain in-memory objects — no database,
no real object storage, no FastAPI anywhere in this file.

Includes the FR-006a visibility matrix the SRS explicitly calls for at
Milestone 2 (§23): "a test asserting the FR-006a visibility matrix
(guest/other-user/owner/admin × available/sold/deleted)".
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    StorageUnavailableError,
)
from app.core.exceptions import ValidationFailedError as ValidationError
from app.modules.listings.image_validation import MAX_IMAGE_SIZE_BYTES
from app.modules.listings.models import (
    Listing,
    ListingCategoryEnum,
    ListingConditionEnum,
    ListingImage,
    ListingStatusEnum,
)
from app.modules.listings.repository import ListingFilters, Page
from app.modules.listings.service import MAX_IMAGES_PER_LISTING, ListingService
from app.modules.users.models import RoleEnum, User

_JPEG_BYTES = bytes.fromhex("FFD8FFE000104A46494600010100000100010000FFD9")


def _make_user(role: RoleEnum = RoleEnum.USER) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4()}@example.com",
        password_hash="x",
        display_name="Someone",
        role=role,
        is_active=True,
        must_change_password=False,
    )


def _make_listing(
    *, owner_id: uuid.UUID, status: ListingStatusEnum = ListingStatusEnum.AVAILABLE
) -> Listing:
    now = datetime.now(UTC)
    return Listing(
        id=uuid.uuid4(),
        owner_id=owner_id,
        title="Some Book",
        author="Some Author",
        description="Some description",
        category=ListingCategoryEnum.FICTION,
        condition=ListingConditionEnum.GOOD,
        price=Decimal("10.00"),
        status=status,
        sold_at=now if status == ListingStatusEnum.SOLD else None,
        created_at=now,
        updated_at=now,
    )


class FakeStorageBackend:
    """Fakes `StorageBackend`. `fail_after` simulates a storage backend
    that fails partway through a multi-file batch, so the atomicity
    /cleanup logic in `ListingService.upload_images` has something real to
    exercise (TEST-001 can't hit real MinIO, but it can still prove the
    application-level "delete what was written, then raise" behavior).
    """

    def __init__(self, *, fail_after: int | None = None) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.fail_after = fail_after
        self.put_count = 0

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.put_count += 1
        if self.fail_after is not None and self.put_count > self.fail_after:
            raise RuntimeError("simulated storage failure")
        self.objects[key] = (data, content_type)

    def get_url(self, key: str) -> str:
        return f"https://fake-storage.test/{key}"

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)


class FakeListingRepository:
    """Fakes `ListingRepositoryProtocol` — plain in-memory dicts."""

    def __init__(self, listings: list[Listing] | None = None) -> None:
        self._by_id: dict[uuid.UUID, Listing] = {
            listing.id: listing for listing in (listings or [])
        }
        self._images: dict[uuid.UUID, list[ListingImage]] = {}
        self.soft_delete_calls = 0

    def browse(self, *, filters: ListingFilters, page: int, page_size: int) -> Page:
        items = [
            listing
            for listing in self._by_id.values()
            if listing.status == ListingStatusEnum.AVAILABLE
        ]
        return Page(items=items, total=len(items))

    def get_by_id(self, listing_id: uuid.UUID) -> Listing | None:
        return self._by_id.get(listing_id)

    def get_by_owner(self, owner_id: uuid.UUID) -> list[Listing]:
        return [listing for listing in self._by_id.values() if listing.owner_id == owner_id]

    def create(self, **kwargs: object) -> Listing:
        listing = _make_listing(owner_id=kwargs["owner_id"])  # type: ignore[arg-type]
        for key, value in kwargs.items():
            setattr(listing, key, value)
        self._by_id[listing.id] = listing
        return listing

    def update_fields(self, listing: Listing, fields: dict[str, object]) -> Listing:
        for key, value in fields.items():
            setattr(listing, key, value)
        return listing

    def mark_sold(self, listing: Listing) -> Listing:
        listing.status = ListingStatusEnum.SOLD
        listing.sold_at = datetime.now(UTC)
        return listing

    def soft_delete(self, listing: Listing) -> Listing:
        self.soft_delete_calls += 1
        listing.status = ListingStatusEnum.DELETED
        return listing

    def count_images(self, listing_id: uuid.UUID) -> int:
        return len(self._images.get(listing_id, []))

    def add_images(
        self, listing_id: uuid.UUID, images: list[tuple[str, int]]
    ) -> list[ListingImage]:
        rows = [
            ListingImage(id=uuid.uuid4(), listing_id=listing_id, object_key=key, position=pos)
            for key, pos in images
        ]
        self._images.setdefault(listing_id, []).extend(rows)
        return rows


def _service(
    listings: FakeListingRepository, storage: FakeStorageBackend | None = None
) -> ListingService:
    return ListingService(listings=listings, storage=storage or FakeStorageBackend())


class TestVisibilityMatrix:
    """FR-006a/API-012, exercised directly per the Milestone 2 SRS mandate:
    "guest/other-user/owner/admin x available/sold/deleted". Only `deleted`
    + non-owner/non-admin is hidden; every other combination is visible.
    """

    @pytest.mark.parametrize(
        ("status", "requester_kind", "expect_visible"),
        [
            (ListingStatusEnum.AVAILABLE, "guest", True),
            (ListingStatusEnum.AVAILABLE, "other_user", True),
            (ListingStatusEnum.AVAILABLE, "owner", True),
            (ListingStatusEnum.AVAILABLE, "admin", True),
            (ListingStatusEnum.SOLD, "guest", True),
            (ListingStatusEnum.SOLD, "other_user", True),
            (ListingStatusEnum.SOLD, "owner", True),
            (ListingStatusEnum.SOLD, "admin", True),
            (ListingStatusEnum.DELETED, "guest", False),
            (ListingStatusEnum.DELETED, "other_user", False),
            (ListingStatusEnum.DELETED, "owner", True),
            (ListingStatusEnum.DELETED, "admin", True),
        ],
    )
    def test_matrix(
        self, status: ListingStatusEnum, requester_kind: str, expect_visible: bool
    ) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id, status=status)
        repo = FakeListingRepository([listing])
        service = _service(repo)

        requester: User | None
        if requester_kind == "guest":
            requester = None
        elif requester_kind == "owner":
            requester = owner
        elif requester_kind == "admin":
            requester = _make_user(role=RoleEnum.ADMIN)
        else:
            requester = _make_user()  # other_user

        if expect_visible:
            result = service.get_detail(listing.id, requester)
            assert result.id == listing.id
        else:
            with pytest.raises(NotFoundError):
                service.get_detail(listing.id, requester)

    def test_nonexistent_listing_is_404_regardless_of_requester(self) -> None:
        service = _service(FakeListingRepository())

        with pytest.raises(NotFoundError):
            service.get_detail(uuid.uuid4(), None)
        with pytest.raises(NotFoundError):
            service.get_detail(uuid.uuid4(), _make_user(role=RoleEnum.ADMIN))


class TestCreate:
    def test_owner_is_always_the_requester(self) -> None:
        owner = _make_user()
        service = _service(FakeListingRepository())

        listing = service.create(
            owner=owner,
            title="New Book",
            author="Author",
            description="Description",
            category=ListingCategoryEnum.FICTION,
            condition=ListingConditionEnum.NEW,
            price=Decimal("20.00"),
        )

        assert listing.owner_id == owner.id


class TestUpdate:
    def test_happy_path(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        service = _service(FakeListingRepository([listing]))

        updated = service.update(
            listing_id=listing.id, requester=owner, fields={"title": "New Title"}
        )

        assert updated.title == "New Title"

    def test_not_found(self) -> None:
        service = _service(FakeListingRepository())
        with pytest.raises(NotFoundError):
            service.update(listing_id=uuid.uuid4(), requester=_make_user(), fields={})

    def test_not_owner_is_forbidden(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ForbiddenError):
            service.update(
                listing_id=listing.id, requester=_make_user(), fields={"title": "Hacked"}
            )

    @pytest.mark.parametrize("status", [ListingStatusEnum.SOLD, ListingStatusEnum.DELETED])
    def test_not_available_is_conflict(self, status: ListingStatusEnum) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id, status=status)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ConflictError):
            service.update(listing_id=listing.id, requester=owner, fields={"title": "X"})

    def test_not_owner_takes_precedence_over_deleted_status(self) -> None:
        """UC-3's exception flow lists "not owner -> 403" ahead of the
        status check, and does NOT re-apply FR-006a's owner/admin-only
        404-for-deleted rule to this endpoint (that rule is scoped to
        "listing detail retrieval" by its own wording) — a stranger
        PATCHing someone else's deleted listing gets 403, not 404.
        """
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id, status=ListingStatusEnum.DELETED)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ForbiddenError):
            service.update(listing_id=listing.id, requester=_make_user(), fields={"title": "X"})


class TestMarkSold:
    def test_happy_path_sets_status_and_sold_at(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        service = _service(FakeListingRepository([listing]))

        result = service.mark_sold(listing_id=listing.id, requester=owner)

        assert result.status == ListingStatusEnum.SOLD
        assert result.sold_at is not None

    def test_not_owner_is_forbidden(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ForbiddenError):
            service.mark_sold(listing_id=listing.id, requester=_make_user())

    @pytest.mark.parametrize("status", [ListingStatusEnum.SOLD, ListingStatusEnum.DELETED])
    def test_not_available_is_conflict(self, status: ListingStatusEnum) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id, status=status)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ConflictError):
            service.mark_sold(listing_id=listing.id, requester=owner)


class TestDelete:
    @pytest.mark.parametrize("status", [ListingStatusEnum.AVAILABLE, ListingStatusEnum.SOLD])
    def test_happy_path_from_any_status(self, status: ListingStatusEnum) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id, status=status)
        repo = FakeListingRepository([listing])
        service = _service(repo)

        service.delete(listing_id=listing.id, requester=owner)

        assert listing.status == ListingStatusEnum.DELETED
        assert repo.soft_delete_calls == 1

    def test_is_idempotent_and_does_not_call_repository_again(self) -> None:
        """FR-029: deleting an already-deleted listing is a silent no-op —
        specifically must NOT issue a redundant repository call (which
        would touch `updated_at` again in the real repository).
        """
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id, status=ListingStatusEnum.DELETED)
        repo = FakeListingRepository([listing])
        service = _service(repo)

        service.delete(listing_id=listing.id, requester=owner)

        assert repo.soft_delete_calls == 0

    def test_not_owner_is_forbidden(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ForbiddenError):
            service.delete(listing_id=listing.id, requester=_make_user())

    def test_not_found(self) -> None:
        service = _service(FakeListingRepository())
        with pytest.raises(NotFoundError):
            service.delete(listing_id=uuid.uuid4(), requester=_make_user())


class TestUploadImages:
    def test_happy_path_writes_to_storage_and_repository(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        storage = FakeStorageBackend()
        service = _service(FakeListingRepository([listing]), storage)

        created = service.upload_images(
            listing_id=listing.id, requester=owner, files=[_JPEG_BYTES, _JPEG_BYTES]
        )

        assert len(created) == 2
        assert {img.position for img in created} == {0, 1}
        assert len(storage.objects) == 2

    def test_not_owner_is_forbidden(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ForbiddenError):
            service.upload_images(
                listing_id=listing.id, requester=_make_user(), files=[_JPEG_BYTES]
            )

    @pytest.mark.parametrize("status", [ListingStatusEnum.SOLD, ListingStatusEnum.DELETED])
    def test_not_available_is_conflict(self, status: ListingStatusEnum) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id, status=status)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ConflictError):
            service.upload_images(listing_id=listing.id, requester=owner, files=[_JPEG_BYTES])

    def test_empty_file_list_is_rejected(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        service = _service(FakeListingRepository([listing]))

        with pytest.raises(ValidationError):
            service.upload_images(listing_id=listing.id, requester=owner, files=[])

    def test_cumulative_limit_is_enforced_atomically(self) -> None:
        """API-032: uploading 5 already-existing + 2 new = 7 > 6 must
        reject the ENTIRE request — not persist any of the 2.
        """
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        repo = FakeListingRepository([listing])
        storage = FakeStorageBackend()
        service = _service(repo, storage)
        # Seed 5 already-uploaded images directly via the fake repository.
        repo.add_images(listing.id, [(f"existing-{i}.jpg", i) for i in range(5)])

        with pytest.raises(ValidationError) as exc_info:
            service.upload_images(
                listing_id=listing.id, requester=owner, files=[_JPEG_BYTES, _JPEG_BYTES]
            )

        assert "images" in (exc_info.value.fields or {})
        assert len(storage.objects) == 0  # no orphaned storage writes
        assert repo.count_images(listing.id) == 5  # unchanged

    def test_oversized_file_is_rejected_before_any_storage_write(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        storage = FakeStorageBackend()
        service = _service(FakeListingRepository([listing]), storage)
        oversized = b"\x00" * (MAX_IMAGE_SIZE_BYTES + 1)

        with pytest.raises(ValidationError):
            service.upload_images(
                listing_id=listing.id, requester=owner, files=[_JPEG_BYTES, oversized]
            )

        assert len(storage.objects) == 0  # the valid file before it never got written either

    def test_invalid_content_type_is_rejected_before_any_storage_write(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        storage = FakeStorageBackend()
        service = _service(FakeListingRepository([listing]), storage)
        not_an_image = b"this is definitely not an image file"

        with pytest.raises(ValidationError):
            service.upload_images(
                listing_id=listing.id, requester=owner, files=[_JPEG_BYTES, not_an_image]
            )

        assert len(storage.objects) == 0

    def test_storage_failure_partway_through_batch_is_cleaned_up(self) -> None:
        """NFR-007: storage unavailable mid-batch must not partially
        succeed — whatever WAS written before the failure is deleted, the
        database is never touched (no `add_images` call), and the client
        gets a clear 503.
        """
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        repo = FakeListingRepository([listing])
        storage = FakeStorageBackend(fail_after=2)  # 3rd file fails
        service = _service(repo, storage)

        with pytest.raises(StorageUnavailableError):
            service.upload_images(
                listing_id=listing.id,
                requester=owner,
                files=[_JPEG_BYTES, _JPEG_BYTES, _JPEG_BYTES],
            )

        assert len(storage.objects) == 0  # the first 2 successful writes were cleaned up
        assert repo.count_images(listing.id) == 0  # DB was never touched

    def test_at_exactly_six_images_succeeds(self) -> None:
        owner = _make_user()
        listing = _make_listing(owner_id=owner.id)
        service = _service(FakeListingRepository([listing]))

        created = service.upload_images(
            listing_id=listing.id, requester=owner, files=[_JPEG_BYTES] * MAX_IMAGES_PER_LISTING
        )

        assert len(created) == MAX_IMAGES_PER_LISTING


class TestBrowseAndMyListings:
    def test_browse_delegates_to_repository(self) -> None:
        owner = _make_user()
        available = _make_listing(owner_id=owner.id, status=ListingStatusEnum.AVAILABLE)
        repo = FakeListingRepository([available])
        service = _service(repo)

        page = service.browse(filters=ListingFilters(), page=1, page_size=20)

        assert page.total == 1
        assert page.items[0].id == available.id

    def test_my_listings_scoped_to_owner_id(self) -> None:
        owner = _make_user()
        other = _make_user()
        mine = _make_listing(owner_id=owner.id)
        not_mine = _make_listing(owner_id=other.id)
        repo = FakeListingRepository([mine, not_mine])
        service = _service(repo)

        result = service.get_my_listings(owner)

        assert [listing.id for listing in result] == [mine.id]
