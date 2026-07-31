"""Listings endpoints (§12.2): browse, detail, create, edit, delete,
mark-sold, image upload, My Listings, and My Listings' status summary.

Per BE-001, this router contains no SQLAlchemy queries — only HTTP concerns
(query/path/multipart parsing, response assembly) and calls into
`ListingService`. Every failure path is a `DomainError` raised by the
service layer, handled centrally by `app.core.errors` — no `try/except`
appears here.

Two `APIRouter`s: `router` (prefix `/listings`) for everything under that
resource path, and `my_listings_router` (prefix `/users/me`) for the two
listings-owned endpoints under `/users/me/listings` — `GET /users/me/listings`
(§12.2's endpoint table; Milestone 2) and `GET /users/me/listings/summary`
(FR-032, not in §12.2's table but placed alongside its sibling for the same
reason; Milestone 3) — even though both live under a URL prefix the SRS
otherwise associates with the `users` module. Module ownership follows the
resource being returned (listings), not the URL prefix, so both routers are
defined and owned here.
"""

import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.auth.dependencies import get_current_user, get_current_user_optional
from app.modules.listings.models import (
    Listing,
    ListingCategoryEnum,
    ListingConditionEnum,
    ListingStatusEnum,
)
from app.modules.listings.repository import ListingFilters, ListingRepository
from app.modules.listings.schemas import (
    ListingCreate,
    ListingImagePublic,
    ListingPage,
    ListingPublic,
    ListingStatusSummary,
    ListingUpdate,
)
from app.modules.listings.service import ListingService
from app.modules.storage.backend import StorageBackend
from app.modules.storage.dependencies import get_storage_backend
from app.modules.users.models import User
from app.modules.users.service import UserService

router = APIRouter(prefix="/listings", tags=["listings"])
my_listings_router = APIRouter(prefix="/users/me", tags=["listings"])

_DEFAULT_PAGE_SIZE = 20
_MAX_PAGE_SIZE = 50  # API-003: hard page_size cap.


def _build_service(db: Session, storage: StorageBackend) -> ListingService:
    return ListingService(listings=ListingRepository(db), storage=storage)


def _to_public(listing: Listing, db: Session, storage: StorageBackend) -> ListingPublic:
    """Enriches an ORM `Listing` with the two things it doesn't itself
    carry: the seller's display name (owned by `users`, via `UserService` —
    the sanctioned cross-module call per BE-002, same pattern as
    `get_current_user`) and browser-fetchable image URLs (via
    `StorageBackend.get_url`, owned by `storage`). Deliberately one
    `UserService.get_by_id` call per listing rather than a batch-fetch:
    proportionate at this project's target scale (NFR-002: page_size capped
    at 50) — see IMPLEMENTATION_SUMMARY.md.
    """
    owner = UserService(db).get_by_id(listing.owner_id)
    # `Listing.owner_id` is `ON DELETE RESTRICT` and users are never
    # hard-deleted (DB-021) — a listing whose owner doesn't exist is a data
    # -integrity violation, not a case to degrade gracefully for.
    assert owner is not None, f"Listing {listing.id} references a nonexistent owner"

    images = [
        ListingImagePublic(id=img.id, url=storage.get_url(img.object_key), position=img.position)
        for img in listing.images
    ]
    return ListingPublic(
        id=listing.id,
        owner_id=listing.owner_id,
        seller_display_name=owner.display_name,
        title=listing.title,
        author=listing.author,
        description=listing.description,
        category=listing.category,
        condition=listing.condition,
        price=listing.price,
        status=listing.status,
        sold_at=listing.sold_at,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
        images=images,
    )


@router.get("", response_model=ListingPage, summary="Browse/search/filter listings (FR-001..004)")
def browse_listings(
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    category: ListingCategoryEnum | None = None,
    condition: ListingConditionEnum | None = None,
    min_price: Annotated[Decimal | None, Query(ge=0)] = None,
    max_price: Annotated[Decimal | None, Query(ge=0)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=_MAX_PAGE_SIZE)] = _DEFAULT_PAGE_SIZE,
) -> ListingPage:
    service = _build_service(db, storage)
    filters = ListingFilters(
        search=search,
        category=category,
        condition=condition,
        min_price=min_price,
        max_price=max_price,
    )
    result = service.browse(filters=filters, page=page, page_size=page_size)
    return ListingPage(
        items=[_to_public(listing, db, storage) for listing in result.items],
        total=result.total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{listing_id}",
    response_model=ListingPublic,
    summary="Listing detail (FR-005/FR-006a/API-012)",
)
def get_listing(
    listing_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    requester: Annotated[User | None, Depends(get_current_user_optional)],
) -> ListingPublic:
    service = _build_service(db, storage)
    listing = service.get_detail(listing_id, requester)
    return _to_public(listing, db, storage)


@router.post(
    "",
    response_model=ListingPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create listing (FR-020, UC-2)",
)
def create_listing(
    body: ListingCreate,
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ListingPublic:
    service = _build_service(db, storage)
    listing = service.create(
        owner=current_user,
        title=body.title,
        author=body.author,
        description=body.description,
        category=body.category,
        condition=body.condition,
        price=body.price,
    )
    return _to_public(listing, db, storage)


@router.patch(
    "/{listing_id}",
    response_model=ListingPublic,
    summary="Edit listing — owner + available-only (FR-021/024/028, UC-3)",
)
def update_listing(
    listing_id: uuid.UUID,
    body: ListingUpdate,
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ListingPublic:
    service = _build_service(db, storage)
    # exclude_unset (not exclude_none): a PATCH field the client never sent
    # is "leave unchanged"; every field here is non-nullable in the domain
    # model, so an explicit `null` would be a validation failure Pydantic
    # already rejects, not a legitimate "clear this field" instruction.
    fields = body.model_dump(exclude_unset=True)
    listing = service.update(listing_id=listing_id, requester=current_user, fields=fields)
    return _to_public(listing, db, storage)


@router.delete(
    "/{listing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete listing — owner-only, idempotent (FR-022/024/027/029, UC-5)",
)
def delete_listing(
    listing_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    service = _build_service(db, storage)
    service.delete(listing_id=listing_id, requester=current_user)


@router.post(
    "/{listing_id}/sold",
    response_model=ListingPublic,
    summary="Mark sold — owner + available-only (FR-023/024, UC-4)",
)
def mark_listing_sold(
    listing_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ListingPublic:
    service = _build_service(db, storage)
    listing = service.mark_sold(listing_id=listing_id, requester=current_user)
    return _to_public(listing, db, storage)


@router.post(
    "/{listing_id}/images",
    response_model=list[ListingImagePublic],
    status_code=status.HTTP_201_CREATED,
    summary="Upload 1+ images, atomically (API-030/031/032)",
)
def upload_listing_images(
    listing_id: uuid.UUID,
    images: Annotated[list[UploadFile], File()],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ListingImagePublic]:
    # Sync read of the underlying file object — consistent with this
    # codebase's sync-everywhere architecture (see app.core.db's module
    # docstring); FastAPI runs sync route functions in a threadpool, so
    # this blocking read is not a problem.
    file_bytes = [uploaded.file.read() for uploaded in images]
    service = _build_service(db, storage)
    created = service.upload_images(listing_id=listing_id, requester=current_user, files=file_bytes)
    return [
        ListingImagePublic(id=img.id, url=storage.get_url(img.object_key), position=img.position)
        for img in created
    ]


@my_listings_router.get(
    "/listings",
    response_model=list[ListingPublic],
    summary="My Listings — every status (FR-025)",
)
def get_my_listings(
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ListingPublic]:
    service = _build_service(db, storage)
    listings = service.get_my_listings(current_user)
    return [_to_public(listing, db, storage) for listing in listings]


@my_listings_router.get(
    "/listings/summary",
    response_model=ListingStatusSummary,
    summary="My Listings' counts by status (FR-032)",
)
def get_my_listings_summary(
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ListingStatusSummary:
    # `storage` isn't used by this endpoint (there are no images in a
    # summary), but `_build_service` requires it — kept for uniformity with
    # every other endpoint in this router rather than a second
    # service-construction helper for the one route that doesn't need it.
    service = _build_service(db, storage)
    counts = service.get_my_listings_summary(current_user)
    return ListingStatusSummary(
        available=counts[ListingStatusEnum.AVAILABLE],
        sold=counts[ListingStatusEnum.SOLD],
        deleted=counts[ListingStatusEnum.DELETED],
    )
