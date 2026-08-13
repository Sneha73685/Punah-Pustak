# Testing

This document describes what is actually tested, how, and — just as important — what is not. Numbers below were verified by running the suites directly, not carried over from memory; re-run the commands yourself to confirm.

## Backend: pytest

```bash
cd backend
pip install -e ".[dev]"
pytest                          # full suite
pytest -p no:randomly           # fixed order, for debugging a failure
coverage report --include="app/modules/*/service.py,app/modules/*/repository.py" --fail-under=85
```

**Current state:** 292 tests, 99% overall coverage, **100%** on every `service`/`repository` module (the CI gate requires ≥85% on that scope; the actual figure is higher because the layering in `architecture.md` makes those modules straightforward to test exhaustively with fakes).

### Test types, and where each lives

| Type | What it covers | How |
|---|---|---|
| **Unit** | Service-layer business rules (ownership checks, status-transition legality, precondition validation) | The repository layer is a hand-written fake or a `unittest.mock`, satisfying the same `Protocol` the real repository does — no database involved at all. |
| **Integration** | Repository-layer queries against real behavior (`citext` case-insensitivity, `tsvector` search, enum persistence, cascade behavior) | A real, containerized PostgreSQL instance — never SQLite as a stand-in, since Postgres-specific features don't behave identically there. Each test runs inside a transaction rolled back at teardown, so tests can't leak state into each other. |
| **API-level** | Full request/response cycle, including the error envelope | FastAPI's `TestClient`, with a real app instance and an in-memory fake `StorageBackend` (so no test touches real object storage). Every endpoint has at least a happy-path, an authorization-failure, and a validation-failure test. |

`test_error_envelope.py` specifically asserts that a deliberately malformed request comes back in the standard `{"error": {...}}` shape — proving the global exception handler works, not just the happy-path handlers that never need it.

### Why randomized test order

`pytest-randomly` (a dev dependency) randomizes test execution order on every run by default — this is what surfaced a real, latent bug during development: `ORDER BY created_at DESC` alone is not a stable sort when multiple rows share an identical timestamp (which happens routinely inside one test transaction, since Postgres's `now()` returns the transaction's start time, not the statement's). Fixed by adding `id DESC` as a tiebreaker everywhere pagination depends on stable ordering — see `IMPLEMENTATION_SUMMARY.md`'s Milestone 4 section for the full incident writeup. This is exactly the class of bug a fixed test order would never have caught.

## Frontend: Vitest + React Testing Library

```bash
cd frontend
npm ci
npx tsc --noEmit
npm run test              # vitest run
npm run test:coverage     # with a coverage report (not currently CI-gated)
```

**Current state:** 25 tests across 7 files.

| File | Covers |
|---|---|
| `lib/formErrors.test.ts` | Mapping the API error envelope onto per-field form errors. |
| `components/QueryState.test.tsx` | The one shared loading/error/empty-state component every data-dependent view uses. |
| `components/Modal.test.tsx` | The focus trap (`Tab`/`Shift+Tab` cycling), `Escape` to close, and backdrop-vs-content click behavior. |
| `components/ListingForm.test.tsx` | Client-side validation (required fields, price > 0) and server-field-error passthrough. |
| `components/PasswordChangeForm.test.tsx` | Client-side length validation, submission, and server-error mapping. |
| `auth/AuthContext.test.tsx` | **The forced-password-change redirect** — three integration-style tests proving a 403 `PASSWORD_CHANGE_REQUIRED`, whether it arrives on the very first post-login call or from any later authenticated call, correctly redirects to the change-password screen; and that no valid session sends an unauthenticated visitor to `/login`. |
| `pages/admin/AdminUsersPage.test.tsx` | That a failed admin action (e.g. a 403 from attempting to suspend a fellow admin) surfaces a visible error and leaves the confirmation modal open, rather than failing silently. |

Tests use `@testing-library/react` + `@testing-library/user-event`, mocking the `api/*.ts` layer (never the DOM, never a real network call) via `vi.mock`.

## End-to-end: Playwright

SRS §18.2/TEST-011's three critical-path E2E scenarios — seller lifecycle, admin moderation, and account recovery — are covered by a committed, runnable Playwright suite in [`e2e/`](../e2e/), driving a real Chromium browser against the project's own Docker Compose stack (never mocked, never against production). Full detail — architecture, how admin access and test data are handled safely, exactly how to run it locally and in CI — lives in [`e2e/README.md`](../e2e/README.md) rather than duplicated here. CI runs it on every PR via the `e2e-tests` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

This suite is also what caught a real bug during its own development: on a cold page load (direct URL, bookmark, or hard refresh — not a same-session SPA navigation), `ListingDetailPage`'s data fetch could reach the backend before the access token was restored from the refresh-token cookie, and for the one case where identity changes the response at the same URL (FR-006a: an owner viewing their own deleted listing), the result was a real, non-retried `404` — a bug in `src/api/client.ts`/`src/main.tsx`, not a test artifact (see git history for `client.test.ts`, added as its regression test).

## What is not automated (honest gap statement)

- **Automated accessibility checks (axe-core).** The SRS (A11Y-007) calls for `axe-core` (via `@axe-core/playwright` or similar) to run in CI against the key pages as a WCAG 2.1 AA regression gate. **This does not exist yet.** The component library implements the underlying accessibility mechanics directly in code (label association via `htmlFor`/`id`, `aria-describedby` + `role="alert"` for errors, a manual focus trap in `Modal`, keyboard operability) and these were manually verified during development, but there is no automated, CI-enforced accessibility check today. This is Milestone 6 scope.
- **Load testing.** SRS §18.3 calls for a one-time, manually-run k6/Locust check against the NFR-001 latency target before release. Not yet performed.
- **Frontend coverage is not CI-gated** — `npm run test:coverage` exists and can be run locally, but no minimum threshold is enforced in CI the way the backend's is.

If you are evaluating this repository and coverage/testing rigor matters to your assessment, the honest summary is: **the backend is tested exhaustively and automatically; the frontend's critical interaction paths (forms, the forced-password-change redirect, error handling) are covered by component tests; the three SRS-mandated critical user journeys are covered end-to-end by a real-browser Playwright suite; but there is no automated accessibility regression gate yet.**

## Related documents

- [`backend.md`](backend.md) / [`frontend.md`](frontend.md) — what's being tested
- [`../e2e/README.md`](../e2e/README.md) — the Playwright suite: architecture, local/CI setup, safe test-data handling
- [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) — exactly what CI runs, verbatim
- [`../IMPLEMENTATION_SUMMARY.md`](../IMPLEMENTATION_SUMMARY.md) — the ordering-bug incident and other testing-related findings, in full
