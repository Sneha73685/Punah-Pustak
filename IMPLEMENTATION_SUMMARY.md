# Implementation Summary

Referenced from inline comments across `backend/app/`. This is the decision
log those comments point to: implementation choices the SRS (v2.1.0) leaves
to the implementer, recorded here so a future contributor finds the
reasoning instead of re-litigating it. Organized by milestone; each
milestone's section is written once, when that milestone is completed, and
left as a historical record after that (later corrections get their own
"Pitfall" entry rather than silently rewriting an earlier section).

## Directory structure (current, as of Milestone 3)

```
backend/
  app/
    core/       # settings, db engine/session (incl. commit/rollback lifecycle),
                # structured logging, global error handlers, domain-exception
                # hierarchy, in-memory rate limiter — all framework-agnostic
                # except errors.py (translates framework/domain exceptions to
                # the API-010 envelope) and rate_limit's HTTP-facing wrapper,
                # which lives in app.modules.auth.dependencies instead
    api/v1/     # versioned routers (API-002): health.py, plus auth's,
                # listings', and users' routers included here
    modules/
      auth/     # registration, login, refresh, logout — routers/services/
                # repositories/schemas/security(hashing)/tokens(JWT+opaque)/
                # dependencies (get_current_user — now also FR-015's forced
                # -password-change gate — get_current_user_for_password_change,
                # get_current_user_optional, rate-limit wrapper)
      users/    # User account data + own-profile router (Milestone 3: view/
                # edit display name, change password); service.py is auth's,
                # listings', and this module's own router's way to reach it
                # (BE-002 cross-module boundary)
      listings/ # browse/search/filter, detail, My Listings, create/edit/
                # delete/mark-sold, image upload, status-count summary
                # (Milestone 3 adds the summary endpoint) — full stack
      admin/    # models.py only — Milestone 4
      storage/  # StorageBackend Protocol + S3StorageBackend (Milestone 2);
                # no model of its own, so it never appears in
                # alembic/env.py's model imports
  alembic/      # migrations; env.py imports every module's models so
                # Base.metadata is fully populated for autogenerate (verified
                # empty-diff after every milestone through Milestone 3 —
                # Milestone 3 added no migration of its own: `display_name`,
                # `password_hash`, and `must_change_password` were already
                # fully specified on `User` in 0001_initial_schema)
  tests/        # pytest: schema/repository round-trips (real Postgres),
                # service-layer unit tests (fully faked collaborators where
                # the service has one; a real, unpersisted ORM object where
                # it doesn't — see Milestone 3's `test_users_service.py`),
                # API-level tests (real app + TestClient, with an in-memory
                # fake StorageBackend), health, error envelope, db session
                # lifecycle, config validation
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

## Milestone 2 — Listings core

### One schema (`ListingPublic`) for both detail and list views
§13.1 doesn't describe a distinct "browse card" shape separate from the
detail page, and at this project's scale (a portfolio marketplace, not a
platform with genuinely different mobile/desktop/card/detail payloads)
maintaining two near-identical Pydantic models — one trimmed for list
items, one full for detail — would be duplication with no behavioral
payoff: every field on `ListingPublic` is cheap to compute (already loaded
via `selectinload`, or a single extra `UserService.get_by_id` call) and
nothing in FE-030's loading/error/empty-state handling needs a slimmer
list-item shape. If a real payload-size or N+1 problem shows up at a much
larger scale, splitting the schema is a bounded, isolated change — not a
reason to pre-emptively maintain two schemas today.

### One `UserService.get_by_id` call per listing on browse, not a batch fetch
`_to_public` (`app/modules/listings/router.py`) resolves each listing's
`seller_display_name` with one extra query per item rather than collecting
owner IDs across the page and issuing a single `WHERE id IN (...)` fetch.
API-003 caps `page_size` at 50 (a hard `Query(le=50)` constraint), so a
browse response is at most 51 queries (1 for the page + up to 50 for
owners) — trivial at NFR-002's target scale (single instance, ~50
concurrent users, low thousands of listings). A batch fetch would be the
right call at a scale where N+1 queries are a real bottleneck; introducing
that machinery now, with no profiling evidence of a problem, is exactly
the premature optimization the SRS's own philosophy (§1.4, Appendix A)
argues against. If this ever needs revisiting, the fix is confined to
`_to_public` and `UserService` — it doesn't touch the service or repository
layers.

### `storage_endpoint_url` vs `storage_public_url` — two settings, not one
Caught during implementation, before it shipped: an earlier draft used a
single `storage_endpoint_url` for both (a) the API container's
server-to-server calls to MinIO (`boto3` `put_object`/`delete_object`) and
(b) the URL returned to the browser in `ListingImagePublic.url`. Under
docker-compose these are genuinely different addresses — the API reaches
MinIO via the internal Docker network hostname `http://storage:9000`,
which is not resolvable from a browser on the host machine, while a
browser needs the host-published `http://localhost:9000`. Conflating them
would have produced listings whose images silently 200'd from `curl`
inside the `api` container (server-to-server calls always worked) while
returning broken image URLs to any real browser — the kind of bug that
looks fine in every automated test (which never renders an `<img>` tag)
and only shows up manually. Split into `storage_endpoint_url` (server-side,
private) and `storage_public_url` (client-facing, public) before this ever
reached a running container; verified by the manual `docker compose`
walkthrough below, which fetches an uploaded image's returned URL exactly
as a browser would.

### MinIO Community Edition and BE-031's bucket-CORS requirement
BE-031 asks for a per-bucket CORS policy. MinIO Community Edition (the
free, self-hosted image used in `docker-compose.yml`, pinned implicitly via
`minio/minio:latest`, verified against `RELEASE.2025-09-07`) does not
implement the S3 `PutBucketCors`/`GetBucketCors` API — both return `501 Not
Implemented`, confirmed directly against a running container rather than
assumed from documentation. The commercial MinIO AIStor tier and real AWS
S3 both support it; Community doesn't. MinIO Community's documented
equivalent is the server-level `MINIO_API_CORS_ALLOW_ORIGIN` environment
variable, which applies the same `Access-Control-Allow-Origin`/`-Methods`
response headers to every S3 API request the server handles. At this
project's scale — one bucket, one MinIO instance — that is behaviorally
identical to a real per-bucket policy, so it satisfies BE-031's intent
without requiring the paid tier. Verified directly (not just configured):
```
curl -i -X OPTIONS http://localhost:9000/punah-pustak-listing-images/test \
  -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET"
```
returned `204` with `Access-Control-Allow-Origin: http://localhost:5173`
and `Access-Control-Allow-Credentials: true` from a live container. In a
real production deployment against actual AWS S3 (§19.3, DEPLOY-021),
configure this as genuine bucket-level CORS per BE-031's literal wording —
nothing in `StorageBackend` or `S3StorageBackend` needs to know or care
which mechanism is in effect on the server side; the interface is identical
either way.

### FR-003's "availability" filter is a hard constraint, not a client-facing parameter
FR-003 lists "availability" among the dimensions public browse/search MUST
filter by, alongside category/condition/price. Taken literally as a
client-supplied query parameter, this would be self-contradictory: FR-001
already restricts public browse to `status = available` unconditionally,
and FR-026 requires that a `sold` listing MUST NOT appear in public
browse/search results under any circumstance — so there is no second
status value a public "availability filter" could ever legitimately toggle
to. The endpoint table (§12.2) also lists no such query parameter. Read
this way, FR-003's "availability" is describing the *effect* GET
`/listings` already has (only available listings are ever returned), not a
fourth independent, client-controllable filter dimension the way
category/condition/price genuinely are. `ListingRepository.browse` (§DB
layer) implements this as an unconditional `WHERE status = 'available'`
baked into the query itself, with no corresponding parameter on
`ListingFilters` — deliberately not client-controllable, unlike the other
three filters, which the caller does control. If a future revision
introduces a genuine second public-facing status filter, this is the
single place (`ListingRepository.browse`, `ListingFilters`) that would
need to change.

### Image upload's "available-only" constraint extends FR-028 by interpretation, not by its letter
FR-028 says *editing* a `sold`/`deleted` listing MUST `409`. Image upload is
a distinct endpoint (`POST /listings/{id}/images`), not `PATCH
/listings/{id}`, so FR-028's text doesn't name it directly. `ListingService.
upload_images` applies the same `_require_available` check anyway, because
§8.3's user-flow narrative groups "content changes" together as a single
category ("`available` listings offer Edit, Mark as Sold, Delete"; a
`sold`/`deleted` listing offers none of those) and because allowing image
uploads onto a listing that's already sold or removed would be a strange,
unintended side door — a buyer-facing `sold`/`deleted` listing whose photos
keep changing after the fact serves no product purpose and isn't asked for
anywhere in §7 or §8. If a future revision has a concrete reason to allow
post-sale image edits (e.g., an admin correcting a listing after the fact),
that's a scoped, separate decision — not implied by anything here.

### Pitfall found and fixed: the `Listing.images` relationship broke DB-031's `ON DELETE CASCADE`
The single most significant bug this milestone, caught by a **pre-existing
Milestone 0 test** (`test_listing_image_cascades_on_listing_delete` in
`tests/test_schema.py`) that had nothing to do with Milestone 2's own new
test files — it simply started failing the moment this milestone's model
change landed, which is exactly what a good regression test is for.

Milestone 0 left `Listing`/`ListingImage` as bare FK columns with no
ORM-level `relationship()` between them (documented explicitly in Milestone
0's own commentary: "search/filter... logic is Milestone 2 work"). This
milestone added `Listing.images: Mapped[list["ListingImage"]] =
relationship(...)` so `ListingRepository` could `selectinload(Listing.
images)` and avoid an N+1 query when rendering a page of listings. That
relationship, once declared, changed SQLAlchemy's default behavior on
parent delete: with no `cascade` and no `passive_deletes` configured, the
ORM's unit-of-work takes it upon itself to manage the child rows before
deleting the parent — it emits `UPDATE listing_images SET listing_id = NULL
WHERE ...` ahead of the `DELETE FROM listings ...`, on the theory that this
is what "removing the association" means by default. `listing_id` is
`NOT NULL` (correctly, per the domain model — an image is meaningless
without its listing), so that `UPDATE` raised
`IntegrityError: null value in column "listing_id" violates not-null
constraint` — and, more importantly, it meant the DB-level `ON DELETE
CASCADE` that DB-031 actually specifies was never given the chance to fire
at all; the ORM was quietly trying to do the job itself, incorrectly.

This is moot in the application's own normal operation today — `Listing` is
never hard-deleted through the ORM, only soft-deleted (DB-020) — which is
exactly why it was easy to introduce without any Milestone 2 feature test
noticing: no Milestone 2 code path ever calls `session.delete(listing)`.
Only a direct, deliberate `session.delete()` (as the pre-existing schema
test does, to verify the DB constraint itself, independent of any
application-level soft-delete logic) exercises this path — but that's
precisely the scenario DB-031's `ON DELETE CASCADE` exists to document and
guarantee, for the case (a raw SQL delete, a future admin hard-delete
tool, a data-migration script) where it would.

**Fix**: added `passive_deletes=True` to the `images` relationship. This
tells SQLAlchemy to do nothing on the child side when the parent is
deleted and let Postgres's own `ON DELETE CASCADE` handle it — which is
what DB-031 specifies and what the pre-existing test asserts.

**Verification**: reran the previously-failing test in isolation (passed),
then the full suite in both fixed and `pytest-randomly` order, five
consecutive runs, all 163 tests green with no order-dependence. Ruff, Ruff
format, and mypy strict were re-run clean after the fix.

**Rule for Milestone 3+**: any new ORM-level `relationship()` added between
two models whose FK already carries `ON DELETE CASCADE`/`RESTRICT` at the
database level (DB-031) MUST also declare `passive_deletes=True` (for the
cascade side) at the same time the relationship is declared — not as an
afterthought once a test happens to catch it. The failure mode is silent
in every normal application code path (soft-delete-only modules never hit
it) and only surfaces via a direct `session.delete()`, so it will not be
caught by feature tests — only by a schema/constraint test that explicitly
exercises hard deletion, the way `test_schema.py` already does for every
FK relationship in this project. Before adding a new `relationship()` to
an existing FK, check whether the schema-test file already has (or needs)
a matching hard-delete assertion for that FK.

### Manual, live verification against real MinIO and a real running server
Beyond the automated suite (which fakes `StorageBackend` per-test — see
`test_listings_api.py`'s module docstring), the full image-upload path was
exercised against genuinely live infrastructure, not just faked
collaborators, before considering this milestone verifiable:
1. `docker compose up -d storage storage-init` — confirmed the bucket
   bootstrap step (`mc mb` + `mc anonymous set download`) succeeds exactly
   as the compose file's own comments describe, with no manual step beyond
   `docker compose up` (NFR-005).
2. Confirmed MinIO's CORS preflight response directly (see the BE-031
   section above).
3. Ran the API locally (`uvicorn`, real Postgres, real MinIO — not
   `TestClient`, not faked storage) and drove a full register → login →
   create listing → upload a real JPEG → fetch the returned image URL back
   over HTTP round-trip, confirming the image bytes and `Content-Type:
   image/jpeg` come back correctly from the *public* URL a browser would
   actually use.
4. Confirmed SEC-060's content-sniffing rejects a non-image file even when
   given a `.jpg` name and `image/jpeg` declared content type end-to-end
   (not just at the unit-test level).
5. Confirmed FR-006a/API-012 and FR-029's idempotent-delete-doesn't-bump-
   `updated_at` guarantee end-to-end over real HTTP, including that a
   second, no-op `DELETE` on an already-deleted listing leaves `updated_at`
   byte-for-byte unchanged.
6. Stopped the `storage` container and confirmed a live upload attempt
   correctly returns `503 SERVICE_UNAVAILABLE` in the API-010 envelope
   (NFR-007), then restarted `storage` and confirmed normal operation
   resumed.

This closes the gap the automated suite structurally cannot: `TestClient`
plus a faked `StorageBackend` can prove the service layer's logic is
correct, but it can never prove the real `S3StorageBackend` + MinIO + the
bucket's public-read policy + its CORS headers actually compose into
something a real browser could load an image from. Both layers were
verified independently, which is the same two-part verification discipline
Milestone 1 established for its own most significant bug (see that
milestone's entry above): unit/API tests prove the logic; a live
`docker compose` run proves the wiring.

### Known local-tooling limitation
The full four-service `docker compose up` (including `api` and `web`, which
publish host ports 8000 and 5173) could not be exercised in this
environment because those two host ports were already bound by an
unrelated project's containers running on this machine. Rather than
stopping another project's containers to force a full-stack `docker
compose up`, `db`, `storage`, and `storage-init` were brought up directly
(no port conflicts), and the API was run locally via the same virtualenv
pytest already uses (`uvicorn app.main:app`, pointed at the real
containerized Postgres and MinIO via the same environment variables
`docker-compose.yml` sets for the `api` service) to get equivalent,
genuine end-to-end coverage without touching unrelated infrastructure.
This is a local-environment constraint, not a gap in the application or
its Compose definition — the `api`/`web` service definitions themselves
were not modified and there is no reason to expect them to behave
differently than the equivalent manual invocation did.

## Milestone 3 — Profile management

### FR-015 enforced once, inside `get_current_user` itself — not as a second dependency on every router
FR-015 requires that an account flagged `must_change_password` be rejected
(`403 PASSWORD_CHANGE_REQUIRED`) on "any authenticated request other than
the password-change endpoint." The alternative considered was adding a
second dependency (e.g. `Depends(require_password_not_pending)`) alongside
`Depends(get_current_user)` on every existing and future protected route.
That would have meant touching every Milestone 2 listings endpoint (create,
update, delete, mark-sold, upload-images, my-listings) just to bolt on a
check that has nothing to do with any of their individual business logic,
and — worse — would depend on every *future* router remembering to add the
second dependency too, silently reopening the gap for anything that
forgets it.

Instead, the check was added directly inside `get_current_user`
(`app/modules/auth/dependencies.py`), the single dependency every one of
those endpoints (and `users`' own new router) already depends on for
identity. This makes FR-015 apply automatically, retroactively, to every
Milestone 1 and Milestone 2 endpoint with a one-function change and zero
changes to any other router — and it will apply automatically to Milestone
4's admin endpoints too, without anyone needing to remember to add
anything. The one endpoint that must remain reachable despite the flag
(`POST /users/me/password`) uses a second, near-identical dependency,
`get_current_user_for_password_change`, which shares the same
`_resolve_current_user` token-verification helper but skips the
`must_change_password` check — the inverse of the "touch every other
router" alternative: exactly one router touches the escape hatch, not
every router touching the gate.

### FR-015 does NOT apply to `get_current_user_optional`
`GET /listings/{id}` and `GET /listings` (Milestone 2) use
`get_current_user_optional`, which already treats every other form of auth
failure (missing header, malformed token, expired token) as "guest" rather
than hard-failing, because these are genuinely public endpoints that merely
behave differently for a recognized requester (FR-006a). `must_change_password`
was deliberately **not** added to that dependency's checks. Reasoning: FR-015's
intent, read in context of §8.5's account-recovery flow, is to stop a
locked-account user from *acting* as an authenticated user elsewhere in the
system before they've regained a real password — not to make already-public
content less available to them than it is to an anonymous stranger. A
public listing page has no mutating capability regardless of who's viewing
it; forcing it to 403 for a `must_change_password` account would be strictly
worse UX than what a guest sees, for a page FR-015 was never written to
protect. If a future revision decides the gate should be maximally literal
instead, the change is confined to `get_current_user_optional` and does not
touch anything else — but that was not the call made here, and the
reasoning is recorded so it's a considered decision, not an oversight.
Verified directly (not just asserted in a docstring):
`test_users_api.py::TestForcedPasswordChangeFlow::test_public_listing_detail_is_not_blocked_by_a_pending_password_change`.

### `current_password` verification failure is `ValidationFailedError` (422), not `InvalidCredentialsError` (401)
`AuthService.login`'s `InvalidCredentialsError` (Milestone 1) exists
specifically to resist account enumeration for an **unauthenticated**
caller — it's deliberately vague about which of email/password was wrong,
because revealing that distinguishes "this email exists" from "this email
doesn't." `UserService.change_password`'s caller is already authenticated
(they hold a valid access token, verified by `get_current_user_for_password_change`
before the service is ever called) — there is no enumeration risk left to
protect against, and a generic, evasive error message would only make a
legitimate, already-authenticated user's own mistake harder to fix. Reusing
`ValidationFailedError` with `fields={"current_password": [...]}` was
chosen instead — the same class Milestone 1's duplicate-email registration
case already uses, matching that class's own documented purpose ("a
request is well-formed but fails a business-rule validation... against
existing state") and giving the client a field-level error it can attach
directly to the right form input (FE-021, when the frontend arrives in
Milestone 5).

### Module ownership of `GET /users/me/listings/summary`: listings, not users
FR-032 ("a summary of their own listings' counts by status") has no
endpoint path specified in §12.2's endpoint table — it's described only as
a capability, not wired to a concrete route. The path chosen,
`GET /users/me/listings/summary`, and its module placement (inside
`app/modules/listings/router.py`'s existing `my_listings_router`, not a new
route in `users/router.py`) follow the precedent Milestone 2 already
established for `GET /users/me/listings`: "module ownership follows the
resource being returned (listings), not the URL prefix." The underlying
query (`ListingRepository.count_by_owner_status`, a single `GROUP BY`
rather than three separate `COUNT(*)` calls or fetching every row and
counting in Python) is listings' data and listings' repository/service
layers; `users`' own router only ever handles identity/profile data
(display name, password), so extending it to also own a listings-derived
statistic would have split one FR's implementation across two modules'
repository layers for no benefit — the same reasoning Milestone 2 already
gave for the sibling endpoint.

### `ListingStatusSummary` uses three explicit fields, not a `dict[str, int]`
Considered and rejected: returning the raw grouped-count dict directly as a
`dict[ListingCategoryEnum, int]`-shaped JSON object. Pydantic can serialize
that shape, but it would mean the OpenAPI schema (API-021, which the
frontend's generated types depend on) documents this endpoint's response as
an open-ended mapping rather than a fixed, self-documenting shape a
frontend developer can autocomplete against. Three status values that
change "on the order of never" (the same phrase §10.4 already uses to
justify a fixed category enum over a `Category` table) don't need that
flexibility — `ListingStatusSummary(available: int, sold: int, deleted: int)`
was chosen instead, consistent with the fixed-enum philosophy already
established for `category`/`condition`/`status` itself.

### `UserService`'s Milestone 3 tests touch a real `Session` but never persist
`UserService`'s constructor (Milestone 1's design) takes a concrete
`Session` and builds its own `UserRepository(db)` internally — unlike
`AuthService`/`ListingService`, it has no `Protocol`-typed collaborator a
test could substitute with an in-memory fake. Rather than treat this as
grounds to refactor `UserService`'s constructor into the same
dependency-injected shape as the other two services (an architecture
change to `users`, not something Milestone 3 was asked to do, and Milestone
1's `UserService` was already a settled, working piece of the codebase this
milestone was told not to redesign without a genuine bug to justify it),
`test_users_service.py`'s tests construct a plain, never-`db_session.add()`-ed
`User` object (exactly the pattern `test_auth_service.py`'s own `_make_user`
helper already uses) and pass it through `UserService.change_password`. The
repository's `self._db.flush()` call underneath is a no-op against an
object the session was never asked to track, so what's actually exercised
is the business logic (Argon2 verification pass/fail, which field gets
mutated, whether `must_change_password` clears) — real, round-trip
persistence of the same two repository methods is covered separately, and
explicitly, in `test_users_repository.py` (TEST-002) against the real,
migrated Postgres schema. This is not a workaround so much as a documented
acknowledgment: `UserService` doesn't offer the DI seam the other two
services do, and the honest way to test it without a real database is to
avoid ever handing the session anything to persist, not to pretend a fake
repository exists where none does.

### Verification performed
Ruff, Ruff format, and mypy strict (`app alembic tests`) all clean.
`alembic revision --autogenerate` produced an empty diff (no new migration
— every column Milestone 3 reads or writes already existed on `User` since
`0001_initial_schema`); the throwaway verification migration was deleted
afterward, matching the same discipline established in Milestone 2's
review. Full pytest suite: 197 tests passing (up from Milestone 2's 163),
98% overall coverage, **100%** on every Milestone 3 file that has
meaningful logic to cover (`users/repository.py`, `users/service.py`,
`users/router.py`, `users/schemas.py`, and the three `listings` files
Milestone 3 touched) — comfortably over TEST-004's 85% floor. Ran the full
suite 5 additional times under `pytest-randomly`'s default randomized
ordering (TEST-002) with no order-dependent failures.

Beyond the automated suite, this milestone's most security-relevant
behavior — the forced-password-change gate — was verified live against a
genuinely running system, not just `TestClient`: this was also the first
milestone review where the host ports that blocked a full `docker compose up`
during the Milestone 2 review were free, so a real four-service stack
(`api`, `web`, `db`, `storage`) was brought up end-to-end via
`docker compose up -d --build`, confirming NFR-005 ("fully runnable locally
via a single `docker compose up` with no manual post-steps beyond running
migrations") directly rather than by inference from the Compose file's
contents. Against that live stack: registered and logged in a real user;
confirmed `GET`/`PATCH /users/me` and `GET /users/me/listings/summary` all
work over real HTTP; flipped `must_change_password` directly in the live
database (simulating what FR-045's admin-assisted reset will produce once
Milestone 4 implements it — there is no admin endpoint yet to trigger this
through the API); confirmed login still succeeds normally with the flag
set; confirmed `GET /users/me` and `POST /listings` (a different module
entirely) both correctly `403 PASSWORD_CHANGE_REQUIRED`; confirmed a wrong
current/temporary password on the change-password endpoint itself
correctly `422`s and leaves the account still blocked; confirmed the
correct current password produces a `204` and clears the block; and
confirmed the **same, already-issued access token** — no re-login, no
token refresh — is accepted immediately afterward, proving FR-015's "no
new token type" claim end-to-end rather than only at the unit-test level.
Cleaned up the live test data from the shared dev database afterward (the
same discipline established during Milestone 2's review, after that
review's own smoke-testing briefly polluted two repository tests).

### Bugs found
None discovered in Milestone 1 or Milestone 2 behavior during this
milestone's work. `get_current_user` was deliberately modified (to add the
FR-015 gate), but this is new, intentional behavior specified by the SRS
for Milestone 3 — not a fix to something that was wrong in Milestones 1–2,
which had no `must_change_password`-bearing accounts to gate against yet
(the flag existed on the `User` model since Milestone 0 but nothing set it
to `True` until Milestone 4's admin-assisted reset, which doesn't exist
yet — this milestone's tests simulate that future state by writing the
flag directly, exactly as this section's live-verification notes above
describe).

### Known limitation carried forward
FR-015's full, real-world trigger (FR-045: an admin-assisted password
reset) is Milestone 4 scope, not yet implemented. Every Milestone 3 test
that exercises the forced-password-change gate (both automated and the
live verification above) sets `must_change_password = true` directly
against the database, standing in for what FR-045's endpoint will do once
it exists. This is not a gap in Milestone 3's own scope — FR-015 is fully
implemented and independently verifiable without FR-045 existing yet,
exactly as the SRS's milestone plan intends (Milestone 3 owns FR-015;
Milestone 4 owns FR-045) — but it is worth flagging that the *complete*
end-to-end product flow (§8.5) can only be demonstrated in full once
Milestone 4 lands.

### Final pre-freeze audit (before Milestone 4 begins)
A dedicated audit pass — SRS compliance, architecture/layering, dead code,
unused imports, duplicate logic, naming, test/documentation/verification
gaps, security, error-handling and API consistency, migration drift —
across the whole repository, not just Milestone 3's own new files. Six
findings, all fixed; each is a correction to something already written
during this milestone (or, in one case, a longstanding gap from Milestone
1), not new scope.

1. **`UserService.change_password` returned `User`, but nothing ever used
   it** (`POST /users/me/password` responds `204 No Content`). Every other
   service method whose caller doesn't need the result returns `None`
   instead (`AuthService.logout`, `ListingService.delete`) — the repository
   layer still returns the mutated row either way (`UserRepository.set_password`
   unchanged), only the service layer's contract changed, matching that
   established split. Fixed by changing the return type to `None`.

2. **Untested claim**: this document and `get_current_user`'s own docstring
   both asserted that FR-015's gate applies to `auth`'s `logout` endpoint
   too (since it also depends on `get_current_user`), but no test actually
   exercised that path — every forced-password-change test up to this
   point only checked `users`' own endpoints and one `listings` endpoint.
   Added `test_logout_is_also_blocked_pending_a_forced_password_change` to
   close the gap between what was claimed and what was verified.

3. **Duplicate logic + inconsistent naming across three test files**:
   `test_auth_api.py`, `test_listings_api.py`, and `test_users_api.py` had
   each independently written the same "register a new account, log in,
   return the access token" setup step, under three different names
   (`_registered_and_logged_in`, and two separately-written copies of
   `_register_and_login`) with no behavioral difference between them —
   the exact kind of drift duplicated test infrastructure invites over
   time. Consolidated into a single `register_and_login` helper in
   `conftest.py`, imported by all three files; the three local copies (and
   the now-unused local path/password constants that existed only to
   support them) were deleted. This is a test-infrastructure-only change —
   it does not alter what any existing test asserts or exercises, verified
   by rerunning the full suite (fixed order, then 5x randomized) with an
   unchanged pass count plus the one new test from finding 2.

4. **TEST-004's coverage gate was never actually enforced in CI** — a gap
   present since Milestone 1 (noted but deliberately not fixed during the
   Milestone 2 review, since it predated that milestone's own scope). "85%
   line coverage on the services and repositories layers... enforced in
   CI" is an explicit, numbered SRS requirement, not implemented despite
   three milestones of `services`/`repositories` code now existing to
   enforce it against. Fixed by adding a CI step —
   `coverage report --include="app/modules/*/service.py,app/modules/*/repository.py" --fail-under=85`
   — to `.github/workflows/ci.yml`'s `backend-tests` job, run immediately
   after `pytest` against the coverage data that step already produces.
   The `--include` glob deliberately targets literal `service.py`/`repository.py`
   files inside any `app/modules/*/` package — precisely TEST-004's stated
   scope — rather than gating on overall project coverage (which routers,
   schemas, and `app/core` would also count toward, contrary to TEST-004's
   explicit "coverage on routers/schemas is a by-product, not a target to
   chase"). Verified locally before wiring into CI: currently 100% across
   all six matched files (`auth`, `listings`, `users` × `service.py`/`repository.py`),
   comfortably clears the 85% floor.

5. **Documentation drift**: `listings/router.py`'s module docstring still
   described `my_listings_router` as carrying "the one endpoint" placed
   under `/users/me/listings` — true when Milestone 2 wrote it, false
   since this milestone added `GET /users/me/listings/summary` to the same
   router. Updated to describe both endpoints and both milestones.

6. **Reviewed and deliberately left unchanged** (documented here so the
   decision is visible, not silently skipped): `UserRepository.get_by_email`/
   `get_by_id` still use SQLAlchemy's legacy `Session.query()` API
   (Milestone 1), while every repository method added since (Milestone 2's
   `ListingRepository`, this milestone's own `UserRepository.update_display_name`/
   `set_password`) uses the 2.0-style `select()` construct. This is a
   style inconsistency, not a bug — `.query()` remains fully supported in
   SQLAlchemy 2.0 and behaves identically here — and rewriting working
   Milestone 1 code for style alone, with no defect to justify it, is
   exactly the kind of unscoped change this project's own instructions ask
   an implementer to avoid. Flagged for a future contributor rather than
   changed. Likewise reviewed and left as-is: `PasswordChangeRequest.new_password`
   duplicates `RegisterRequest.password`'s exact `Field(min_length=10,
   max_length=256)` constraint across two modules rather than sharing one
   constant — a small, two-line duplication the codebase already tolerates
   elsewhere (`listings/schemas.py`'s `_PriceField` vs. `ListingUpdate.price`'s
   own separately-written equivalent), consistent with this project's
   stated preference for small duplication over premature cross-module
   coupling.

Verification after all six fixes: Ruff, Ruff format, and mypy strict clean;
full suite green at 198 tests (up from 197 before this audit) across a
fixed-order run and 5 further randomized-order runs; the new CI coverage
gate passes locally at 100% against its scoped file set; `alembic
revision --autogenerate` re-confirmed an empty diff (no model changed
during this audit); the live `docker compose` stack brought up earlier in
this milestone was re-checked healthy (`GET /api/v1/health` still `ok`,
zero leftover rows in `users`/`listings` from any prior smoke test).
