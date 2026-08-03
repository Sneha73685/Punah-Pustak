"""Listings service — ownership, visibility, and status-transition rules
(§7.1/§7.3, UC-1..5, API-030/031/032).

BE-001: services MUST NOT import FastAPI request/response types. Failures
are `app.core.exceptions.DomainError` subclasses, translated centrally by
`app.core.errors` — this module never builds an HTTP response itself.

BE-002: depends on `StorageBackend` (the `storage` module's public
interface) rather than on `S3StorageBackend` directly, and takes its
`ListingRepository` collaborator as a `Protocol` (see M1's `AuthService` for
the established pattern) — both structurally typed so unit tests can hand
this class fully in-memory fakes (TEST-001).
"""

import contextlib
import uuid
from decimal import Decimal
from typing import Protocol

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    StorageUnavailableError,
)
from app.core.exceptions import ValidationFailedError as ValidationError
from app.modules.listings.image_validation import (
    MAX_IMAGE_SIZE_BYTES,
    extension_for_content_type,
    sniff_image_content_type,
)
from app.modules.listings.models import (
    Listing,
    ListingCategoryEnum,
    ListingConditionEnum,
    ListingImage,
    ListingStatusEnum,
)
from app.modules.listings.repository import ListingFilters, Page
from app.modules.storage.backend import StorageBackend
from app.modules.users.models import RoleEnum, User

MAX_IMAGES_PER_LISTING = 6


class ListingRepositoryProtocol(Protocol):
    def browse(self, *, filters: ListingFilters, page: int, page_size: int) -> Page: ...
    def list_all(self, *, status: ListingStatusEnum | None, page: int, page_size: int) -> Page: ...
    def get_by_id(self, listing_id: uuid.UUID) -> Listing | None: ...
    def get_by_owner(self, owner_id: uuid.UUID) -> list[Listing]: ...
    def count_by_owner_status(self, owner_id: uuid.UUID) -> dict[ListingStatusEnum, int]: ...
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
    ) -> Listing: ...
    def update_fields(self, listing: Listing, fields: dict[str, object]) -> Listing: ...
    def mark_sold(self, listing: Listing) -> Listing: ...
    def soft_delete(self, listing: Listing) -> Listing: ...
    def count_images(self, listing_id: uuid.UUID) -> int: ...
    def add_images(
        self, listing_id: uuid.UUID, images: list[tuple[str, int]]
    ) -> list[ListingImage]: ...


def _is_owner_or_admin(listing: Listing, requester: User | None) -> bool:
    if requester is None:
        return False
    return requester.id == listing.owner_id or requester.role == RoleEnum.ADMIN


class ListingService:
    def __init__(self, *, listings: ListingRepositoryProtocol, storage: StorageBackend) -> None:
        self._listings = listings
        self._storage = storage

    def browse(self, *, filters: ListingFilters, page: int, page_size: int) -> Page:
        """FR-001..004: public browse/search/filter. `status = available`
        is enforced unconditionally inside the repository, not here — see
        `ListingRepository.browse`'s docstring for why that's the right
        layer for a hard security-relevant constraint like this one.
        """
        return self._listings.browse(filters=filters, page=page, page_size=page_size)

    def get_detail(self, listing_id: uuid.UUID, requester: User | None) -> Listing:
        """FR-006a/API-012 — the single authoritative visibility rule for
        listing detail retrieval: a `deleted` listing 404s for anyone who
        isn't its owner or an admin. A `sold` listing has no such
        restriction — FR-026 only excludes `sold` from browse/search
        results, not from direct detail-view access by anyone, including
        guests (e.g. a bookmarked/shared link to a since-sold listing
        should still resolve, not 404). A listing owned by a suspended
        seller (Milestone 4, FR-041/UC-6) is treated identically: excluded
        from `browse` (`ListingRepository.browse`'s join against
        `User.is_active`), but still resolvable here via a direct link —
        this method has no seller-status check of its own, by design.
        """
        listing = self._listings.get_by_id(listing_id)
        if listing is None:
            raise NotFoundError("Listing not found.")
        if listing.status == ListingStatusEnum.DELETED and not _is_owner_or_admin(
            listing, requester
        ):
            raise NotFoundError("Listing not found.")
        return listing

    def get_my_listings(self, owner: User) -> list[Listing]:
        """FR-025: every status, unfiltered — this is inherently scoped to
        `owner.id` (from the verified access token), so there is no
        separate ownership check to perform here the way there is for a
        listing-by-id lookup.
        """
        return self._listings.get_by_owner(owner.id)

    def get_my_listings_summary(self, owner: User) -> dict[ListingStatusEnum, int]:
        """FR-032: counts of the caller's own listings by status. Scoped to
        `owner.id` from the verified access token, same as `get_my_listings`
        — no separate ownership check needed for the same reason that
        method's docstring already gives.
        """
        return self._listings.count_by_owner_status(owner.id)

    def create(
        self,
        *,
        owner: User,
        title: str,
        author: str,
        description: str,
        category: ListingCategoryEnum,
        condition: ListingConditionEnum,
        price: Decimal,
    ) -> Listing:
        """FR-020/UC-2. `owner_id` comes only from the verified access
        token (SEC-030) — there is no `owner_id` field on `ListingCreate`
        for a client to spoof in the first place.
        """
        return self._listings.create(
            owner_id=owner.id,
            title=title,
            author=author,
            description=description,
            category=category,
            condition=condition,
            price=price,
        )

    def update(
        self, *, listing_id: uuid.UUID, requester: User, fields: dict[str, object]
    ) -> Listing:
        """FR-021/024/028, UC-3. Precedence — existence, then ownership,
        then status — matches UC-3's exception flow literally: "Requester
        is not owner -> 403. Listing status is sold or deleted -> 409 ...
        not 404". FR-006a's owner/admin visibility exception is scoped to
        "listing detail retrieval" (its own wording) and is deliberately
        NOT re-applied here — a non-owner PATCHing someone else's deleted
        listing gets 403 (not 404), same as they would for any other
        listing that isn't theirs; UC-3 does not ask for that distinction
        to be collapsed into FR-006a's rule.
        """
        listing = self._get_or_404(listing_id)
        self._require_owner(listing, requester)
        self._require_available(listing)
        return self._listings.update_fields(listing, fields)

    def mark_sold(self, *, listing_id: uuid.UUID, requester: User) -> Listing:
        """FR-023/024, UC-4."""
        listing = self._get_or_404(listing_id)
        self._require_owner(listing, requester)
        self._require_available(listing)
        return self._listings.mark_sold(listing)

    def delete(self, *, listing_id: uuid.UUID, requester: User) -> None:
        """FR-022/024/027/029, UC-5. No status precondition (delete works
        from any status) and idempotent: deleting an already-`deleted`
        listing is a silent no-op, not an error — FR-029 is explicit that
        this must not modify `updated_at` a second time, so this returns
        early before calling into the repository at all rather than
        performing a redundant no-op `UPDATE`.
        """
        listing = self._get_or_404(listing_id)
        self._require_owner(listing, requester)
        if listing.status == ListingStatusEnum.DELETED:
            return
        self._listings.soft_delete(listing)

    def admin_list(self, *, status: ListingStatusEnum | None, page: int, page_size: int) -> Page:
        """FR-043 (Milestone 4): admin view of any/all listings. No
        ownership or visibility check — the router's `require_admin`
        dependency is what gates who may call this at all (SEC-031); this
        method's only job is the query itself, delegated straight to
        `ListingRepository.list_all` (see that method's docstring for why
        it's a separate repository method from `browse`, not a parameter
        on it).
        """
        return self._listings.list_all(status=status, page=page, page_size=page_size)

    def admin_remove(self, listing_id: uuid.UUID) -> bool:
        """FR-042/UC-5's admin path, and FR-029's admin-specific idempotency
        clause: "deleting a listing whose status is already deleted MUST
        be idempotent... without creating a duplicate admin audit entry
        when performed by an admin." No ownership check (admin may remove
        ANY listing, unlike `delete`, which is owner-only) — the router's
        `require_admin` dependency gates who may call this.

        Returns whether a real state transition happened (`True`) or the
        listing was already `deleted` (`False`) — `AdminService` uses this
        to decide whether to write an `AdminAction` audit record, which is
        exactly what FR-029's "without creating a duplicate admin audit
        entry" requires: the audit write must not happen at all on the
        no-op path, not merely avoid being literally identical to a prior
        one.
        """
        listing = self._get_or_404(listing_id)
        if listing.status == ListingStatusEnum.DELETED:
            return False
        self._listings.soft_delete(listing)
        return True

    def upload_images(
        self, *, listing_id: uuid.UUID, requester: User, files: list[bytes]
    ) -> list[ListingImage]:
        """API-030/031/032, SEC-060/061, NFR-007.

        Ordering matters for API-032's atomicity guarantee: every check
        that can be decided without touching storage (existence, ownership,
        status, file count, per-file size/content) runs FIRST, so the
        overwhelmingly common rejection cases (wrong owner, too many files,
        bad file type) never touch object storage at all. Only once every
        file has passed validation do we start writing to storage; if a
        write fails partway through the batch, we best-effort delete
        whatever WAS written (S3-compatible stores have no multi-object
        transaction to rely on instead) before reporting 503, and the
        database is never touched at all in that case — `add_images` is
        the last call in this method, not interleaved with the storage
        writes, so a storage failure can never leave a DB row pointing at
        an object that was never actually written.
        """
        listing = self._get_or_404(listing_id)
        self._require_owner(listing, requester)
        # Extends FR-028's "only mutate an available listing" principle to
        # image upload (not itself named by FR-028's "edit" wording, but
        # §8.3's user flow groups content changes together the same way —
        # see IMPLEMENTATION_SUMMARY.md for this interpretation call).
        self._require_available(listing)

        if not files:
            raise ValidationError(
                "Validation failed.", fields={"images": ["At least one image file is required."]}
            )

        current_count = self._listings.count_images(listing_id)
        if current_count + len(files) > MAX_IMAGES_PER_LISTING:
            raise ValidationError(
                "Validation failed.",
                fields={
                    "images": [
                        f"This listing already has {current_count} image(s); uploading "
                        f"{len(files)} more would exceed the {MAX_IMAGES_PER_LISTING}-image limit."
                    ]
                },
            )

        validated: list[tuple[bytes, str]] = []
        for data in files:
            if len(data) > MAX_IMAGE_SIZE_BYTES:
                raise ValidationError(
                    "Validation failed.",
                    fields={"images": ["One or more files exceed the 5MB size limit."]},
                )
            content_type = sniff_image_content_type(data)
            if content_type is None:
                raise ValidationError(
                    "Validation failed.",
                    fields={
                        "images": ["One or more files are not a valid JPEG, PNG, or WebP image."]
                    },
                )
            validated.append((data, content_type))

        positioned = self._write_to_storage(listing_id, current_count, validated)
        return self._listings.add_images(listing_id, positioned)

    def _write_to_storage(
        self, listing_id: uuid.UUID, start_position: int, validated: list[tuple[bytes, str]]
    ) -> list[tuple[str, int]]:
        written_keys: list[str] = []
        positioned: list[tuple[str, int]] = []
        try:
            for offset, (data, content_type) in enumerate(validated):
                # SEC-061: server-generated UUID key, never derived from a
                # client-supplied filename.
                extension = extension_for_content_type(content_type)
                key = f"listings/{listing_id}/{uuid.uuid4()}.{extension}"
                self._storage.put(key, data, content_type)
                written_keys.append(key)
                positioned.append((key, start_position + offset))
        except Exception as exc:  # noqa: BLE001 - any storage failure means "unavailable"; see NFR-007
            for key in written_keys:
                with contextlib.suppress(Exception):
                    self._storage.delete(key)
            raise StorageUnavailableError() from exc
        return positioned

    def _get_or_404(self, listing_id: uuid.UUID) -> Listing:
        listing = self._listings.get_by_id(listing_id)
        if listing is None:
            raise NotFoundError("Listing not found.")
        return listing

    def _require_owner(self, listing: Listing, requester: User) -> None:
        if listing.owner_id != requester.id:
            raise ForbiddenError("You do not own this listing.")

    def _require_available(self, listing: Listing) -> None:
        if listing.status != ListingStatusEnum.AVAILABLE:
            raise ConflictError(f"Listing is {listing.status.value}, not available.")
