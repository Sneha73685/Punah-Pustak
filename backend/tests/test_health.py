"""Tests for GET /api/v1/health (API-004).

test_health_ok is an integration test against the real, configured Postgres
instance (TEST-002) — it is what proves "PostgreSQL integration works" and
"health endpoint verifies database connectivity" from the Milestone 0
Definition of Done, not just that the route exists.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok"}}


def test_health_reports_service_unavailable_when_database_is_down() -> None:
    """A failing DB dependency must surface as 503 in the API-010 envelope,
    not as a 200 or an unhandled 500 — this is what makes the health check
    an honest readiness probe rather than a pure liveness probe.
    """

    def _broken_db() -> Generator[Session, None, None]:
        class _ExplodingSession:
            def execute(self, *_args: object, **_kwargs: object) -> None:
                raise RuntimeError("simulated database outage")

        yield _ExplodingSession()  # type: ignore[misc]

    app.dependency_overrides[get_db] = _broken_db
    try:
        with TestClient(app) as broken_client:
            response = broken_client.get("/api/v1/health")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 503
    assert response.json() == {
        "error": {"code": "SERVICE_UNAVAILABLE", "message": "Database unavailable."}
    }


@pytest.mark.parametrize("method", ["post", "put", "delete", "patch"])
def test_health_rejects_non_get_methods(client: TestClient, method: str) -> None:
    response = getattr(client, method)("/api/v1/health")
    assert response.status_code == 405
