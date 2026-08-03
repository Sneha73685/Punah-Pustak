"""Admin endpoints (§12.2, §7.5): user list/suspend/reinstate/reset-password,
listing list/remove-with-reason.

Per BE-001, this router contains no SQLAlchemy queries — only HTTP concerns
(dependency wiring, request/response translation) and calls into
`AdminService`. Every failure path is a `DomainError` raised by the service
layer, handled centrally by `app.core.errors` — no `try/except` appears
here. Every endpoint depends on `require_admin` (SEC-030/031) — there is no
endpoint in this router reachable by a non-admin, authenticated or not.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.modules.admin.schemas import (
    AdminPasswordResetResponse,
    AdminUserPage,
    AdminUserPublic,
    SuspendUserRequest,
)
from app.modules.admin.service import build_admin_service
from app.modules.auth.dependencies import require_admin
from app.modules.listings.models import ListingStatusEnum
from app.modules.listings.router import to_public
from app.modules.listings.schemas import ListingPage
from app.modules.storage.backend import StorageBackend
from app.modules.storage.dependencies import get_storage_backend
from app.modules.users.models import User

router = APIRouter(prefix="/admin", tags=["admin"])

_DEFAULT_PAGE_SIZE = 20
_MAX_PAGE_SIZE = 50  # API-003: hard page_size cap, same convention as `listings`.


@router.get("/users", response_model=AdminUserPage, summary="List all users (FR-040)")
def list_users(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    _admin: Annotated[User, Depends(require_admin)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=_MAX_PAGE_SIZE)] = _DEFAULT_PAGE_SIZE,
) -> AdminUserPage:
    service = build_admin_service(db, settings, storage)
    result = service.list_users(page=page, page_size=page_size)
    return AdminUserPage(
        items=[AdminUserPublic.model_validate(user) for user in result.items],
        total=result.total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/users/{user_id}/suspend",
    response_model=AdminUserPublic,
    summary="Suspend a user (FR-041, UC-6)",
)
def suspend_user(
    user_id: uuid.UUID,
    body: SuspendUserRequest,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    admin: Annotated[User, Depends(require_admin)],
) -> User:
    service = build_admin_service(db, settings, storage)
    return service.suspend_user(admin=admin, target_user_id=user_id, reason_code=body.reason_code)


@router.post(
    "/users/{user_id}/reinstate",
    response_model=AdminUserPublic,
    summary="Reinstate a suspended user (FR-041, UC-6)",
)
def reinstate_user(
    user_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    admin: Annotated[User, Depends(require_admin)],
) -> User:
    service = build_admin_service(db, settings, storage)
    return service.reinstate_user(admin=admin, target_user_id=user_id)


@router.post(
    "/users/{user_id}/reset-password",
    response_model=AdminPasswordResetResponse,
    summary="Admin-assisted password reset (FR-045, UC-7)",
)
def reset_password(
    user_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    admin: Annotated[User, Depends(require_admin)],
) -> AdminPasswordResetResponse:
    service = build_admin_service(db, settings, storage)
    temporary_password = service.reset_password(admin=admin, target_user_id=user_id)
    return AdminPasswordResetResponse(temporary_password=temporary_password)


@router.get("/listings", response_model=ListingPage, summary="List listings, any status (FR-043)")
def list_listings(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    _admin: Annotated[User, Depends(require_admin)],
    status_filter: Annotated[ListingStatusEnum | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=_MAX_PAGE_SIZE)] = _DEFAULT_PAGE_SIZE,
) -> ListingPage:
    service = build_admin_service(db, settings, storage)
    result = service.list_listings(status=status_filter, page=page, page_size=page_size)
    return ListingPage(
        items=[to_public(listing, db, storage) for listing in result.items],
        total=result.total,
        page=page,
        page_size=page_size,
    )


@router.delete(
    "/listings/{listing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a listing, reason required (FR-042, UC-5, FR-029)",
)
def remove_listing(
    listing_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[StorageBackend, Depends(get_storage_backend)],
    admin: Annotated[User, Depends(require_admin)],
    # A query parameter, not a body — see `SuspendUserRequest`'s docstring
    # for why `DELETE` doesn't get a Pydantic body schema here the way
    # every other mutating endpoint in this codebase does.
    reason_code: Annotated[str, Query(min_length=1, max_length=200)],
) -> None:
    service = build_admin_service(db, settings, storage)
    service.remove_listing(admin=admin, listing_id=listing_id, reason_code=reason_code)
