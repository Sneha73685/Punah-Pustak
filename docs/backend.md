# Backend

FastAPI + SQLAlchemy 2.0 + Alembic + PostgreSQL, organized as a modular monolith. See [`architecture.md`](architecture.md) for *why* it's structured this way; this document is a tour of *what's actually in each module*.

```
backend/app/
├── main.py            application entrypoint — wires config, CORS, error handlers, routers
├── core/               framework-agnostic (except errors.py) cross-cutting concerns
│   ├── config.py         typed Settings (env vars)
│   ├── db.py              engine, session factory, commit/rollback lifecycle
│   ├── errors.py           global exception handlers → the API error envelope
│   ├── exceptions.py        the DomainError hierarchy services raise
│   ├── logging.py           structured (JSON) / human-readable logging setup
│   └── rate_limit.py         in-memory fixed-window limiter
├── api/v1/
│   ├── health.py           GET /api/v1/health
│   └── router.py            aggregates every module's router under /api/v1
└── modules/
    ├── auth/          register, login, refresh, logout; JWT + refresh-token machinery
    ├── users/         own-profile view/edit, password change
    ├── listings/      browse/search/filter, CRUD, image upload
    ├── admin/         moderation: user suspend/reinstate/reset, listing removal, audit log
    └── storage/       StorageBackend interface + S3-compatible implementation
```

## `app/main.py` — entrypoint

Deliberately thin. It configures logging, constructs the `FastAPI` app, adds the CORS middleware (exact-origin allowlist from `Settings`, credentials allowed for the refresh-token cookie), registers the four global exception handlers, and includes the versioned router. No business logic — that's exactly what the layering in `architecture.md` exists to keep out of here.

## `app/core/` — cross-cutting concerns

- **`config.py`** — one `Settings` (pydantic-settings) object, loaded from environment variables / `.env`. Includes a startup validator that **refuses to run** with `ENVIRONMENT=production` if the JWT secret is still the local-dev default, is under 32 bytes, or if the cookie's `Secure` flag is `False` — misconfiguration fails loudly at boot, not silently in production.
- **`db.py`** — the SQLAlchemy engine/session factory and the shared `Base` every model inherits from. `get_db` is a FastAPI dependency yielding a request-scoped session with a defined commit/rollback contract: a normal return commits; a raised `DomainError` still commits (because a service may have already made a deliberate, meaningful write before raising — e.g. refresh-token reuse detection revokes a token family *and then* reports the failure); any other exception rolls back. Synchronous SQLAlchemy (not `asyncio`/`asyncpg`) is used throughout — justified at this project's single-instance, ~50-concurrent-user target scale, where sync SQLAlchemy running in FastAPI's threadpool has no meaningful throughput disadvantage over async.
- **`errors.py`** — registers four exception handlers (`RequestValidationError`, `StarletteHTTPException`, `DomainError`, and a last-resort catch-all `Exception`) that all funnel into the same envelope: `{"error": {"code", "message", "fields"?}}`. This is what makes *every* error response in the API — including ones FastAPI/Pydantic generate on their own — come back in one consistent shape.
- **`exceptions.py`** — the `DomainError` hierarchy: `ValidationFailedError` (422), `NotFoundError` (404), `ForbiddenError` (403), `ConflictError` (409), `StorageUnavailableError` (503), `InvalidCredentialsError`/`InvalidAccessTokenError`/`InvalidRefreshTokenError` (401), `RateLimitExceededError` (429), `PasswordChangeRequiredError` (403). Each subclass carries its own status code and machine-readable `code` — services raise these directly, never an HTTP exception.
- **`logging.py`** — JSON-structured logs in any non-local environment (for ingestion by a standard log aggregator with no custom parsing); a human-readable format locally. No third-party logging library — the standard library's `logging` module plus a small custom formatter.
- **`rate_limit.py`** — a thread-safe, in-memory, fixed 60-second-window limiter, keyed by `(endpoint path, client IP)`. Explicitly a single-process design matching the single-instance deployment target — moving to a shared store (Redis) is a scaling change, not something built speculatively now.

## `auth` module

Registration, login, refresh, logout, and the JWT/refresh-token machinery every other module's authorization depends on.

| File | Responsibility |
|---|---|
| `router.py` | `POST /auth/register`, `/login`, `/refresh`, `/logout`. Sets/clears the refresh-token cookie (`HttpOnly`, `SameSite=Strict`, `Secure` per environment), scoped to the `/api/v1/auth` path. |
| `service.py` | `AuthService` — `register` (checks for a duplicate email, hashes the password, delegates creation to `UserService`), `login` (verifies credentials, rejects a suspended account, issues a token pair), `refresh` (SEC-023/024: rotates the presented token; a *revoked* token being re-presented revokes the whole token family), `logout`, and `revoke_all_tokens_for_user` (called by `AdminService` on suspension). |
| `tokens.py` | `create_access_token`/`decode_access_token` (HS256 JWT, `sub`/`type`/`iat`/`exp` claims only — no role claim), `generate_refresh_token` (a cryptographically random opaque string, never a JWT), `hash_refresh_token` (HMAC-SHA256, keyed with the JWT secret — refresh tokens are never stored in plaintext). |
| `security.py` | Argon2id password hashing (`hash_password`/`verify_password`) and `generate_temporary_password` (used by the admin-assisted reset flow). |
| `dependencies.py` | `get_current_user` (the standard "who is calling" dependency — also enforces the forced-password-change gate globally), `get_current_user_for_password_change` (the one deliberate exception, used only by the password-change endpoint itself), `get_current_user_optional` (for genuinely public endpoints that behave differently for a known caller — e.g. listing detail), `require_admin`, and `enforce_auth_rate_limit`. |
| `models.py` | `RefreshToken` — `token_hash`, `family_id` (groups every token descended from one login), `revoked`, `expires_at`. |
| `repository.py` | `RefreshTokenRepository` — `create`, `get_by_hash`, `revoke`, `revoke_family` (reuse detection), `revoke_all_for_user` (suspension). `refresh` reads via a separate `get_by_hash_for_update` (a `SELECT ... FOR UPDATE` row lock) rather than plain `get_by_hash` — two requests presenting the same not-yet-rotated token concurrently (e.g. two tabs restoring a session at once) would otherwise both observe it as not-yet-revoked and both rotate it, an unresolved release-audit finding fixed post-Milestone-5. `logout` still uses the unlocked `get_by_hash`: a redundant concurrent revoke is a harmless no-op. |

See [`authentication.md`](authentication.md) for the full lifecycle, including exactly how rotation and reuse detection work.

## `users` module

A user's own profile, plus the primitives `admin` orchestrates for moderation.

- **`router.py`** — `GET/PATCH /users/me` (view/edit display name — email is immutable by construction: `UserUpdate` has no `email` field for a client to submit at all), `POST /users/me/password` (self-initiated change *or* completing the forced-change flow — same endpoint, same field names, either way).
- **`service.py`** — `UserService`, the module's public interface for every other module. `update_display_name`, `change_password` (verifies the current password identically whether it's a remembered one or a temporary one issued by an admin reset), `suspend`/`reinstate`/`reset_password` (each owns its own precondition: an admin account can never be suspended, reinstated, or reset via these methods — `ForbiddenError`; suspending an already-suspended account is a `ConflictError`, not a silent no-op).
- **`repository.py`** — `UserRepository`. Notably: `create` catches a concurrent-duplicate-email `IntegrityError` (the `citext` unique constraint is the actual source of truth, not the service's pre-check, which is inherently racy under concurrent registrations) and translates it into the same clean 422 the pre-check path returns. `list_users` orders by `created_at DESC, id DESC` — the `id` tiebreaker exists because Postgres's `now()` returns the *transaction's* start time, so multiple rows inserted in one transaction can share an identical timestamp; without a unique tiebreaker, pagination over tied rows isn't guaranteed stable.
- **`models.py`** — `User`: `email` (`CITEXT`, unique), `password_hash`, `display_name`, `role` (`user`/`admin`), `is_active`, `must_change_password`.

## `listings` module

The core resource: browse, search, filter, CRUD, and image upload.

- **`router.py`** — two `APIRouter`s: `router` (everything under `/listings`) and `my_listings_router` (`/users/me/listings` and `/users/me/listings/summary` — owned here because module ownership follows the resource returned, not the URL prefix). Also defines `to_public`, the function that enriches a raw `Listing` row with its seller's display name (via `UserService`) and browser-fetchable image URLs (via `StorageBackend`) — reused as-is by `admin/router.py` for the admin listings view, so the two never drift into two slightly different shapes.
- **`service.py`** — `ListingService`. `browse` delegates straight to the repository (the `status=available` / non-suspended-seller constraints are baked in at the repository level, not here — see below). `get_detail` implements the one visibility rule that matters most in this codebase: a `deleted` listing 404s for anyone who isn't its owner or an admin; a `sold` listing has no such restriction (a bookmarked link to a since-sold listing still resolves). `update`/`mark_sold` both require the requester to own the listing *and* the listing to currently be `available` (editing a `sold`/`deleted` listing is `409`, not `404` — it still exists, it's just not in an editable state). `delete` is owner-only and idempotent — deleting an already-deleted listing is a silent no-op, not an error, and deliberately returns *before* touching the repository so `updated_at` is never touched a second time. `upload_images` validates everything it can without touching storage first (ownership, status, cumulative image count, per-file size and content-sniffed type), and only then writes to storage — if a multi-file batch partially fails, whatever was written is best-effort deleted and the database is never touched, so an upload either fully succeeds or leaves no trace. It fetches the listing via `get_for_update` (a row lock), not the plain `_get_or_404` every other method here uses: this is the one method that reads a count and writes new rows in the same request, and a second concurrent upload to the same listing needs to see the first one's writes before deciding whether it still fits under the 6-image cap — an unresolved release-audit finding fixed post-Milestone-5 (verified live: concurrent uploads previously produced up to 9 images with duplicate `position` values).
- **`repository.py`** — `ListingRepository`. `browse`'s `status = available` constraint (and, since Milestone 4, its join excluding suspended sellers) is unconditional and not parameterizable by any caller-supplied filter — a security-relevant constraint that must never be weakened. `list_all` (the admin equivalent, seeing every status and every seller) is a *separate* method rather than a parameter on `browse`, specifically so a privileged "see everything" query path can never share a code path where a caller-supplied value could accidentally widen the public one. Full-text search uses `plainto_tsquery` against the generated `search_vector` column (treats the input as plain text, not tsquery operator syntax).
- **`image_validation.py`** — content-type detection by magic-byte sniffing (JPEG/PNG/WebP), never trusted from a declared `Content-Type` header or filename.
- **`models.py`** — `Listing` (`category`/`condition`/`status` enums, `price` as `numeric(10,2)` with a `CHECK (price > 0)` constraint, the generated `search_vector` column) and `ListingImage` (`object_key`, `position`).

## `admin` module

Moderation only — user suspend/reinstate/reset-password, listing removal, and the audit trail.

- **`router.py`** — every endpoint depends on `require_admin`; there is no endpoint in this router reachable by anyone else.
- **`service.py`** — `AdminService`, the orchestration layer for actions that cross module boundaries. `suspend_user` calls `UserService.suspend` (which owns the "not an admin, not already suspended" precondition), *then* `AuthService.revoke_all_tokens_for_user` (SEC-025 — immediately blocks further refresh/login), *then* writes the audit record — in that order, so a rejected request (wrong precondition) has no side effects at all. `remove_listing` only writes an audit record if `ListingService.admin_remove` reports a real state transition happened — removing an already-deleted listing produces no duplicate audit entry (FR-029's idempotency requirement, extended to the admin path).
- **`repository.py`** — `AdminActionRepository`. Deliberately offers only `create` — no `update`/`delete` method exists, so there is nothing for a future router to accidentally wire up against an audit log that's supposed to be append-only.
- **`models.py`** — `AdminAction`: `action_type` (`remove_listing` / `suspend_user` / `reinstate_user` / `reset_password`), `target_type` (`listing` / `user`), `target_id`, `reason_code` (required for the two punitive actions, null for the other two).

## `storage` module

- **`backend.py`** — the `StorageBackend` `Protocol`: `put`, `get_url`, `delete`. The service layer depends on this interface only, never on `boto3` directly — tests substitute an in-memory fake.
- **`s3_backend.py`** — `S3StorageBackend`, the only implementation, a thin `boto3` S3 client. Works identically against real AWS S3 and MinIO (used locally) — the class itself doesn't know or need to know which.
- **`dependencies.py`** — the FastAPI-facing wiring (`get_storage_backend`), separated from the framework-agnostic backend classes.

## Configuration and code quality

- **Ruff** (lint + format) and **mypy `--strict`** run in CI and as pre-commit hooks — see [`../.pre-commit-config.yaml`](../.pre-commit-config.yaml) and the `backend-lint-typecheck` CI job.
- All service-layer functions are fully type-hinted; mypy strict mode is what makes that a real, enforced guarantee rather than a convention.
- Migrations: a single hand-written Alembic revision (`0001_initial_schema`) — hand-written rather than autogenerated so every enum name, cascade behavior, and index is explicit and reviewable in one place. See [`database.md`](database.md).

## Related documents

- [`architecture.md`](architecture.md) — the layering rules and why
- [`database.md`](database.md) — full schema detail
- [`authentication.md`](authentication.md) — the token lifecycle
- [`api.md`](api.md) — the full endpoint reference
- [`testing.md`](testing.md) — how this backend is tested
