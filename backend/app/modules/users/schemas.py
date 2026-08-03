"""Pydantic v2 request/response schemas for `User` (API-020) — handlers
MUST NOT accept raw dicts.

Only a public-safe projection is ever serialized back to a client:
`password_hash` and `must_change_password` (an internal flag consumed only
by `get_current_user`'s FR-015 gate — see `app.modules.auth.dependencies` —
never by the client directly) are deliberately excluded from `UserPublic`.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.users.models import RoleEnum


class UserPublic(BaseModel):
    """Bugfix, discovered during Milestone 5 (frontend build-out): `role`
    was missing from this schema entirely. §6/FR-040 make `role` a
    genuinely public-to-its-owner fact (a user already knows whether
    they're an admin — this is not the kind of "other users' data" leak
    `UserPublic`'s exclusions above guard against), and nothing else in
    the API surface can substitute for it: the JWT access token payload
    carries only `sub`/`type`/`iat`/`exp` (SEC-020) with no role claim by
    design (a stateless claim would need to be treated as authoritative,
    reintroducing exactly the "trust a client-supplied/cached field for
    authorization" problem SEC-031 forbids), and admin authorization is
    correctly re-checked server-side on every request regardless
    (`require_admin`, Milestone 4) — so exposing `role` here changes
    nothing about how *authorization* works, it only lets the frontend
    decide whether to *render* admin navigation/pages at all. Without it,
    Milestone 5's admin UI has no non-hacky way to know whether the
    logged-in user should see it.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: RoleEnum
    created_at: datetime


class UserUpdate(BaseModel):
    """FR-030's only editable field. Not modeled as an optional/partial-PATCH
    field the way `ListingUpdate` models several independently-optional
    fields (Milestone 2) — `display_name` is the *only* thing FR-030 permits
    editing (FR-033 forbids email changes outright, so there is no second
    field for `exclude_unset` to meaningfully distinguish), so requiring it
    directly is simpler than an all-optional schema that could legitimately
    be submitted empty.
    """

    display_name: str = Field(min_length=1, max_length=100)


class PasswordChangeRequest(BaseModel):
    """FR-031. `current_password` carries the same field name regardless of
    whether the caller is doing a self-initiated change (a password they
    remember) or completing the forced-change flow (FR-015) with the
    one-time temporary password from FR-045 — from the API's perspective
    both are just "prove you know the password on the account right now",
    verified identically by `UserService.change_password`. No length
    constraint on `current_password` itself: it's being verified against a
    stored hash, not freshly validated against SEC-011's policy.
    """

    current_password: str
    # SEC-011: 10+ characters, no composition rules — identical policy to
    # `RegisterRequest.password` (Milestone 1).
    new_password: str = Field(min_length=10, max_length=256)
