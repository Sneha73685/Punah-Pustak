# Implementation Summary

Referenced from inline comments across `backend/app/`. This is the decision
log those comments point to: implementation choices the SRS (v2.1.0) leaves
to the implementer, recorded here so a future contributor finds the
reasoning instead of re-litigating it. Organized by milestone; each
milestone's section is written once, when that milestone is completed, and
left as a historical record after that (later corrections get their own
"Pitfall" entry rather than silently rewriting an earlier section).

## Directory structure (current, as of Milestone 1)

```
backend/
  app/
    core/       # settings, db engine/session (incl. commit/rollback lifecycle),
                # structured logging, global error handlers, domain-exception
                # hierarchy, in-memory rate limiter — all framework-agnostic
                # except errors.py (translates framework/domain exceptions to
                # the API-010 envelope) and rate_limit's HTTP-facing wrapper,
                # which lives in app.modules.auth.dependencies instead
    api/v1/     # versioned routers (API-002): health.py, plus auth's router
                # included here (app.modules.auth.router)
    modules/
      auth/     # registration, login, refresh, logout — routers/services/
                # repositories/schemas/security(hashing)/tokens(JWT+opaque)/
                # dependencies (get_current_user, rate-limit wrapper)
      users/    # User account data; service.py is auth's only way to reach
                # it (BE-002 cross-module boundary)
      listings/ # models.py only — Milestone 2
      admin/    # models.py only — Milestone 4
      storage/  # empty — Milestone 2
  alembic/      # migrations; env.py imports every module's models so
                # Base.metadata is fully populated for autogenerate (verified
                # empty-diff after both Milestone 0 and Milestone 1)
  tests/        # pytest: schema/repository round-trips (real Postgres),
                # service-layer unit tests (fully faked collaborators),
                # API-level tests (real app + TestClient), health, error
                # envelope, db session lifecycle, config validation
frontend/
  src/          # placeholder scaffold only — real pages arrive Milestone 5
```

## Milestone 0 — decisions not mandated by the SRS

### Sync SQLAlchemy (psycopg3), not async
`backend/app/core/db.py` uses a synchronous `Engine`/`Session` rather than
`AsyncEngine`/`asyncpg`. NFR-002 caps this system's target scale at a single
application instance and ~50 concurrent users; at that scale, sync
SQLAlchemy running in FastAPI's threadpool is simpler to reason about,
simpler to test (no `pytest-asyncio` fixture plumbing), and has no
meaningful throughput disadvantage. Async SQLAlchemy would be justified at a
scale this project explicitly does not target (§17.1).

### `RefreshToken.user_id` — `ON DELETE CASCADE`
Not stated explicitly in §11.5/DB-031, which only specifies FK behavior for
`Listing.owner_id` and `ListingImage.listing_id`. A refresh token has no
meaning without its user, exactly like `ListingImage` has no meaning without
its `Listing` (DB-031's stated rationale for that cascade), so the same
cascade is applied here. Moot in practice today since DB-021 forbids
hard-deleting users at all, but the constraint documents the intended
relationship for when/if that ever changes.

### `AdminAction.admin_id` — `ON DELETE RESTRICT`
Also not stated explicitly in §11.5. An audit log must never lose its actor
— the row referencing an admin must not be silently orphaned by a cascade
delete. `RESTRICT` is the same choice DB-031 makes for `Listing.owner_id`
and for the same reason. Moot today since DB-021 forbids hard-deleting users
at all.

### No `AppError` / domain-exception hierarchy yet (Milestone 0; resolved in Milestone 1)
`backend/app/core/errors.py` registered handlers for `RequestValidationError`,
`StarletteHTTPException`, and a catch-all `Exception` only — no
application-level domain-exception base class. Milestone 0 had no
business-logic endpoints to raise domain errors from (the only real
endpoint was the health check), so introducing that hierarchy then would
have been exactly the kind of future-proofing the SRS asks implementers to
avoid (see SRS §1.4). This was deferred, not forgotten, and landed in
Milestone 1 as `app.core.exceptions.DomainError` — see that section below.

## Pitfall found and fixed during the Milestone 0 freeze review

The initial migration (`0001_initial_schema.py`) is hand-written, and the
ORM models were written to *describe* the same schema rather than being the
literal source the migration was generated from. Several models initially
drifted from what the migration actually created: `Listing.status` and
`User.is_active` were missing `index=True` even though the migration
indexes both (DB-040, DB-044); the composite `(status, category, condition)`
and GIN `search_vector` indexes (DB-041, DB-042) existed only in the
migration, not in `__table_args__`; and `User.email` had `unique=True,
index=True` together, which produces a *different* database object (a named
unique `Index`) than the plain `UniqueConstraint` the migration actually
creates via bare `unique=True`.

None of this broke Milestone 0 (the migration is what actually runs against
the database), but it silently broke the one stated purpose of importing
every module's models into `alembic/env.py`: letting `alembic revision
--autogenerate` diff correctly against the real schema. Before the fix,
autogenerate proposed dropping four real indexes and replacing the email
unique constraint on the very first run. **Rule for Milestone 1+**: any
`index=True`, `unique=True`, or `Index(...)` in `__table_args__` written
into a migration MUST have an exactly matching declaration in the ORM
model, and the way to verify that is to actually run `alembic revision
--autogenerate` against a freshly-migrated database and confirm the
generated migration is empty — not to eyeball the two files side by side.

## Milestone 0 → 1 gap (resolved): CI never ran tests

CI (`.github/workflows/ci.yml`) ran lint and type-check only through the end
of Milestone 0, per its explicit scope in SRS §23 ("CI pipeline skeleton
(lint/type-check only, tests come next)"). Milestone 0's tests were real and
passing but only ever verified locally. Milestone 1 adds a `backend-tests`
job with a real, containerized Postgres service (mirroring
`docker-compose.yml`'s `db` service — TEST-002 forbids SQLite-as-a-stand-in)
that runs `alembic upgrade head` then `pytest`, so every PR is now actually
gated on the test suite, not just lint/type-check.

## Milestone 1 — Authentication

### Domain-exception hierarchy: `app.core.exceptions.DomainError`
Services raise `DomainError` subclasses (`ValidationFailedError`,
`InvalidCredentialsError`, `InvalidAccessTokenError`,
`InvalidRefreshTokenError`, `RateLimitExceededError`) instead of
`HTTPException`, keeping BE-001's "services MUST NOT import FastAPI
request/response types" intact. `app.core.errors` gained a fourth handler
that translates any `DomainError` into the API-010 envelope centrally,
using the status code and `code` each subclass already carries — the same
"implemented once, centrally" principle BE-042 established for framework
errors in Milestone 0. Status codes on `DomainError` are plain `int`
literals, not `fastapi.status` constants, so `app.core.exceptions` itself
stays framework-agnostic per `app.core`'s own charter (only `errors.py` is
allowed to import FastAPI).

### Rate limiting: in-memory, split across `core` and `auth`
`app.core.rate_limit.FixedWindowRateLimiter` is pure Python (per-key fixed
60s window, thread-lock protected since FastAPI runs sync dependencies in a
threadpool) — no FastAPI import, consistent with `app.core`'s charter.
Reading the client IP off the request is an HTTP concern, so that wrapper
(`enforce_auth_rate_limit`) lives in `app.modules.auth.dependencies`
instead. SEC-040 explicitly calls for exactly this single-process,
in-memory design at the project's single-instance target (NFR-002).

### Refresh-token hashing: HMAC-SHA256 keyed with `jwt_secret`, not a random salt
SEC-021 requires refresh tokens stored as a "salted hash". The token itself
is already a cryptographically random 256-bit value (`secrets.token_urlsafe`),
so the actual risk a salt/pepper defends against here is a leaked token
table being directly usable to forge matching hashes without also holding
the application secret — reusing `jwt_secret` as the HMAC key satisfies
that without adding a second secret whose only job would be hashing tokens.

### `RefreshToken` cookie is scoped to `/api/v1/auth`, not the whole API
Not required by SEC-022, but a reasonable least-privilege default: only
`refresh` and `logout` ever read this cookie, so there's no reason for the
browser to attach it to every other API request.

### Pitfall found and fixed: `get_db`'s rollback silently undid a security-critical write
The most significant bug this milestone: `get_db` (added this milestone —
Milestone 0 had no mutating endpoints, so it was flush-only and this class
of bug couldn't exist yet) originally rolled back on *any* exception,
including a `DomainError` a service raises deliberately. This is correct
for most `DomainError`s (e.g. a duplicate-email registration correctly
writes nothing, because `AuthService.register` checks for the duplicate
*before* writing) — but SEC-024's reuse-detection is a case where the
service **flushes a real, wanted write and then raises**:
`AuthService.refresh` calls `revoke_family()` (a bulk `UPDATE` revoking
every token in the family) and *then* raises `InvalidRefreshTokenError` to
report the theft to the client. The blanket rollback silently undid that
`UPDATE` — the client correctly got a 401, but the token family was never
actually revoked, so the "already-rotated" token could still be used again
right after. Fixed by splitting `get_db`'s exception handling
(`_with_transactional_lifecycle`): `DomainError` → commit, then re-raise
(the service is responsible for its own consistency, and by the time a
`DomainError` reaches here any flushed write is deliberate); any other,
genuinely unexpected exception → rollback, then re-raise, as a safety net
against a real bug leaving inconsistent state.

**This bug shipped past the entire automated test suite and was only found
by manually exercising the real API against a real running server.** The
reason: `api_client` (the pytest fixture used by every API-level test) used
to yield its session with no commit/rollback logic at all — it could not
have caught a bug in commit/rollback behavior it never exercised, no matter
how many tests ran against it. Fixed by rebuilding the fixture around
SQLAlchemy's `join_transaction_mode="create_savepoint"` (the "joining a
Session into an external transaction" pattern from SQLAlchemy's own testing
docs — `session.commit()` releases and restarts a SAVEPOINT instead of
committing the real, connection-level transaction) and having the fixture
call `_with_transactional_lifecycle` directly — the *exact same function*
`get_db` calls in production, not an independently maintained copy of the
same logic. This was verified two ways before trusting it: (1) reverting
just the shared logic and confirming the regression test
(`test_reusing_an_already_rotated_token_revokes_the_family`) then correctly
fails, and (2) reproducing the original bug and its fix end-to-end against
a real `docker compose` deployment, inspecting `refresh_tokens` rows
directly via `psql`.

**Rule for Milestone 2+**: if a service ever needs to flush a write and
then raise a `DomainError` to report a problem (mirroring SEC-024's
pattern), it will commit correctly by default — no extra plumbing needed.
But if a test fixture is ever built for a *different* mutating module
without routing it through `_with_transactional_lifecycle`, it will have
the same blind spot this one did. Don't hand-write a second copy of this
logic; import and reuse it.
