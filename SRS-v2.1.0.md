# Software Requirements Specification
## Punah-Pustak V2 — Pre-Owned Book Marketplace

**Document status:** Approved for implementation, pending Milestone 0 kickoff
**Version:** 2.1.0
**Author:** Engineering (Architecture Review Draft)
**Scope of rebuild:** Full re-architecture and re-implementation of the original Punah-Pustak. Product concept is unchanged; this document governs the implementation only.

---

## Revision History

| Version | Summary |
|---|---|
| 2.0.0 | Initial SRS. |
| 2.1.0 | Targeted revision following a formal design review. Fixes one real contradiction (owner visibility of deleted listings), closes two genuine gaps (account recovery, CORS/deployment model), commits to a single JWT signing algorithm, specifies refresh-token rotation/revocation and reconciles it with suspension semantics, adds a formal health endpoint, clarifies image-upload atomicity, specifies integration-test isolation, and folds in a set of small correctness fixes identified in review (indexing, idempotency, error-envelope handling, E2E/accessibility test coverage, migration and backup posture). **No architectural change, no new features beyond an admin-assisted password reset.** See inline "Changed in 2.1.0" markers throughout. |

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the complete functional and non-functional requirements for Punah-Pustak V2, a web application that lets individuals list, browse, and acquire pre-owned books directly from one another. It is written to be implementable without further product clarification — where the original assignment left ambiguity, this document makes and justifies a decision rather than leaving it open.

### 1.2 Intended audience
Engineers implementing the system, reviewers evaluating the portfolio submission, and any future maintainer picking up the codebase without prior context.

### 1.3 Document conventions
- **MUST** — mandatory requirement, non-negotiable for v2.1.
- **SHOULD** — strongly recommended; deviation must be justified in an ADR (Architecture Decision Record).
- **MAY** — optional, left to implementer discretion.
- Requirement IDs follow the pattern `<AREA>-<NUMBER>` (e.g., `FR-014`, `SEC-003`) for traceability into tests and tickets. IDs are stable across revisions — 2.1.0 adds new IDs within existing numeric blocks rather than renumbering existing ones, so prior traceability (tickets, tests, ADRs) referencing 2.0.0 IDs remains valid.

### 1.4 Why a rebuild, not a rewrite of features
The original project's *scope* was sound for the problem it solves — a peer-to-peer book marketplace does not need more features to be a good product. What it needs is a proper architecture: separation of concerns, a real data model, authentication that isn't an afterthought, tests, and a deployable, reproducible environment. V2 changes *how* the product is built, not *what* it does. Any request to add scope during implementation (wishlists, chat, payments, notifications) should be treated as out of contract for this version and redirected to a future SRS revision.

---

## 2. Project Overview

Punah-Pustak V2 is a two-sided marketplace (sellers and buyers, with substantial overlap between the two) for used books. Sellers create listings with a title, description, condition, price, category, and photos. Buyers browse, search, and filter listings, and contact arrangements for exchange happen **outside the system** (this is explicitly out of scope — see Non-Goals). The system's job is discovery and listing management, not transaction execution.

The system is composed of:
- A **REST API backend** (FastAPI) that owns all business logic and data access.
- A **single-page frontend** (React + TypeScript) that consumes the API.
- A **relational database** (PostgreSQL) as the single source of truth.
- **Object storage** for listing images, decoupled from the database.

No other services are required. This is a deliberate constraint, not an oversight — see §3 and §4.

---

## 3. Goals

| ID | Goal |
|---|---|
| G-1 | Provide a reliable, correctly-modeled marketplace for listing and discovering used books. |
| G-2 | Demonstrate production-grade engineering: layered architecture, typed code end-to-end, automated tests, CI, containerized deployment. |
| G-3 | Keep the operational footprint small enough to run on a single small VM or a free-tier cloud service. |
| G-4 | Make the codebase approachable: a new engineer should be able to trace a request from route to database in under 15 minutes of reading. |
| G-5 | Ship an accessible, responsive UI usable with keyboard and screen reader. |
| G-6 | Provide a minimal, honest admin surface for moderation — not an analytics dashboard. |

---

## 4. Non-Goals

Explicitly **not** part of this system, and any implementer proposing them should be pushed back on:

| ID | Non-goal | Why it's excluded |
|---|---|---|
| NG-1 | Payments / escrow | Turns this into a fintech product with PCI, fraud, and dispute-resolution obligations utterly disproportionate to the stated scope. |
| NG-2 | In-app chat/messaging | Real-time infrastructure (websockets, message persistence, moderation) for a feature that email/phone already solves outside the app. |
| NG-3 | Shipping/logistics integration | No transaction layer exists to attach shipping to. |
| NG-4 | Notifications (email/push) | Requires a mail/push provider, templating, and delivery-failure handling for marginal value at this scope; also a dependency the portfolio project shouldn't need to demonstrate reliability for. |
| NG-5 | Recommendations / ML | No behavioral data pipeline exists or is justified; premature complexity. |
| NG-6 | Social features (follows, comments, ratings) | Expands moderation surface and data model without serving the core discovery task. |
| NG-7 | Wishlist | Explicitly deferred; trivial to add later as an additive feature (a join table + two endpoints) once the core is stable — not worth entangling with V2. |
| NG-8 | Multi-currency / internationalization of pricing | Single currency, single locale is assumed (configurable via one setting, not built as a feature). |
| NG-9 | Self-service email verification / email-based password reset | **(Changed in 2.1.0 — clarified, not reversed.)** Building self-service reset requires the notification infrastructure explicitly excluded in NG-4, and is still out of scope. However, review of 2.0.0 identified that having *no* account-recovery path at all is a genuine gap, not an acceptable trade-off — a locked-out user had no way back into their account. 2.1.0 closes this with a **manual, administrator-assisted reset** (FR-045, §7.5) that requires no email infrastructure and reuses the existing admin surface. Self-service (email-driven) reset remains deferred and would need its own scoped revision. |

If a future version needs any of the excluded items above, it should get its own SRS section and its own milestone — bolting them onto V2 mid-build is exactly the feature creep this document exists to prevent.

---

## 5. Stakeholders

| Stakeholder | Interest |
|---|---|
| Buyers (public/authenticated) | Fast, accurate discovery of books; trustworthy listing data. |
| Sellers (authenticated users) | Easy listing creation/management; control over their own content. |
| Administrators | Ability to remove abusive/fraudulent content, manage problem accounts, and assist locked-out users with minimal tooling overhead. |
| Engineering reviewer (portfolio audience) | Evidence of sound architecture, testing discipline, and restraint in scope. |
| Future maintainer | A codebase they can safely extend without archaeology. |

---

## 6. User Roles

| Role | Description | Authentication |
|---|---|---|
| **Guest** | Unauthenticated visitor. | None |
| **User** | Registered account holder; can list, edit, delete, and mark their own books sold. | JWT access token + rotating refresh token |
| **Admin** | Elevated role for moderation. A superset of User privileges plus user/listing management and account-recovery assistance. | JWT access token + rotating refresh token, with `role=admin` claim |

There is no "seller" vs "buyer" role distinction — every authenticated user can act as both, which matches the peer-to-peer nature of the product. Introducing separate seller/buyer roles would be unjustified complexity: the only thing that differs is *which listings a user is permitted to mutate*, which is an ownership check, not a role.

---

## 7. Functional Requirements

### 7.1 Public (Guest) capabilities
- **FR-001**: The system MUST allow any visitor to browse a paginated list of listings with status `available`.
- **FR-002**: The system MUST allow full-text search over listing title and author.
- **FR-003**: The system MUST allow filtering by category, condition, price range, and availability.
- **FR-004**: The system MUST allow combining search and filters in a single query.
- **FR-005**: The system MUST allow any visitor to view a single listing's full detail page, including all images, description, price, condition, category, seller display name, and posted date, **subject to the visibility rule in FR-006a**.
- **FR-006**: The system MUST NOT expose seller contact information (email, phone) on public listing views. (Out-of-band contact is the user's responsibility — the system is a directory, not a broker.)
- **FR-006a** *(new in 2.1.0 — resolves the 2.0.0 contradiction between FR-025 and UC-3)*: `GET` on a single listing MUST return `404 Not Found` when that listing's status is `deleted`, **unless** the requester is the listing's owner or an admin, in which case the listing MUST be returned regardless of status. This is the single authoritative visibility rule for listing detail retrieval; §9 (UC-3) and §12 (API-012) restate it for traceability but do not redefine it.

### 7.2 Authentication
- **FR-010**: The system MUST allow a visitor to register with email, password, and display name.
- **FR-011**: The system MUST enforce a minimum password policy (see §15.2).
- **FR-012**: The system MUST allow a registered user to log in and receive an access token and refresh token.
- **FR-013**: The system MUST allow a logged-in user to log out, revoking their current refresh token (see §15.3 for the full revocation model).
- **FR-014**: The system MUST reject duplicate registration on the same email (case-insensitive).
- **FR-015** *(new in 2.1.0)*: If a user's account is flagged `must_change_password` (see FR-045 and §10.1), the system MUST require that user to set a new password immediately after a successful login before permitting any other authenticated action. The backend MUST reject (`403`, error code `PASSWORD_CHANGE_REQUIRED`) any authenticated request other than the password-change endpoint while this flag is set. This requires no new token type — it is a per-request check against the flag, not a scoped token.

### 7.3 Listing management (authenticated)
- **FR-020**: The system MUST allow an authenticated user to create a listing with: title, author, description, category, condition, price, and 1–6 images.
- **FR-021**: The system MUST allow a user to edit only their own listings, **and only while that listing's status is `available`** (see FR-028).
- **FR-022**: The system MUST allow a user to delete only their own listings.
- **FR-023**: The system MUST allow a user to mark only their own listings as `sold`.
- **FR-024**: The system MUST prevent editing or deleting a listing that does not belong to the requesting user, returning `403 Forbidden`.
- **FR-025**: The system MUST allow a user to view a "My Listings" page showing **all** of their listings regardless of status (`available`, `sold`, `deleted`). This is unaffected by FR-006a: the owner-visibility exception in FR-006a is precisely what makes FR-025 consistent — the owner's list view and the owner's detail view now agree.
- **FR-026**: A listing marked `sold` MUST remain visible on the seller's "My Listings" page but MUST NOT appear in public browse/search results.
- **FR-027**: Deleting a listing MUST be a **soft delete** (status transition to `deleted`), not a row removal (see §11.4 for rationale).
- **FR-028** *(new in 2.1.0)*: Attempting to edit a listing whose status is `sold` or `deleted` MUST return `409 Conflict`. Editing is only a valid operation on an `available` listing.
- **FR-029** *(new in 2.1.0)*: Deleting a listing whose status is already `deleted` MUST be idempotent: the endpoint MUST return `204 No Content` without error, without modifying `updated_at`, and without creating a duplicate admin audit entry when performed by an admin.

### 7.4 Profile management
- **FR-030**: The system MUST allow a user to view and edit their display name.
- **FR-031**: The system MUST allow a user to change their password (requiring current password confirmation), **except when acting under the forced-change flow in FR-015, where current-password confirmation is replaced by the temporary password issued via FR-045**.
- **FR-032**: The system MUST allow a user to view a summary of their own listings' counts by status.
- **FR-033**: The system MUST NOT allow a user to change their own email in V2 (email is the login identifier and treated as immutable to avoid building an email-change verification flow, which is out of scope per NG-9). If this is required later, it needs its own verification design.

### 7.5 Administration
- **FR-040**: An admin MUST be able to list all users with basic metadata (email, display name, created date, status).
- **FR-041**: An admin MUST be able to suspend/reinstate a user account. A suspended user cannot log in or have their listings shown publicly. (See §15.4a for the precise timing semantics of suspension relative to already-issued tokens.)
- **FR-042**: An admin MUST be able to remove (soft-delete) any listing, with a required reason code stored for audit purposes.
- **FR-043**: An admin MUST be able to view any listing regardless of status.
- **FR-044**: The system MUST NOT provide analytics dashboards, revenue reports, or usage graphs — this is explicitly out of scope (see §4). Admin functionality is moderation only.
- **FR-045** *(new in 2.1.0 — closes the account-recovery gap identified in review, per NG-9)*: An admin MUST be able to trigger a password reset for any non-admin user account. This action MUST generate a new, random temporary password, set it on the account (hashed, per §15.2), set `must_change_password = true`, and return the temporary password **once**, in the API response to the admin, for the admin to relay to the user out-of-band (matching the product's existing off-platform-contact model — see §2). The system MUST NOT email the temporary password to anyone. This action MUST be recorded in `AdminAction` (§10.1).

---

## 8. User Flows

### 8.1 Guest discovers and views a listing
1. Guest lands on home/browse page → sees paginated available listings.
2. Guest enters a search term and/or applies filters → result set updates.
3. Guest clicks a listing → detail page loads (public rules of FR-006a apply: a `deleted` listing is a 404 to a guest).
4. Guest is prompted to register/log in only if they attempt a mutating action (there is none available to a guest, so this flow terminates here by design — contact happens off-platform).

### 8.2 Registration and first listing
1. Visitor registers → account created, redirected to login (not auto-logged-in, to keep auth flow single-path and testable).
2. User logs in → tokens issued, redirected to home.
3. User navigates to "Create Listing" → fills form, uploads images.
4. On submit, listing is created with status `available` and appears in "My Listings" and public browse immediately.

### 8.3 Edit / sell / delete
1. User opens "My Listings" — sees every listing they own, regardless of status (FR-025).
2. User selects a listing → available actions depend on its status: `available` listings offer Edit, Mark as Sold, Delete; `sold`/`deleted` listings offer only Delete (delete is idempotent per FR-029) and view-only detail (accessible to the owner per FR-006a even once deleted).
3. Edit → form pre-filled, submits diff, listing `updated_at` refreshed. Blocked with `409` if status is not `available` (FR-028) — the UI does not offer Edit in that state, but the API enforces it regardless of what the client sends.
4. Mark as Sold → confirmation prompt → status transitions to `sold`, removed from public results.
5. Delete → confirmation prompt (destructive-action pattern, see §13.5) → status transitions to `deleted`. The listing remains visible to its owner (My Listings and detail view) but disappears from public browse/search and returns `404` to any other non-admin visitor.

### 8.4 Admin moderation
1. Admin logs in (same login endpoint; role is server-determined, not user-selected).
2. Admin opens Admin > Listings, filters by any status.
3. Admin removes a listing → must select a reason → listing soft-deleted, action recorded in audit log.
4. Admin opens Admin > Users, suspends an abusive account → user's active refresh tokens are revoked immediately, preventing further token refresh or re-login; the user's already-issued access token remains valid only until it naturally expires (see §15.4a — within 15 minutes). The suspended user's listings are hidden from public view (via the `is_active` join) but not deleted.

### 8.5 Account recovery *(new in 2.1.0)*
1. A user who has forgotten their password contacts an admin out-of-platform (the same channel already used for buyer/seller contact — no in-app mechanism is introduced).
2. Admin verifies the requester's identity by whatever out-of-band means they judge sufficient (this is a manual, human judgment call, not a system-enforced identity check — appropriate for this product's risk profile).
3. Admin triggers FR-045 → system returns a temporary password to the admin.
4. Admin relays the temporary password to the user out-of-band.
5. User logs in with the temporary password → FR-015 forces an immediate password change before any other action is permitted.

---

## 9. Use Cases

### UC-1: Search for a book
- **Actor:** Guest or User
- **Precondition:** None
- **Main flow:** Actor submits a query string and optional filters → system returns matching `available` listings ranked by relevance, paginated.
- **Postcondition:** Result set displayed; no state mutation.
- **Alternate flow:** No results → system returns an empty result set with a `200 OK` and an explicit empty-state signal (not an error).

### UC-2: Create a listing
- **Actor:** User
- **Precondition:** Authenticated, account not suspended.
- **Main flow:** User submits listing form → server validates fields and images → listing persisted with status `available`, owner set to current user.
- **Postcondition:** Listing visible in browse and "My Listings."
- **Exception flow:** Validation failure (e.g., price ≤ 0, missing title) → `422` with field-level errors, delivered in the standard error envelope (API-010, API-013).

### UC-3: Edit a listing *(corrected in 2.1.0 — this use case previously contradicted FR-025; see Revision History)*
- **Actor:** User (owner)
- **Precondition:** Listing exists, status is `available`, requester is the owner.
- **Main flow:** User submits changed fields → server re-validates → listing updated.
- **Exception flow:** Requester is not owner → `403`. Listing status is `sold` or `deleted` → `409` (FR-028) — **not** `404`; the listing still exists and is still visible to its owner, it is simply not in an editable state. `404` for a `deleted` listing is reserved for requesters who are neither the owner nor an admin (FR-006a), and never applies to the owner's own view of their own listing.

### UC-4: Mark listing as sold
- **Actor:** User (owner)
- **Precondition:** Listing status is `available`.
- **Main flow:** Owner marks sold → status → `sold`, `sold_at` timestamp set.
- **Exception flow:** Listing already `sold` or `deleted` → `409 Conflict`.

### UC-5: Delete a listing
- **Actor:** User (owner) or Admin
- **Main flow:** Actor requests delete → status → `deleted`; row retained.
- **Alternate flow:** Listing is already `deleted` → idempotent `204` (FR-029), no duplicate audit entry.
- **Note:** Admin deletion additionally requires `reason_code` and produces an audit log entry (see §15.7).

### UC-6: Suspend a user *(clarified in 2.1.0 — removed the unqualified "immediately" claim; see §15.4a)*
- **Actor:** Admin
- **Precondition:** Target user is not already suspended, target is not an admin (admins cannot suspend other admins via this endpoint — prevents privilege-escalation footguns; would require a separate super-admin tier that is out of scope).
- **Main flow:** Admin suspends target → target's refresh tokens are revoked immediately (target cannot obtain a new access token or log in again from this point forward).
- **Postcondition:** Target cannot authenticate going forward; target's listings are excluded from public browse (filtered via `User.is_active`, not by mutating each listing). Any access token the target already holds remains technically valid until its own expiry, bounded to ≤15 minutes (§15.4a) — this bound is a documented, accepted trade-off, not an oversight.

### UC-7: Admin-assisted password reset *(new in 2.1.0)*
- **Actor:** Admin
- **Precondition:** Target user exists and is not an admin.
- **Main flow:** Admin triggers reset (FR-045) → system generates and hashes a temporary password, sets `must_change_password = true`, returns the plaintext temporary password once in the response.
- **Postcondition:** `AdminAction` record created. Target user's next successful login is immediately followed by a forced password-change flow (FR-015) before any other action is permitted.
- **Exception flow:** Target is an admin → `403` (admin-to-admin reset is not supported in v2.1.0, consistent with UC-6's admin-to-admin restriction).

---

## 10. Domain Model

### 10.1 Entities

**User**
- `id` (UUID, PK)
- `email` (**citext**, unique) — *(changed in 2.1.0: 2.0.0 left "citext or lowercased" as an open choice; committed to `citext` to eliminate an entire class of case-sensitivity bugs)*
- `password_hash`
- `display_name`
- `role` (enum: `user`, `admin`)
- `is_active` (bool, default true) — false = suspended
- `must_change_password` (bool, default false) *(new in 2.1.0 — supports FR-015/FR-045)*
- `created_at`, `updated_at`

**Listing**
- `id` (UUID, PK)
- `owner_id` (FK → User)
- `title`
- `author`
- `description`
- `category` (enum, fixed list — see §10.3)
- `condition` (enum: `new`, `like_new`, `good`, `fair`, `poor`)
- `price` (numeric(10,2), > 0)
- `status` (enum: `available`, `sold`, `deleted`)
- `sold_at` (nullable timestamp)
- `created_at`, `updated_at`
- `search_vector` (tsvector, generated column — see §11.3)

**ListingImage**
- `id` (UUID, PK)
- `listing_id` (FK → Listing)
- `object_key` (path/key in object storage)
- `position` (smallint, ordering 0–5)
- `created_at`

**RefreshToken** *(new in 2.1.0 — required to make the rotation/revocation model in §15.3 concrete rather than implied)*
- `id` (UUID, PK)
- `user_id` (FK → User)
- `token_hash` (the opaque token is never stored in plaintext)
- `family_id` (UUID) — shared by every token descended from one login, enabling family-wide revocation on reuse detection (§15.3)
- `revoked` (bool, default false)
- `expires_at` (timestamptz)
- `created_at`

**AdminAction** (audit log — minimal, append-only)
- `id` (UUID, PK)
- `admin_id` (FK → User)
- `action_type` (enum: `remove_listing`, `suspend_user`, `reinstate_user`, `reset_password`) *(added `reset_password` in 2.1.0 for FR-045/UC-7)*
- `target_type` (enum: `listing`, `user`)
- `target_id` (UUID)
- `reason_code` (string, required for `remove_listing` and `suspend_user`; not applicable to `reset_password`, which is inherently user-initiated-via-admin rather than punitive)
- `created_at`

### 10.2 Relationships
- One `User` has many `Listing` (1:N).
- One `Listing` has 1–6 `ListingImage` (1:N, bounded — enforced at application layer, not DB constraint, since DB-level "between 1 and 6 rows" constraints require triggers that add more complexity than they're worth here).
- One `User` has many `RefreshToken` (1:N); a `family_id` groups the chain produced by a single login session.
- `AdminAction` references `User` (the admin) and polymorphically a target — kept as two plain columns rather than a generic `EAV`/polymorphic FK pattern, because there are only two target types and premature polymorphism here would hurt referential integrity for no real gain.

### 10.3 Fixed category list (v2.1)
To keep filtering deterministic and avoid a free-text taxonomy nobody moderates: `fiction`, `non_fiction`, `academic_textbook`, `children`, `comics_graphic_novels`, `other`. Stored as a Postgres enum. Adding a category is a migration, not a feature — this is an intentional constraint, not a limitation to "fix" later with a tags system unless a real need is demonstrated.

### 10.4 Why no `Category` table
A separate `Category` table (with its own CRUD, admin UI, and referential integrity concerns) would be over-engineering for six fixed values that change on the order of "never." A Postgres enum (or a `CHECK` constraint, if enum migration friction becomes an issue) is the right-sized solution. If categories genuinely need to be admin-editable at runtime in the future, that's a clearly scoped follow-up, not a default.

---

## 11. Database Requirements

### 11.1 Engine
PostgreSQL 16+. Chosen over MySQL/SQLite for native `tsvector` full-text search (avoids standing up Elasticsearch — see §11.3), solid `enum`/`numeric` types, native `citext` support (§10.1), and because it's the de facto default for this stack; SQLite is unsuitable beyond local dev due to lack of concurrent-write robustness needed even at small scale.

### 11.2 Schema management
- **DB-001**: All schema changes MUST go through Alembic migrations. Hand-edited schema in any environment beyond a developer's throwaway sandbox is prohibited.
- **DB-002**: Every migration MUST have a corresponding downgrade path, even if it's a documented no-op with a comment explaining why (e.g., destructive data changes).
- **DB-003**: SQLAlchemy 2.0 models MUST use typed declarative mappings (`Mapped[...]`, `mapped_column`) — not the legacy `Column`-only style — to get mypy coverage on the ORM layer.
- **DB-004** *(new in 2.1.0)*: The `citext` extension MUST be enabled via migration (`CREATE EXTENSION IF NOT EXISTS citext;`) before the `User.email` column is created.

### 11.3 Search
- **DB-010**: Full-text search MUST use a PostgreSQL generated `tsvector` column over `title` and `author`, combined with a GIN index.
- **Rationale**: At the scale this product operates (a portfolio-grade marketplace, not a high-traffic platform), standing up Elasticsearch/OpenSearch is unjustified operational overhead — another service to deploy, secure, and keep in sync with Postgres. Native FTS gives adequate relevance ranking with zero additional infrastructure. If query volume or ranking sophistication later demands it, migrating to a dedicated search engine is a bounded, isolated change because search access is already behind a repository interface (§14.4).

### 11.4 Soft deletes
- **DB-020**: `Listing.status = 'deleted'` MUST be used instead of row deletion for listings.
- **Rationale**: Preserves referential integrity for `ListingImage` and `AdminAction` without cascade complexity, preserves audit trail, and allows a "recently removed, undo" affordance later without a schema change. Hard-deleting a row that other tables reference (or that an admin action documents) is the kind of decision that looks simple until someone asks "why did this listing disappear" three weeks later and there's no record.
- **DB-021**: `User` accounts are never hard-deleted in V2; suspension (`is_active=false`) is the only removal mechanism. True account deletion (GDPR-style erasure) is a real requirement for a production system handling EU users, but is explicitly deferred — flagged here as a known gap (see §20 Assumptions), not silently ignored.
- **DB-022** *(new in 2.1.0)*: Images belonging to a `deleted` listing MUST be retained in object storage indefinitely in v2.1.0, consistent with the no-hard-delete philosophy above. This has a storage-cost implication that is accepted at the target scale (§17.1); it should be revisited only if storage cost becomes material.

### 11.5 Constraints and integrity
- **DB-030**: `price` MUST be `numeric(10,2)` with a `CHECK (price > 0)` constraint — never a float.
- **DB-031**: Foreign keys MUST use `ON DELETE RESTRICT` for `Listing.owner_id → User.id` (a user should never be hard-deletable while owning listings, which is moot given DB-021, but the constraint documents intent) and `ON DELETE CASCADE` for `ListingImage.listing_id → Listing.id` (images are meaningless without their listing).
- **DB-032**: All timestamps MUST be `timestamptz`, stored in UTC.

### 11.6 Indexing
- **DB-040**: Index on `Listing.status` (heavily filtered).
- **DB-041**: Composite index on `(status, category, condition)` to support the common filter combination.
- **DB-042**: GIN index on `search_vector`.
- **DB-043**: Index on `User.email` (unique, already implied by the unique constraint).
- **DB-044** *(new in 2.1.0 — closes a gap identified in review)*: Index on `User.is_active`, since every public listing query joins against it (FR-041, UC-6) to exclude suspended users' listings.

---

## 12. API Requirements

### 12.1 Style
- **API-001**: REST over HTTPS, JSON request/response bodies, resource-oriented URLs.
- **API-002**: Versioned under `/api/v1/`.
- **API-003**: All list endpoints MUST support pagination via `page` and `page_size` query params (offset-based).
  - **Rationale**: Keyset/cursor pagination is more correct under concurrent writes and scales better, but it's meaningfully more implementation and API-surface complexity (opaque cursors, stable sort keys) than this product's scale justifies. Offset pagination with a hard `page_size` cap (max 50) is the right trade-off now; the endpoint should return pagination metadata in a shape that could be swapped to cursor-based later without a breaking change to consumers (i.e., don't leak raw `OFFSET` semantics into the contract — return `total`, `page`, `page_size`, not a raw offset).
- **API-004** *(new in 2.1.0)*: The system MUST expose an unauthenticated health-check endpoint, `GET /api/v1/health`, returning basic liveness/readiness status including database connectivity. Used by container orchestration/monitoring and by Milestone 0's exit criterion (§23).

### 12.2 Representative endpoint list

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | Public | Liveness/readiness check *(new in 2.1.0)* |
| POST | `/api/v1/auth/register` | Public | Create account |
| POST | `/api/v1/auth/login` | Public | Issue access + refresh token |
| POST | `/api/v1/auth/refresh` | Refresh token (cookie) | Rotate refresh token, issue new access token |
| POST | `/api/v1/auth/logout` | User | Revoke current refresh token |
| GET | `/api/v1/listings` | Public | Browse/search/filter, paginated |
| GET | `/api/v1/listings/{id}` | Public (owner/admin get expanded visibility) | Listing detail — see API-012 |
| POST | `/api/v1/listings` | User | Create listing |
| PATCH | `/api/v1/listings/{id}` | User (owner) | Edit listing — only while `available` (FR-028) |
| DELETE | `/api/v1/listings/{id}` | User (owner) | Soft-delete listing — idempotent (FR-029) |
| POST | `/api/v1/listings/{id}/sold` | User (owner) | Mark sold |
| POST | `/api/v1/listings/{id}/images` | User (owner) | Upload 1+ images — see API-030/031/032 |
| GET | `/api/v1/users/me` | User | Own profile |
| PATCH | `/api/v1/users/me` | User | Edit display name |
| POST | `/api/v1/users/me/password` | User | Change password (self-initiated, or forced per FR-015) |
| GET | `/api/v1/users/me/listings` | User | My Listings (all statuses) |
| GET | `/api/v1/admin/users` | Admin | List users |
| POST | `/api/v1/admin/users/{id}/suspend` | Admin | Suspend user |
| POST | `/api/v1/admin/users/{id}/reinstate` | Admin | Reinstate user |
| POST | `/api/v1/admin/users/{id}/reset-password` | Admin | Admin-assisted password reset *(new in 2.1.0 — FR-045)* |
| GET | `/api/v1/admin/listings` | Admin | List listings, any status |
| DELETE | `/api/v1/admin/listings/{id}` | Admin | Remove listing (reason required) |

### 12.3 Error contract
- **API-010**: Errors MUST return a consistent envelope: `{"error": {"code": "string", "message": "string", "fields": {...optional}}}`.
- **API-011**: HTTP status codes MUST be used correctly and consistently: `400` malformed request, `401` missing/invalid auth, `403` authenticated but not authorized, `404` not found (including soft-deleted resources for non-owner, non-admin requesters), `409` state conflict, `422` validation failure.
- **API-012** *(new in 2.1.0 — the single authoritative statement of the visibility rule; restates FR-006a for traceability into the endpoint table)*: `GET /api/v1/listings/{id}` MUST return the listing regardless of status when the requester is the listing's owner or an admin. For all other requesters (including guests), a listing with status `deleted` MUST return `404`.
- **API-013** *(new in 2.1.0 — closes an implementation-risk gap identified in review)*: Every error response, **including framework-level errors FastAPI/Pydantic generate automatically** (e.g., `RequestValidationError` on a malformed request body, which FastAPI by default renders as `{"detail": [...]}`), MUST be translated by a global exception handler into the API-010 envelope before reaching the client. No endpoint may return an error in any shape other than the documented envelope. This MUST be implemented once, centrally (see BE-042), not per-endpoint.

### 12.4 Schema validation
- **API-020**: All request/response bodies MUST be defined via Pydantic v2 models; handlers MUST NOT accept raw dicts.
- **API-021**: Frontend types MUST be generated from the backend's OpenAPI schema (e.g., via `openapi-typescript`), not hand-duplicated. *(Changed in 2.1.0: elevated from SHOULD to MUST — a SHOULD on the exact mechanism meant to prevent frontend/backend drift undermines its own purpose, since it's the first thing to get skipped under time pressure.)*

### 12.5 Image upload
- **API-030** *(clarified in 2.1.0)*: `POST /api/v1/listings/{id}/images` MUST accept **one or more** image files in a single `multipart/form-data` request under the field name `images` (i.e., the endpoint supports multi-file upload in one call; it is not restricted to exactly one file per request, and the client is not required to make six separate calls).
- **API-031**: The server MUST validate file type (JPEG/PNG/WebP only, verified by content sniffing per SEC-060, not just declared `Content-Type`) and size (max 5MB per image) before accepting.
- **API-032** *(new in 2.1.0 — resolves the image-upload atomicity ambiguity identified in review)*: The server MUST enforce the 1–6 cumulative image limit per listing across all upload calls, atomically. A single upload request MUST be rejected in its entirety (`422`, no partial persistence, no orphaned object-storage writes) if accepting it would cause the listing's total image count to exceed 6. Partial success (some files of one request persisted, others rejected) is not permitted.

---

## 13. Frontend Requirements

### 13.1 Structure
- **FE-001**: React + TypeScript (strict mode), built with Vite.
- **FE-002**: Routing via React Router; route structure mirrors the resource model (`/listings`, `/listings/:id`, `/listings/new`, `/my-listings`, `/profile`, `/admin/*`).
- **FE-003**: Server state (listings, profile, admin data) MUST be managed via TanStack Query — no hand-rolled fetch/useEffect data-fetching, no duplicating server state into a global client store (Redux/Zustand). Client-only UI state (form drafts, modal open/closed) uses local component state.
  - **Rationale to push back on a common mistake**: teams frequently introduce a global state manager for data that's actually server state. That produces two sources of truth and cache-invalidation bugs. TanStack Query already solves caching, refetching, and invalidation — adding Redux on top would be redundant complexity.

### 13.2 Styling
- **FE-010**: Tailwind CSS for styling; no ad hoc inline styles except for computed/dynamic values Tailwind can't express statically.
- **FE-011**: A small shared component library (Button, Input, Select, Modal, Card, Badge) MUST exist and be reused — no copy-pasted markup for the same visual pattern across pages.

### 13.3 Forms
- **FE-020**: Listing create/edit forms MUST validate client-side (required fields, price > 0, image count 1–6) before submission, in addition to (never instead of) server-side validation.
- **FE-021**: Form validation errors from the API (`422` with `fields`) MUST be mapped back to the corresponding input.
- **FE-022** *(new in 2.1.0)*: The login form MUST handle the `PASSWORD_CHANGE_REQUIRED` response (FR-015) by redirecting to a forced password-change screen before allowing navigation to any other route.

### 13.4 Data fetching states
- **FE-030**: Every data-dependent view MUST explicitly handle loading, error, and empty states — not just the happy path. "No listings match your filters" is a designed state, not a blank screen.

### 13.5 Destructive actions
- **FE-040**: Delete listing, mark-as-sold, and admin remove/suspend/reset-password actions MUST require an explicit confirmation step (modal), not fire on a single click.

### 13.6 Accessibility (cross-reference §16)
- **FE-050**: All interactive elements MUST be reachable and operable via keyboard alone.
- **FE-051**: Images MUST have meaningful `alt` text (listing title/author, not filename).

---

## 14. Backend Requirements

### 14.1 Architecture
- **BE-001**: Layered architecture MUST be enforced: **routers** (HTTP concerns only) → **services** (business logic) → **repositories** (data access) → **models** (SQLAlchemy ORM). Routers MUST NOT contain SQLAlchemy queries; services MUST NOT import FastAPI request/response types.
  - **Rationale**: This is the single highest-leverage architectural decision in the backend. It's what makes the business logic testable without spinning up HTTP, and what makes the data layer swappable in principle. A "fat router" style (common in small FastAPI tutorials) is exactly what this rebuild is meant to move away from.
- **BE-002**: This is a **modular monolith**, not microservices. Modules: `auth`, `users`, `listings`, `admin`, `storage`. Each module owns its routers/services/repositories; cross-module calls go through service interfaces, not direct repository access.
  - **Rationale (challenge the obvious "portfolio microservices" temptation)**: Microservices would require inter-service auth, network resilience handling, distributed transactions or eventual consistency for what is fundamentally one small, cohesive domain with one database. That's complexity theater for a project this size — it demonstrates the *appearance* of scale-readiness while actually making the system harder to reason about and slower to build correctly. A well-modularized monolith demonstrates the same separation-of-concerns discipline without the operational tax, and it's the architecture an experienced engineer would actually choose here.

### 14.2 Dependency injection
- **BE-010**: FastAPI's `Depends` MUST be used for request-scoped resources (DB session, current user) — no module-level global session objects.

### 14.3 Configuration
- **BE-020**: All configuration (DB URL, JWT secret, token TTLs, object storage credentials, allowed CORS origin(s) — see §19.4) MUST come from environment variables via a single typed `Settings` object (pydantic-settings), never hardcoded or scattered `os.environ.get` calls.

### 14.4 Storage abstraction
- **BE-030**: Object storage access MUST sit behind a small interface (`StorageBackend.put`, `.get_url`, `.delete`) with an S3-compatible implementation. Local disk storage MAY be used for the interface's local/dev implementation, but production MUST use S3-compatible storage (AWS S3, or MinIO for self-hosted).
  - **Rationale**: Storing images as DB blobs (a common undergraduate shortcut) bloats the database, slows backups, and couples binary data lifecycle to schema migrations. Object storage is the correct default; the interface exists so tests can use an in-memory fake without hitting real storage.
- **BE-031** *(new in 2.1.0)*: The object storage bucket MUST have its own CORS policy permitting `GET` from the frontend's origin, independent of and in addition to the API's own CORS policy (§19.4) — these are two separate CORS surfaces (API server, storage bucket) and both must be configured for images to render in the browser.

### 14.5 Validation error handling
- **BE-042** *(new in 2.1.0 — implementation of API-013)*: A global FastAPI exception handler MUST be registered for `RequestValidationError` (and any other framework- or Starlette-raised HTTP exceptions) that rewrites the response body into the API-010 envelope before it is sent to the client. This MUST be covered by an API-level test asserting the envelope shape on a deliberately malformed request (see TEST-003).

### 14.6 Code quality gates
- **BE-040**: Ruff MUST run in CI for linting and formatting; mypy MUST run in strict mode on the backend; both MUST be pre-commit hooks, not CI-only surprises.
- **BE-041**: All service-layer functions MUST have type hints on parameters and return values — this is not optional "nice to have," it's what mypy strict mode requires to be useful at all.

---

## 15. Security Requirements

### 15.1 Transport and headers
- **SEC-001**: HTTPS MUST be enforced in all non-local environments (TLS termination at the reverse proxy).
- **SEC-002**: Standard security headers MUST be set: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 15.2 Password handling
- **SEC-010**: Passwords MUST be hashed with **Argon2id** (via `passlib` or `argon2-cffi`), not bcrypt-only and never a fast general-purpose hash (SHA-256, MD5). This applies equally to user-chosen passwords and to admin-generated temporary passwords (FR-045).
- **SEC-011**: Minimum password policy: 10+ characters. No composition rules (uppercase/symbol requirements) — that's outdated guidance that pushes users toward predictable patterns; length is the meaningful factor. Admin-generated temporary passwords (FR-045) MUST also meet this policy and SHOULD exceed it (e.g., a 16-character random string) since they are never chosen or memorized by the user.

### 15.3 Token strategy
- **SEC-020** *(committed in 2.1.0 — 2.0.0 left HS256 vs. RS256 as an open recommendation, which was itself an inconsistency in a document whose stated philosophy is to commit to one option and justify it)*: Access tokens MUST be short-lived JWTs (15-minute TTL), signed with **HS256** using a single, strong, randomly generated secret (minimum 256 bits) provided via environment configuration (BE-020) and rotatable without a code change. Asymmetric signing (RS256) is unnecessary in v2.1.0 because exactly one service both issues and verifies tokens; introducing RS256 now would be signing-key infrastructure with no corresponding consumer. This MUST be revisited only if a second, independently-operated service needs to verify tokens without holding the signing secret.
- **SEC-021**: Refresh tokens MUST be opaque, cryptographically random strings (never JWTs — a stateless refresh JWT cannot be revoked before expiry, which would break FR-013 logout and the suspension model in §15.4a). Refresh tokens are stored server-side as a salted hash (see `RefreshToken`, §10.1) with a 30-day expiry, and MUST be revocable.
- **SEC-022**: The access token MUST be delivered to the frontend and stored in memory (JS variable / React context), **not** `localStorage`. The refresh token MUST be stored in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. This cookie configuration depends on the same-site deployment model required by DEPLOY-023 — see §19.4 for the deployment-side half of this requirement; the two MUST be read together.
  - **Rationale (push back on a very common mistake)**: Storing JWTs in `localStorage` is a frequent shortcut that trades away XSS protection — any injected script can read `localStorage` and exfiltrate the token. `HttpOnly` cookies are inaccessible to JS. The trade-off is CSRF exposure, which is mitigated by `SameSite=Strict` plus a custom header requirement on state-changing requests (simple CSRF defense, no token-matching scheme needed given `SameSite` already does most of the work for this same-origin SPA — see DEPLOY-023).
- **SEC-023** *(new in 2.1.0 — closes a genuine gap identified in review: 2.0.0 made tokens "revocable" but never specified a rotation or reuse-detection model)*: Refresh tokens MUST be rotated on every use. Each successful call to `POST /api/v1/auth/refresh` MUST: (a) mark the presented `RefreshToken` row `revoked = true`, (b) issue a new refresh token belonging to the same `family_id`, and (c) issue a new access token. The client's cookie is replaced with the new refresh token on every refresh.
- **SEC-024** *(new in 2.1.0)*: Presentation of a refresh token that is already marked `revoked` MUST be treated as evidence of token theft (a legitimate client never re-presents a token it has already rotated away from). This MUST revoke **every** `RefreshToken` row sharing that token's `family_id`, forcing full re-authentication. This is the standard rotation-with-reuse-detection pattern and requires no new infrastructure — only the `family_id` column already added in §10.1.
- **SEC-025** *(new in 2.1.0 — reconciles the 2.0.0 contradiction between "immediate" suspension and stateless access tokens, per UC-6)*: Suspending a user (FR-041) MUST immediately revoke all of that user's `RefreshToken` rows, preventing any further token refresh or login from that point forward. However, because the access token is a stateless, unrevocable JWT (SEC-020), an access token issued before suspension remains technically valid until its own expiry — **at most 15 minutes**. Suspension is therefore bounded-immediate (takes full effect within one access-token TTL), not instantaneous. This is an explicit, accepted trade-off for this product's risk profile (a used-book marketplace, not a system handling live financial or safety-critical sessions); true instantaneous revocation would require a per-request token-allowlist/denylist check against the database on every authenticated request, which reintroduces the statefulness JWTs exist to avoid, and is not justified here. UC-6 and FR-041 are worded to match this bound and no longer claim unqualified immediacy.

### 15.4 Authorization
- **SEC-030**: Every mutating endpoint MUST perform an explicit ownership or role check in the service layer (not just route-level "is authenticated") — ownership checks MUST NOT be inferable purely from client-supplied IDs; the current user's identity comes only from the verified token.
- **SEC-031**: Admin endpoints MUST be protected by a role check that MUST NOT be satisfiable by a client-supplied field (role comes from the DB record tied to the token subject, never from request body).

### 15.5 Rate limiting
- **SEC-040**: `/auth/login`, `/auth/register`, and `/auth/refresh` MUST be rate-limited per IP (e.g., 10 requests/minute) to blunt credential-stuffing, enumeration, and refresh-token brute forcing. *(Extended in 2.1.0 to explicitly include `/auth/refresh`, which becomes a more security-relevant endpoint once rotation/reuse-detection (SEC-023/024) makes it the trigger point for theft detection.)* This is implemented as a single-process, in-memory limiter, consistent with the single-application-instance deployment target in §17.1/NFR-002; if the deployment is ever scaled to multiple instances, this MUST move to a shared store — that is a deployment-scaling change, not a v2.1.0 requirement.

### 15.6 Known trade-off: no self-service email verification or reset
As established in NG-9, V2.1.0 does not verify email ownership at registration, and self-service password reset is not implemented. This means an account can be created with an email the registrant doesn't control, and a locked-out user depends on manual admin assistance (FR-045) rather than a self-service flow. This is an accepted risk for this product's scope (no payments, no PII exposure beyond a display name) and is documented here explicitly so it is a **decision**, not a **gap that was missed**. It should be revisited if the product ever handles anything more sensitive.

### 15.7 Audit logging
- **SEC-050**: All admin mutating actions — including `reset_password` (new in 2.1.0) — MUST be recorded in `AdminAction` (see §10.1) with actor, target, reason (where applicable), and timestamp. Audit records are append-only — no update/delete endpoint exists for them at the API layer.

### 15.8 Input validation and file upload safety
- **SEC-060**: Uploaded images MUST be validated by actual content (magic-byte sniffing), not just file extension or declared `Content-Type`, before being persisted to storage.
- **SEC-061**: Object storage keys MUST be server-generated (UUID-based), never derived from user-supplied filenames, to prevent path traversal and collisions.
- **SEC-062** *(new in 2.1.0, MAY — noted in review as a low-cost privacy improvement, not required)*: The system MAY strip EXIF metadata (including embedded GPS coordinates) from uploaded images before persisting them, to reduce incidental exposure of a seller's location. This is not required for v2.1.0 but is a cheap addition an implementer may choose to include.

---

## 16. Accessibility Requirements

- **A11Y-001**: The frontend MUST conform to **WCAG 2.1 Level AA** for all user-facing pages.
- **A11Y-002**: Color contrast MUST meet AA thresholds (4.5:1 normal text, 3:1 large text) — verified against the actual Tailwind palette in use, not assumed.
- **A11Y-003**: All forms MUST have programmatically associated labels (`<label for>` / `aria-label`), and validation errors MUST be announced via `aria-live` or `aria-describedby`, not conveyed by color alone.
- **A11Y-004**: Focus order MUST be logical; focus MUST be trapped within open modals and returned to the triggering element on close.
- **A11Y-005**: All non-decorative images MUST have descriptive `alt` text; decorative icons MUST be `aria-hidden`.
- **A11Y-006**: The site MUST be fully operable via keyboard (tab order, Enter/Space activation, Escape to close modals) with no keyboard traps.
- **A11Y-007**: Automated accessibility checks (axe-core via `@axe-core/playwright` or similar) MUST run in CI against key pages as a regression gate — not just a manual, one-time audit. The gated page set MUST include: browse, listing detail, create-listing form, **login form, registration form, and the forced/self-service password-change form** *(login/registration/password-change added in 2.1.0 — these are exactly the high-risk, form-heavy pages that were omitted from the original gate)*.

---

## 17. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-001 | p95 API response time < 300ms for listing browse/search under expected load (defined in §17.1), verified per TEST-021. |
| NFR-002 | The system MUST support at least 50 concurrent users comfortably on a **single** application server + single DB instance — this is the target scale; do not architect beyond it (see §14.1 rationale). This single-instance assumption is authoritative for the entire document, including the in-memory rate limiter (SEC-040) — see §19.5 for the explicit statement that horizontal scaling is out of scope for v2.1.0. |
| NFR-003 | All backend code MUST pass mypy strict mode with zero errors as a CI gate. |
| NFR-004 | All backend code MUST pass Ruff lint and format checks as a CI gate. |
| NFR-005 | The application MUST be fully runnable locally via a single `docker compose up` with no manual post-steps beyond running migrations. |
| NFR-006 | Logs MUST be structured (JSON) in non-local environments, to support ingestion by any standard log aggregator without custom parsing. |
| NFR-007 | The system MUST degrade gracefully if object storage is temporarily unavailable: listing creation should fail clearly (422/503 with a clear error) rather than partially succeed with missing images. This applies equally to the multi-file upload atomicity guarantee in API-032. |
| NFR-008 | Database migrations MUST be zero-downtime-safe for additive changes (new nullable columns, new tables) — destructive changes documented with a migration plan, not silently applied. |

### 17.1 Expected load baseline
This is a portfolio-scale marketplace, not a high-traffic platform. Design and testing targets assume: a few hundred registered users, low thousands of listings, tens of concurrent sessions at peak, and **exactly one running application instance** (NFR-002). This baseline is stated explicitly so "scalability" requirements aren't gold-plated against a load profile the product will never see — see §14.1, §11.3, and §15.5 rationale, all of which hinge on this assumption.

---

## 18. Testing Requirements

### 18.1 Backend
- **TEST-001**: Unit tests (pytest) MUST cover the service layer with the repository layer mocked/faked — business logic tests should not require a real database.
- **TEST-002**: Integration tests MUST cover the repository layer against a real (containerized, ephemeral) PostgreSQL instance, not SQLite-as-a-stand-in (Postgres-specific features like `tsvector`, enums, and `citext` won't behave identically in SQLite). *(Clarified in 2.1.0)* Each integration test MUST run inside a database transaction that is rolled back at the end of the test (or an equivalent per-test isolation fixture, e.g., truncate-between-tests if a rollback fixture proves impractical for a given test). Tests MUST NOT depend on execution order or leak state into subsequent tests — this MUST be verified by running the suite with randomized test order in CI.
- **TEST-003**: API-level tests (FastAPI `TestClient` / `httpx.AsyncClient`) MUST cover every endpoint's happy path, its authorization failure path, and its validation failure path at minimum, **including an explicit assertion that validation failures are returned in the API-010 envelope (proving BE-042's global handler works, not just the happy-path handlers).**
- **TEST-004**: Minimum backend coverage threshold: 85% line coverage on the `services` and `repositories` layers, enforced in CI (coverage on routers/schemas is a by-product, not a target to chase).

### 18.2 Frontend
- **TEST-010**: Component tests (Vitest + React Testing Library) MUST cover forms (validation states), and any component with conditional render logic (loading/error/empty states).
- **TEST-011**: At least one end-to-end test suite (Playwright) MUST cover the critical paths:
  1. **Seller lifecycle**: register → login → create listing → appears in browse → edit → mark sold → confirm hidden from public browse → delete → confirm owner can still view it in My Listings and its detail page while a second, non-owner browser session gets `404` on the same detail URL (this last assertion directly exercises the FR-006a fix).
  2. **Admin moderation** *(new in 2.1.0 — closes the admin E2E gap identified in review)*: admin suspends a user → suspended user's login attempt is rejected → admin removes a listing with a reason code → listing no longer appears in public browse → corresponding `AdminAction` rows exist for both actions.
  3. **Account recovery** *(new in 2.1.0)*: admin triggers a password reset for a user → user logs in with the temporary password → user is forced into the password-change screen and cannot navigate elsewhere until they set a new password.

### 18.3 Non-functional verification
- **TEST-021** *(new in 2.1.0 — closes the "untestable NFR" gap identified in review: NFR-001 previously had no corresponding verification step)*: A one-time, pre-release load test — run manually using k6 or Locust, **not** part of the CI pipeline — MUST verify NFR-001 against the baseline in §17.1 (50 concurrent virtual users exercising the browse/search endpoint). This is a release-gate checklist item, not an automated regression test; re-run before each significant release, not on every PR.

### 18.4 CI gating
- **TEST-020**: CI (GitHub Actions) MUST run on every PR: lint, type-check, unit tests, integration tests (with randomized order per TEST-002), and the accessibility check (§A11Y-007). A PR MUST NOT be mergeable with a red pipeline.

---

## 19. Deployment Requirements

### 19.1 Local/dev
- **DEPLOY-001**: `docker-compose.yml` MUST define: `api` (FastAPI), `web` (frontend, dev server or built static served via nginx), `db` (Postgres), `storage` (MinIO, for local S3-compatible testing).
- **DEPLOY-002**: Environment configuration MUST be via `.env` files, with `.env.example` committed and `.env` gitignored.

### 19.2 CI/CD
- **DEPLOY-010**: GitHub Actions MUST run the full test/lint/type-check suite on every push and PR.
- **DEPLOY-011**: A separate build workflow MAY build and push Docker images on merge to `main`, tagged with the commit SHA.

### 19.3 Production topology
- **DEPLOY-020**: Reverse proxy (nginx or a managed load balancer) terminates TLS and forwards to the API container; static frontend assets served via CDN or the same reverse proxy.
- **DEPLOY-021**: Database MUST be a managed Postgres instance (e.g., RDS, Neon, Supabase's Postgres) in any real deployment — self-hosting Postgres for a small team/portfolio project is operational burden without benefit. Automated daily backups provided by the managed provider are sufficient for v2.1.0; no custom backup tooling is required *(explicit statement added in 2.1.0 — this was previously an unstated assumption)*.
- **DEPLOY-022**: Alembic migrations MUST run automatically on container startup (`alembic upgrade head`, invoked by the container's entrypoint before the application process starts), and a failed migration MUST cause the container to exit with a non-zero status without starting the application, so the deploy is marked failed rather than serving against a partially-migrated schema *(revised post-2.1.0 — the original wording required this as a manual, separate release step specifically to prevent multiple app instances racing to migrate concurrently; the first production deployment (Render) discovered its free tier has no Shell access at all, making a manual step not merely inconvenient but impossible to execute. The race this requirement originally guarded against cannot occur under DEPLOY-023's single-registrable-domain, single-instance deployment model in the first place — see §17.1's guiding scale constraint and docs/deployment.md for the full reasoning — so automating this step is safe here specifically, not a general license to migrate-on-boot at any scale. Recovery on failure still requires manual engineering review before retry; automatic rollback tooling is still not required at this scale)*.

### 19.4 Deployment model, CORS, and cookie compatibility *(new section in 2.1.0 — closes the CORS/deployment gap identified in review; this section is the deployment-side counterpart to SEC-022 and the two must be read together)*
- **DEPLOY-023**: The frontend and API MUST be deployed under the **same registrable domain** (e.g., frontend at `app.example.com`, API at `api.example.com`, both subdomains of `example.com`). This is what allows the refresh-token cookie (SEC-022) to be set with `SameSite=Strict` and remain a first-party cookie from the browser's perspective. Deploying the frontend and API on genuinely different registrable domains (e.g., a third-party frontend host with no shared parent domain) is **not supported** in v2.1.0, since it would force relaxing `SameSite` to `None` and require introducing a separate CSRF-token scheme — additional complexity this document deliberately avoids at this scope. If cross-domain deployment is ever required, that is a scoped follow-up affecting §15.3 and this section together, not an isolated infrastructure change.
- **DEPLOY-024**: The API's CORS policy MUST allow requests only from the configured frontend origin(s), by exact origin match — never a wildcard (`*`) — and MUST set `Access-Control-Allow-Credentials: true` (required for the cookie in SEC-022 to be sent cross-origin during local development, per DEPLOY-025). Allowed methods and headers MUST be restricted to those the frontend actually uses (`GET`, `POST`, `PATCH`, `DELETE`; `Content-Type`, `Authorization`).
- **DEPLOY-025**: In local development, the frontend dev server (Vite, typically `localhost:5173`) and the API (typically `localhost:8000`) are technically cross-origin (different ports). The local CORS configuration MUST explicitly allow this origin. The `Secure` flag on the refresh-token cookie MUST be relaxed only via environment-based configuration for local development (plain HTTP) and MUST NOT be relaxed in any deployed environment — this switch MUST be driven by the same typed `Settings` object (BE-020), not a hardcoded conditional.
- **DEPLOY-026**: A staging environment is out of scope for v2.1.0 given team size; releases are verified via the CI pipeline (§18.4) and local Docker Compose parity before deployment to production. This MUST be revisited if team size or user base grows enough to justify the additional environment — noted here explicitly as a scope decision, not an oversight.

### 19.5 Scaling posture
- **DEPLOY-027** *(new in 2.1.0)*: v2.1.0 targets exactly one running application instance (NFR-002). Two requirements in this document are explicitly single-instance-dependent and MUST be revisited together if horizontal scaling is ever introduced: the in-memory rate limiter (SEC-040) and the in-memory refresh-token family state, if it is ever cached rather than read from the database on every request. This is noted here so a future contributor scaling the deployment doesn't do so without also addressing these two.

---

## 20. Assumptions

- **AS-1**: Single currency, single locale (English) for v2.1.0.
- **AS-2**: Users are expected to arrange payment/exchange outside the platform; the platform assumes no liability for transactions.
- **AS-3**: Image moderation is manual (admin-driven), not automated (no ML content moderation) — consistent with NG-5.
- **AS-4**: The team accepts the account-recovery model in §15.6 (admin-assisted only, no self-service).
- **AS-5**: Expected scale matches §17.1; if actual usage substantially exceeds it, several documented decisions (offset pagination, native FTS, single DB instance, single app instance, in-memory rate limiting) should be revisited — they are correct for the stated scale, not forever.
- **AS-6** *(new in 2.1.0)*: Admins are trusted to exercise reasonable judgment when verifying a user's identity before an admin-assisted password reset (FR-045); the system does not — and is not required to — enforce a specific identity-verification procedure for this manual, human-mediated step.

---

## 21. Constraints

- **C-1**: Technology stack is fixed as specified (React/TS/Vite/Tailwind/React Router/TanStack Query; FastAPI/SQLAlchemy 2.0/Alembic/PostgreSQL/JWT; Docker Compose/GitHub Actions/Ruff/mypy/pytest). Substituting a component (e.g., swapping Postgres for Mongo) requires revisiting §11 in full, not an isolated change.
- **C-2**: No third-party paid services may be required to run the system locally (MinIO substitutes for S3 in local/dev).
- **C-3**: The project must remain runnable by a single developer without a cluster/orchestration platform (no Kubernetes requirement) — Docker Compose is the ceiling for this project's operational complexity.
- **C-4** *(new in 2.1.0)*: Frontend and API MUST share a registrable domain in any deployed environment (DEPLOY-023) — this is a hard constraint on hosting choices, not a preference, since the authentication model (SEC-022) depends on it.

---

## 22. Acceptance Criteria

The v2.1.0 release is considered done when, and only when, all of the following hold:

1. All functional requirements in §7 are implemented and covered by at least one automated test (unit, integration, or E2E) per requirement.
2. CI pipeline is green on `main`: lint, type-check (backend and frontend), unit tests, integration tests (randomized order), accessibility checks on the full page set in A11Y-007.
3. Coverage thresholds in §18.1 are met.
4. A fresh clone of the repository can go from `git clone` to a working local instance via documented steps (`docker compose up` + one migration command) in under 10 minutes, verified by someone who did not write the code.
5. All security requirements in §15 are implemented, with the token lifecycle specifically demonstrable end-to-end by test: login → refresh (rotation observed) → reuse of a stale refresh token (family revoked) → logout → suspended-user-rejected-within-bound (§15.4a).
6. WCAG AA automated checks (§A11Y-007) pass on the full gated page set (browse, detail, create-listing, login, registration, password-change) with zero critical violations.
7. No out-of-scope feature (§4) is present in the codebase.
8. An admin can suspend a user, remove a listing, and reset a user's password, and all three actions produce a queryable `AdminAction` record.
9. `GET /api/v1/listings/{id}` on a deleted listing returns `404` to a guest and to a different authenticated user, and returns the full listing to its owner and to an admin — verified by an automated test, not just manual inspection (this is the direct acceptance check for the FR-006a fix).
10. The health endpoint (`GET /api/v1/health`) returns a successful response reflecting real database connectivity, verified in CI against the containerized Postgres instance.

---

## 23. Milestone-Based Implementation Plan

### Milestone 0 — Foundations (no user-facing features)
- Repo scaffolding, Docker Compose stack, CI pipeline skeleton (lint/type-check only, tests come next).
- Database schema + first Alembic migration (User, Listing, ListingImage, RefreshToken, AdminAction; `citext` extension enabled per DB-004).
- Settings/config module (including CORS origin configuration, per BE-020/DEPLOY-024), structured logging setup.
- Global exception handler for the API-010 error envelope (BE-042), including the framework-validation-error translation (API-013).
- **Exit criterion**: `docker compose up` yields a running, empty API with `GET /api/v1/health` (API-004) returning success against a connected, migrated database, and a manually-triggered `422` returns the documented envelope shape.

### Milestone 1 — Authentication
- Register, login, refresh, logout endpoints; Argon2id hashing; JWT issuance (HS256 per SEC-020); refresh token rotation and family-based reuse detection (SEC-021/023/024).
- CORS configuration per DEPLOY-024/025, verified against a local frontend dev server origin.
- Auth-related unit + integration + API tests, including a rotation/reuse-detection test.
- **Exit criterion**: Full auth lifecycle passes automated tests, including: normal refresh rotates the token; presenting an already-rotated token revokes the family; rate limiting on login/register/refresh is in place.

### Milestone 2 — Listings core (public + owner-mutations)
- Create/edit/delete/mark-sold endpoints with ownership checks, including the `available`-only edit constraint (FR-028) and idempotent delete (FR-029).
- The owner/admin visibility exception for deleted listings (FR-006a / API-012).
- Browse/search/filter with pagination and full-text search (tsvector + GIN index).
- Multi-file image upload endpoint (API-030/031/032) with atomic cumulative-limit enforcement, and storage abstraction (MinIO locally), including bucket CORS (BE-031).
- Full service/repository/API test coverage for this module, including a test asserting the FR-006a visibility matrix (guest/other-user/owner/admin × available/sold/deleted).
- **Exit criterion**: All of §7.1–7.3 functional requirements pass; "My Listings" and single-listing retrieval agree for every status/role combination.

### Milestone 3 — Profile management
- View/edit display name, change password, and the forced-password-change flow (FR-015/FR-031).
- **Exit criterion**: §7.4 requirements pass with tests, including a test that a `must_change_password` account is blocked from all other endpoints until it changes its password.

### Milestone 4 — Admin
- User list/suspend/reinstate, listing list/remove-with-reason, admin-assisted password reset (FR-045), audit log writes for all four action types.
- Suspension correctly revokes refresh tokens immediately and bounds access-token validity per §15.4a; public-listing visibility correctly excludes suspended users via the `is_active` index (DB-044).
- **Exit criterion**: §7.5 and UC-6/UC-7 pass with tests; audit trail verified for all admin action types.

### Milestone 5 — Frontend build-out
- Component library (Button, Input, Select, Modal, Card, Badge) with Tailwind.
- Pages: Browse, Listing Detail, Create/Edit Listing, My Listings, Profile, Login/Register, forced Password Change, Admin (Users, Listings).
- TanStack Query integration for all server state; loading/error/empty states per FE-030; OpenAPI-generated types (API-021).
- **Exit criterion**: Every backend endpoint has a corresponding, working UI; component tests for forms pass, including the forced-password-change redirect (FE-022).

### Milestone 6 — Accessibility and polish
- Keyboard navigation audit, focus management in modals, axe-core CI integration across the full gated page set in A11Y-007 (including login/registration/password-change).
- Confirmation modals for destructive actions, including admin reset-password.
- **Exit criterion**: §16 requirements pass automated and manual spot-check.

### Milestone 7 — Hardening and release readiness
- Security header configuration, CSRF defense verification (SameSite + same-registrable-domain deployment per DEPLOY-023), rate-limit tuning across login/register/refresh.
- E2E test suite (Playwright) covering all three critical paths in §18.2 (seller lifecycle, admin moderation, account recovery).
- Manual pre-release load test per TEST-021.
- Production deployment documentation (§19.3–19.5), including migration-as-release-step and the same-domain deployment requirement.
- **Exit criterion**: All §22 acceptance criteria satisfied.

---

## Appendix A: Deliberate simplicity log

A running list of "obvious-looking" additions that were considered and rejected, kept here so the reasoning isn't lost to a future contributor who reintroduces them without context:

| Considered | Rejected because |
|---|---|
| Microservices split | No independent scaling or team boundaries exist to justify it (§14.1). |
| Elasticsearch | Postgres FTS is sufficient at target scale (§11.3). |
| Redis cache layer | No demonstrated read-heavy bottleneck yet; add if/when profiling shows a need, behind the same repository interface that already isolates data access. |
| Wishlist / favorites | Deferred per NG-7 — additive, not entangled with core. |
| GraphQL API | REST is a better fit for a small, well-known set of resources with no complex client-driven query shaping needs. |
| Kubernetes | Docker Compose is sufficient for the stated operational ceiling (§C-3). |
| Category as editable admin entity | Six fixed values don't warrant CRUD + admin UI (§10.4). |
| Asymmetric JWT signing (RS256) *(added in 2.1.0)* | Only one service issues and verifies tokens; RS256 would be signing-key infrastructure with no second consumer to justify it (§15.3, SEC-020). |
| Self-service (email-based) password reset *(added in 2.1.0)* | Requires the notification infrastructure excluded in NG-4; the actual gap (no recovery path at all) is closed instead with a manual admin-assisted reset that reuses existing admin machinery (§7.5, FR-045). |
| Per-request token-allowlist check for instantaneous suspension *(added in 2.1.0)* | Would reintroduce the statefulness JWTs exist to avoid, for a bound (≤15 minutes) that is acceptable at this product's risk profile (§15.3, SEC-025). |
| Cross-registrable-domain frontend/API hosting *(added in 2.1.0)* | Would force `SameSite=None` and a separate CSRF-token scheme; same-domain deployment (DEPLOY-023) achieves the same security posture with less machinery. |
