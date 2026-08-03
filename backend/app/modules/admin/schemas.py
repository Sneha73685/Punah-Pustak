"""Pydantic v2 request/response schemas for the admin endpoints (API-020) —
handlers MUST NOT accept raw dicts.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AdminUserPublic(BaseModel):
    """FR-040: "basic metadata (email, display name, created date,
    status)". `status` is `is_active` directly (`True`/`False`) rather than
    a string enum — there are exactly two states for a `User` (§10.1 has no
    third), so a bool is the right-sized shape, the same reasoning
    `ListingStatusSummary` (Milestone 3) already used for a small, fixed
    set of values. Distinct from `app.modules.users.schemas.UserPublic`:
    that schema is what a user sees of *themselves* and deliberately omits
    `is_active`/role, since a suspended user doesn't need (and per FR-006
    -adjacent reasoning, shouldn't necessarily be told mechanically) their
    own account-status field rendered back at them by that endpoint; this
    is what an *admin* sees of *any* account, which is a different
    audience with different fields.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime
    is_active: bool


class AdminUserPage(BaseModel):
    """API-003: pagination metadata shaped as total/page/page_size — same
    convention `ListingPage` already established in Milestone 2.
    """

    items: list[AdminUserPublic]
    total: int
    page: int
    page_size: int


class SuspendUserRequest(BaseModel):
    """§10.1: `reason_code` is required for `suspend_user`.

    `remove_listing` also requires a `reason_code` (§10.1), but
    `DELETE /admin/listings/{id}` takes it as a query parameter instead of
    a body — deliberately not a second, near-identical schema shared with
    this one. That split is not stylistic: `httpx`'s (and therefore
    `TestClient`'s) `Client.delete()` has no `json`/`content` parameter at
    all in this project's pinned version, only `DELETE /listings/{id}`'s
    kind of body-less delete is actually exercisable through it without
    dropping to the low-level `.request("DELETE", ...)` call — and more
    fundamentally, a request body on `DELETE` has no defined semantics in
    HTTP itself and is inconsistently supported by proxies/clients in the
    wild, which is exactly the kind of "technically legal, practically
    fragile" corner this project avoids elsewhere. `POST /suspend` has
    no such issue — a body on `POST` is completely unremarkable — so it
    keeps the schema/`API-020` treatment `reinstate_user`'s bodyless
    `POST` and every other mutating endpoint in this codebase already gets.
    `reinstate_user`/`reset_password` don't use this at all: §10.1 states
    `reason_code` is "not applicable to reset_password", and nothing in
    FR-041/UC-6 asks for one on reinstate either — only the
    punitive/moderation actions require a stated reason.
    """

    reason_code: str = Field(min_length=1, max_length=200)


class AdminPasswordResetResponse(BaseModel):
    """FR-045: "return the temporary password once, in the API response to
    the admin." This is the only place this value is ever transmitted —
    never persisted in plaintext, never logged, never emailed (NG-9/FR-045
    are explicit that the system must not email it).
    """

    temporary_password: str
