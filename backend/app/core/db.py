"""SQLAlchemy engine, session factory, and declarative base.

Architectural decision (not mandated by the SRS, recorded here and in the
implementation summary): synchronous SQLAlchemy with the psycopg3 driver is
used instead of an async engine/asyncpg. NFR-002 caps this system's target
scale at a single application instance and ~50 concurrent users; at that
scale, sync SQLAlchemy run in FastAPI's threadpool is simpler to reason
about, simpler to test, and has no meaningful throughput disadvantage.
Async SQLAlchemy would be justified at a scale this project explicitly does
not target (§17.1).
"""

from collections.abc import Generator
from enum import Enum

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings
from app.core.exceptions import DomainError

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Shared declarative base for every ORM model in every module.

    DB-003 requires SQLAlchemy 2.0 typed declarative mappings (`Mapped[...]`,
    `mapped_column`) throughout — this base class is what every model in
    app.modules.*.models inherits from to get that typing support.
    """


def enum_values(enum_cls: type[Enum]) -> list[str]:
    """`values_callable` for every `sqlalchemy.Enum(SomePyEnum, ...)` column.

    SQLAlchemy's `Enum` type persists the Python enum *member name* (e.g.
    "USER") by default, not `.value` (e.g. "user"), when constructed from a
    Python `enum.Enum` class. Every native Postgres enum type in this schema
    is defined (in the Alembic migration) using the lowercase `.value`
    strings, so every `sqlalchemy.Enum(...)` column mapping MUST pass this
    function as `values_callable`, or inserts fail at the database with an
    "invalid input value for enum" error despite passing validation and
    mypy cleanly — the mismatch only surfaces against a real Postgres enum,
    never in-process.
    """
    return [member.value for member in enum_cls]


def check_database_connectivity(db: Session) -> None:
    """Execute a trivial query to verify the configured database is reachable.

    BE-001 requires that routers MUST NOT contain SQLAlchemy queries — this
    is that query, extracted so `GET /api/v1/health` (app.api.v1.health)
    only calls this function and translates the outcome into an HTTP
    response, rather than executing SQL itself. Raises whatever the
    underlying driver raises on failure; translating that into a 503 is an
    HTTP concern and stays in the router, not here.
    """
    db.execute(text("SELECT 1"))


def _with_transactional_lifecycle(db: Session) -> Generator[Session, None, None]:
    """The commit/rollback decision logic for one request, factored out of
    `get_db` so the test suite's `api_client` fixture (tests/conftest.py)
    can drive the exact same code path against a shared, rollback-at-test
    -teardown session, instead of maintaining its own independent copy of
    this logic that could silently drift out of sync with production.

    Three outcomes:

    1. The caller's `with`/generator body completes normally → commit.
    2. It raises a `DomainError` → commit, then re-raise. A service is
       responsible for its own consistency before raising one of these
       (e.g. `AuthService.register` checks for a duplicate email BEFORE
       writing anything), so by the time a `DomainError` reaches here,
       whatever the session has flushed is deliberate — and in at least one
       case (SEC-024's reuse-detection: `AuthService.refresh` revokes an
       entire token family *and then* raises `InvalidRefreshTokenError` to
       report the theft) that flushed write is the entire point of the
       request. Rolling it back here would silently defeat reuse detection
       while still returning the "correct" 401 to the client — this exact
       bug shipped, and was only caught by manually exercising the API
       end-to-end against a real running server, because the test fixture
       in use at the time never rolled back mid-test at all.
    3. Any other exception (a genuine, unexpected failure) → rollback, then
       re-raise. There is no service-level guarantee about what such a
       session contains, so rolling back is the correct default here.
    """
    try:
        yield db
    except DomainError:
        db.commit()
        raise
    except Exception:
        db.rollback()
        raise
    else:
        db.commit()


def get_db() -> Generator[Session, None, None]:
    """Request-scoped database session dependency (BE-010).

    FastAPI's `Depends` is used for this rather than a module-level global
    session, so each request gets its own session with a guaranteed close.
    See `_with_transactional_lifecycle` for the commit/rollback logic.
    """
    db = SessionLocal()
    try:
        yield from _with_transactional_lifecycle(db)
    finally:
        db.close()
