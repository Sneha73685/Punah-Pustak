# API Reference

REST over JSON, versioned under `/api/v1/`. The running backend also serves interactive, always-current docs at `/docs` (Swagger UI) and the raw schema at `/openapi.json` — this document is a human-readable companion to that, not a replacement; if the two ever disagree, `/openapi.json` (generated directly from the code) is authoritative.

## Conventions

### Error envelope

Every non-2xx response — including ones FastAPI/Pydantic generate automatically, like a malformed request body — has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "fields": { "price": ["Input should be greater than 0"] }
  }
}
```

`fields` is present only when there's field-level detail (typically a `422`); it's omitted entirely otherwise, not present-but-`null`.

| Status | Meaning | Example `code` |
|---|---|---|
| 400 | Malformed request | `BAD_REQUEST` |
| 401 | Missing/invalid/expired auth | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN` |
| 403 | Authenticated, but not authorized | `FORBIDDEN`, `PASSWORD_CHANGE_REQUIRED` |
| 404 | Not found (including a soft-deleted resource, for a non-owner/non-admin requester) | `NOT_FOUND` |
| 409 | Well-formed and authorized, but the resource's current state forbids it | `CONFLICT` |
| 422 | Validation failure (schema-level or business-rule) | `VALIDATION_ERROR` |
| 429 | Rate limited | `RATE_LIMITED` |
| 503 | A dependency (object storage, database) is unavailable | `SERVICE_UNAVAILABLE` |

### Pagination

Every list endpoint uses offset pagination via `page` (≥1) and `page_size` (≤50, default 20), returning:

```json
{ "items": [...], "total": 137, "page": 1, "page_size": 20 }
```

### Authentication

Authenticated requests send `Authorization: Bearer <access_token>`. The refresh token travels only as an `HttpOnly` cookie, automatically attached by the browser — it never appears in a request header or a response body. See [`authentication.md`](authentication.md) for the full lifecycle.

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Liveness/readiness — verifies real database connectivity, not just process liveness. Returns `503` if the database is unreachable. |

```json
// 200
{ "status": "ok", "checks": { "database": "ok" } }
```

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public, rate-limited | Create an account. **Does not log the caller in** — no tokens are issued by this endpoint. |
| `POST` | `/api/v1/auth/login` | Public, rate-limited | Verify credentials, issue an access token (body) and a refresh token (cookie). |
| `POST` | `/api/v1/auth/refresh` | Refresh cookie, rate-limited | Rotate the refresh token, issue a new access token. |
| `POST` | `/api/v1/auth/logout` | Bearer token | Revoke the current refresh token and clear the cookie. |

```json
// POST /auth/register — request
{ "email": "reader@example.com", "password": "at-least-10-characters", "display_name": "Reader" }
// 201 — returns the created UserPublic (see Users below)
```

```json
// POST /auth/login — request
{ "email": "reader@example.com", "password": "at-least-10-characters" }
// 200
{ "access_token": "eyJ...", "token_type": "bearer", "expires_in": 900 }
// + Set-Cookie: refresh_token=...; HttpOnly; SameSite=Strict; Path=/api/v1/auth
```

`POST /auth/refresh` and `POST /auth/logout` return the same `AccessTokenResponse` shape and `204 No Content` respectively — refresh takes no body (the cookie is read server-side); logout takes no body either.

## Listings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/listings` | Public | Browse/search/filter, paginated. Only ever returns `available` listings from non-suspended sellers, regardless of any filter supplied. |
| `GET` | `/api/v1/listings/{id}` | Public (expanded for owner/admin) | Detail view. A `deleted` listing 404s unless the requester is its owner or an admin. |
| `POST` | `/api/v1/listings` | Bearer token | Create a listing. |
| `PATCH` | `/api/v1/listings/{id}` | Bearer token (owner) | Edit — only while `available`; `403` if not the owner, `409` if `sold`/`deleted`. |
| `DELETE` | `/api/v1/listings/{id}` | Bearer token (owner) | Soft-delete. Idempotent — deleting an already-deleted listing returns `204` with no error. |
| `POST` | `/api/v1/listings/{id}/sold` | Bearer token (owner) | Mark sold — only while `available`. |
| `POST` | `/api/v1/listings/{id}/images` | Bearer token (owner) | Upload 1+ images in one `multipart/form-data` request (field name `images`) — only while `available`. |

**Query parameters on `GET /listings`:** `search` (plain-text, matched against title+author via full-text search), `category`, `condition`, `min_price`, `max_price`, `page`, `page_size`.

```json
// POST /listings — request
{
  "title": "The Pragmatic Programmer",
  "author": "Hunt & Thomas",
  "description": "Good condition, some highlighting.",
  "category": "non_fiction",
  "condition": "good",
  "price": 12.50
}
```

```json
// 201 / 200 — ListingPublic, returned by every listing-mutating endpoint above
{
  "id": "…", "owner_id": "…", "seller_display_name": "Reader",
  "title": "…", "author": "…", "description": "…",
  "category": "non_fiction", "condition": "good", "price": "12.50",
  "status": "available", "sold_at": null,
  "created_at": "…", "updated_at": "…",
  "images": [{ "id": "…", "url": "http://…", "position": 0 }]
}
```

`ListingUpdate` (the `PATCH` body) has every field optional — an omitted field means "leave unchanged" (`exclude_unset`, not `exclude_none`); an explicit `null` is a validation error, since no field in this model is nullable in the domain.

`POST /listings/{id}/images` accepts one or more JPEG/PNG/WebP files (verified by content, not declared type), max 5MB each, up to 6 cumulative images per listing across all upload calls — the whole request is rejected (`422`) if it would push the total over 6; there is no partial success.

## My Listings (owned by the `listings` module, under the `/users/me` prefix)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/me/listings` | Bearer token | Every listing you own, **any** status — the one place `sold`/`deleted` listings you own are visible in a list. |
| `GET` | `/api/v1/users/me/listings/summary` | Bearer token | `{ "available": n, "sold": n, "deleted": n }` |

## Users (own profile)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | Bearer token | Own profile. |
| `PATCH` | `/api/v1/users/me` | Bearer token | Edit display name. There is no `email` field on the request body at all — email cannot be changed in this version, by construction. |
| `POST` | `/api/v1/users/me/password` | Bearer token (the one exception to the forced-password-change gate) | Change password — self-initiated, or completing an admin-triggered forced reset. Same request shape either way. |

```json
// UserPublic — returned by GET/PATCH /users/me and POST /auth/register
{ "id": "…", "email": "reader@example.com", "display_name": "Reader", "role": "user", "created_at": "…" }
```

```json
// POST /users/me/password — request
{ "current_password": "…", "new_password": "at-least-10-characters" }
// 204 No Content
```

## Admin

Every endpoint below requires an authenticated caller whose `role` is `admin` (`403 FORBIDDEN` otherwise) — a distinct check from plain authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/admin/users` | List every user, paginated. |
| `POST` | `/api/v1/admin/users/{id}/suspend` | Suspend a user. Body: `{ "reason_code": "..." }`. `403` if the target is an admin; `409` if already suspended. |
| `POST` | `/api/v1/admin/users/{id}/reinstate` | Reinstate a suspended user. No body. `403` if target is an admin; `409` if not currently suspended. |
| `POST` | `/api/v1/admin/users/{id}/reset-password` | Generate and set a temporary password. No body. `403` if target is an admin. |
| `GET` | `/api/v1/admin/listings` | List listings, any status. Optional `?status=` filter. |
| `DELETE` | `/api/v1/admin/listings/{id}` | Remove (soft-delete) a listing. **`reason_code` is a required query parameter**, not a body — see below. |

```json
// POST /admin/users/{id}/suspend — request
{ "reason_code": "abusive-behavior" }
```

```json
// POST /admin/users/{id}/reset-password — response
{ "temporary_password": "kZ8x…" }  // shown exactly once; never retrievable again
```

**Why `remove_listing`'s reason code is a query parameter and `suspend_user`'s is a body field:** both are conceptually the same "required reason for an audit-logged action," but `DELETE` requests carrying a JSON body have no defined semantics in HTTP itself and are inconsistently supported by real proxies and clients — exactly the kind of "technically legal, practically fragile" corner this project avoids elsewhere. `POST` has no such issue, so `suspend_user` keeps a normal Pydantic body.

Every admin action above writes an append-only audit record (`admin_actions`) — see [`database.md`](database.md).

## Related documents

- [`authentication.md`](authentication.md) — the token lifecycle behind the `Auth` endpoints
- [`database.md`](database.md) — the schema every response shape maps onto
- [`backend.md`](backend.md) — the router/service code implementing each endpoint
