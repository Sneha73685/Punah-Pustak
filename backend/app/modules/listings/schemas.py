"""Pydantic v2 request/response models for the listings endpoints (API-020)
— handlers MUST NOT accept raw dicts.

Category/condition/status reuse the same `(str, Enum)` classes the ORM
model (`app.modules.listings.models`) already defines rather than
duplicating them into parallel Pydantic-only enums — Pydantic v2 handles a
`str`-subclassed `Enum` natively as a JSON string value, so there is no
serialization reason to keep two copies in sync.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.listings.models import ListingCategoryEnum, ListingConditionEnum, ListingStatusEnum

# DB-030: numeric(10,2), > 0 — mirrored here so a malformed price is a 422
# (API-020 validation) rather than reaching the database's CHECK constraint.
_PriceField = Field(gt=0, max_digits=10, decimal_places=2)


class ListingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    author: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    category: ListingCategoryEnum
    condition: ListingConditionEnum
    price: Decimal = _PriceField


class ListingUpdate(BaseModel):
    """FR-021: full field set editable while `available` (FR-028) — every
    field optional so a PATCH can change just one. `model_dump(exclude_unset=True)`
    is what distinguishes "field omitted" from "field explicitly resent
    unchanged" at the service layer, not any default value here.
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    author: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    category: ListingCategoryEnum | None = None
    condition: ListingConditionEnum | None = None
    price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)


class ListingImagePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    position: int


class ListingPublic(BaseModel):
    """FR-005's detail shape, also reused for browse/My-Listings list items
    (§13.1 has no distinct "card" shape, and this scale doesn't justify
    maintaining two nearly-identical schemas — see IMPLEMENTATION_SUMMARY.md).

    FR-006: no seller contact info (email/phone) — only `seller_display_name`.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    seller_display_name: str
    title: str
    author: str
    description: str
    category: ListingCategoryEnum
    condition: ListingConditionEnum
    price: Decimal
    status: ListingStatusEnum
    sold_at: datetime | None
    created_at: datetime
    updated_at: datetime
    images: list[ListingImagePublic]


class ListingStatusSummary(BaseModel):
    """FR-032: "a summary of their own listings' counts by status." Explicit
    fields for the three fixed status values — not a dynamically-keyed
    `dict[str, int]` — for the same reason `category`/`condition` are fixed
    enums rather than free-text (§10.3/10.4): exactly three values that
    change on the order of "never", so a typed, self-documenting shape
    (each key visible in the OpenAPI schema, per API-021) is the
    right-sized choice over a schema-less mapping a client would have to
    infer the keys of.
    """

    available: int
    sold: int
    deleted: int


class ListingPage(BaseModel):
    """API-003: pagination metadata shaped as total/page/page_size — never
    a raw offset — so the contract could be swapped to cursor-based later
    without a breaking change.
    """

    items: list[ListingPublic]
    total: int
    page: int
    page_size: int
