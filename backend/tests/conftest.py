"""Shared fixtures.

TEST-002 requires integration tests to run against a real, containerized
Postgres instance (never SQLite) and to isolate each test in a transaction
that is rolled back afterward, with randomized test order in CI (handled by
the `pytest-randomly` dev dependency — no fixture needed for that part).

These tests assume migrations have already been applied to the target
database (`alembic upgrade head`) as an explicit prior step — consistent
with DEPLOY-022 treating migration as its own release step, never something
tests or the app run implicitly on startup.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import _with_transactional_lifecycle, engine, get_db
from app.core.rate_limit import auth_rate_limiter
from app.main import app


def _test_settings() -> Settings:
    """`cookie_secure=False`, matching the non-TLS reality both of local dev
    over plain HTTP (docker-compose sets `COOKIE_SECURE=false` for exactly
    this reason, per DEPLOY-025) and of `TestClient`, which never uses real
    TLS either. Without this override, httpx's cookie jar correctly (per
    RFC 6265) withholds a `Secure` cookie from every request after the one
    that sets it, since none of them are HTTPS — a real browser would do
    the same thing, which makes this a fidelity fix, not a workaround
    around anything the application itself does wrong.
    """
    return get_settings().model_copy(update={"cookie_secure": False})


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> None:
    """SEC-040's limiter is deliberately global, in-memory, process-wide
    state (that's the whole point of it) — which means, unlike everything
    else in this file, it is NOT reset by transaction rollback. Without this
    autouse fixture, `pytest-randomly`'s randomized test order (TEST-002)
    could make an unrelated test fail with 429 purely because an earlier
    test happened to run against the same endpoint first and used up its
    quota.
    """
    auth_rate_limiter.reset()


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """A session bound to a single connection-level transaction that is
    rolled back after the test, so no test's data survives into the next
    one regardless of execution order (TEST-002).

    Uses SQLAlchemy's `join_transaction_mode="create_savepoint"` (the
    "joining a Session into an external transaction" pattern from
    SQLAlchemy's own testing documentation): `session.commit()` releases
    and immediately restarts a SAVEPOINT rather than committing the outer,
    connection-level transaction, so a real `session.commit()` call — the
    same one the production `get_db` dependency makes — behaves correctly
    (the write is visible to later queries on this session) without ever
    touching the database beyond what this fixture rolls back at teardown.

    This upgrade from a plain `session.flush()`-only fixture was forced by
    a real bug this milestone: `api_client` (below) used to just yield this
    session with no commit/rollback logic at all, which meant it could
    never have caught a bug where a service's intentional, already-flushed
    side effect (SEC-024's reuse-detection revoking a whole token family)
    was silently undone by `get_db`'s rollback-on-exception path in
    production, because in the test fixture nothing ever rolled back
    mid-test to begin with. See `api_client`'s docstring for the fix.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """A TestClient for the real application, with no dependency overrides.

    Only safe for read-only endpoints (health, undefined-route/validation
    envelope checks) — anything that writes should use `api_client` instead,
    which is transactionally isolated. Kept separate from `api_client`
    rather than merged into one fixture so Milestone 0's existing,
    already-verified tests (health, error envelope, schema) are untouched
    by Milestone 1's testing needs.
    """
    app.dependency_overrides[get_settings] = _test_settings
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
def api_client(db_session: Session) -> Generator[TestClient, None, None]:
    """A TestClient for the real application with `get_db` overridden to
    yield `db_session` — every request the test makes through this client
    runs against the same rollback-at-teardown transaction, so multi-step
    flows (register → login → refresh) see each other's writes within a
    test, but nothing survives into the next test (TEST-002).

    The override calls `_with_transactional_lifecycle` — the exact same
    commit/rollback logic `get_db` itself calls — rather than maintaining
    an independent copy of it. A hand-duplicated copy is exactly what
    shipped a real bug this milestone: SEC-024's reuse-detection revokes a
    whole token family and then raises to report the theft, and the naive
    pass-through fixture that predated this one had no rollback logic at
    all to accidentally get right or wrong, so every test using it passed
    regardless of whether production's actual commit/rollback logic was
    correct. Sharing one function closes that gap structurally: it is not
    possible for the test path and the production path to drift apart.

    Unlike `get_db`, this does NOT close `db_session` itself — that
    session is shared across every request the test makes and is closed by
    the `db_session` fixture's own teardown, not per-request.
    """

    def _override_get_db() -> Generator[Session, None, None]:
        yield from _with_transactional_lifecycle(db_session)

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_settings] = _test_settings
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_settings, None)
