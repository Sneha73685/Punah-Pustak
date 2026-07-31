"""GET /api/v1/health (API-004).

Public, unauthenticated. Verifies real database connectivity (not just
process liveness). Used by container orchestration/monitoring and by
Milestone 0's exit criterion.

Per BE-001 ("routers MUST NOT contain SQLAlchemy queries"), the actual query
lives in `app.core.db.check_database_connectivity`; this router only calls
it and translates the outcome into an HTTP response, which is a router-level
(HTTP) concern.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import check_database_connectivity, get_db

router = APIRouter()


class HealthChecks(BaseModel):
    database: str


class HealthResponse(BaseModel):
    status: str
    checks: HealthChecks


@router.get("/health", response_model=HealthResponse, summary="Liveness and readiness check")
def get_health(db: Annotated[Session, Depends(get_db)]) -> HealthResponse:
    try:
        check_database_connectivity(db)
    except Exception as exc:  # noqa: BLE001 - deliberately broad: any DB failure means "not ready"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        ) from exc

    return HealthResponse(status="ok", checks=HealthChecks(database="ok"))
