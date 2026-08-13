# End-to-end tests (Playwright)

SRS §18.2/TEST-011's three critical-path E2E scenarios, run with a real
Chromium browser against the project's own Docker Compose stack — never
against Vercel, Render, S3, or any production data.

| Spec | SRS flow | Covers |
|---|---|---|
| `seller-lifecycle.spec.ts` | TEST-011 flow 1 | register → login → create a listing (with an image) → appears on My Listings and public browse → edit → mark sold → hidden from public browse → delete → owner can still view it, a second (non-owner) browser session gets `404` (FR-006a). |
| `admin-moderation.spec.ts` | TEST-011 flow 2 | admin suspends a user → that user's login is rejected → a plain user cannot reach admin actions (UI redirect + real `403` from the API) → admin removes a listing with a reason code → it disappears from public browse → both actions leave an `AdminAction` row. |
| `account-recovery.spec.ts` | TEST-011 flow 3 | admin-assisted password reset (the product's *actual* recovery mechanism — see §15.6/NG-9, there is no self-service email flow) → user logs in with the temporary password → forced into `/change-password` and bounced back to it from any other protected route → completing it returns to normal, working login. |

## Prerequisites

- Docker and Docker Compose (the same requirement as the rest of the repo's
  local setup — see the root `README.md`).
- Node.js 22.x.
- A **fresh** stack. Every spec generates unique emails/titles per run, so
  re-running against a stack that still has data from a previous run is
  safe in isolation — but the admin-moderation spec locates its listing
  through the actual admin table UI (no search box exists there, by
  design — see `docs/frontend.md`), and relies on it being newest-first on
  page 1. `docker compose down -v` before `up` keeps that assumption cheap
  and always true, rather than something that quietly degrades after many
  local runs.

## 1. Start the stack

From the repository root (not this directory):

```bash
docker compose down -v   # start from an empty database — see "Prerequisites" above
docker compose -f docker-compose.yml -f e2e/docker-compose.e2e.yml up -d --build
```

`e2e/docker-compose.e2e.yml` changes exactly one thing versus normal local
dev: it raises `AUTH_RATE_LIMIT_PER_MINUTE` (SEC-040) for this stack only.
Three spec files' worth of register/login calls, all reaching the `api`
container through the same host-to-Docker port-forward, would otherwise
share one IP as far as the in-memory rate limiter is concerned and
legitimately trip the production-appropriate default (10/min) — see that
file's comment for the full reasoning. Nothing else changes: normal
`docker compose up` (no override) is untouched, and so is every deployed
environment (`render.yaml`).

This brings up `db`, `storage` (MinIO), `storage-init`, `api`, and `web` —
migrations apply automatically on `api` startup (`docker-entrypoint.sh`),
exactly as they do for normal local development. No separate migration
command is needed.

- **Frontend**: `http://localhost:5173`
- **Backend**: `http://localhost:8000` (`GET /api/v1/health` for readiness)
- **Database**: ephemeral for this run if you did `down -v` first — lives
  in the `punah_pustak_db_data` named volume otherwise, exactly like
  normal local dev. This suite never touches a production database; it
  only ever talks to whatever Postgres is reachable at
  `docker compose exec db` in this repo checkout.

Wait for both to be ready (the same script CI uses):

```bash
./e2e/scripts/wait-for-stack.sh
```

## 2. Install dependencies (once)

```bash
cd e2e
npm ci
npx playwright install --with-deps chromium
```

## 3. Run the suite

```bash
cd e2e
npm test                # headless, Chromium only
npm run test:headed     # same, with a visible browser window
npm run test:ui         # Playwright's interactive UI mode
```

Environment variables (all optional — these are the defaults, matching
`docker-compose.yml`):

| Variable | Default | Purpose |
|---|---|---|
| `E2E_FRONTEND_URL` | `http://localhost:5173` | Where Playwright navigates the browser. |
| `E2E_BACKEND_URL` | `http://localhost:8000` | Used only for the one direct-API authorization check in `admin-moderation.spec.ts` (SEC-031's actual server-side boundary, not just the UI guard). |

## 4. Tear down

```bash
cd ..
docker compose down -v
```

## How admin access and test data are handled safely

- **No real credentials, ever.** Every account this suite creates uses a
  generated, unique email (`helpers/test-data.ts`'s `uniqueEmail`) and one
  fixed, non-secret password (`TEST_PASSWORD`) that exists only to satisfy
  SEC-011's length rule for throwaway accounts on a throwaway local
  database — it protects nothing of value and is not an application
  secret.
- **Admin access**: the product has no self-service admin registration or
  promotion endpoint (a deliberate SRS §6/§15.4 boundary, not an
  oversight). This suite gets an admin account the same way Milestone 4/5's
  own manual verification did (see `IMPLEMENTATION_SUMMARY.md`): register
  a normal account through the real UI, then promote it with one direct
  SQL statement against this repo's own Compose `db` service
  (`helpers/db.ts`'s `promoteUserToAdmin`, via `docker compose exec`).
  This can only ever reach the local/CI Compose stack — it shells out to
  `docker compose exec`, never to a hostname or credential belonging to
  any deployed environment.
- **Audit-log verification**: the admin UI has no audit-log viewer
  (moderation is admin-only by design, FR-044), so
  `admin-moderation.spec.ts`'s "an `AdminAction` row exists" assertion
  queries the `admin_actions` table directly, the same way
  `promoteUserToAdmin` does — a read-only `SELECT`, against the same local
  Compose database, never production.
- **Test data cleanup**: the API has no hard-delete for users or listings
  (soft-delete only, by design — see `docs/database.md`), so this suite
  does not attempt to delete what it creates; instead it relies on unique
  identifiers per run and a **fresh** database per run (see
  "Prerequisites") to stay deterministic without accumulating cross-run
  state that matters to any assertion.

## CI

`.github/workflows/ci.yml`'s `e2e-tests` job runs this suite on every PR:
brings up the same Compose stack (with the same rate-limit override) on
the runner, waits for readiness with `wait-for-stack.sh`, runs
`npm test`, uploads the Playwright HTML report/traces/screenshots as a
build artifact on failure, and tears the stack down afterward regardless
of outcome. It depends on nothing outside the runner itself — no
Vercel/Render/S3 credentials, no production resources.
