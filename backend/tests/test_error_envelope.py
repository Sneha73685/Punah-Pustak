"""Tests for the global error envelope (API-010, API-013, BE-042).

Milestone 0's only real endpoint (`GET /api/v1/health`) takes no input, so
it cannot itself produce a validation error. Two things are tested instead:

1. Against the REAL application: an undefined route naturally produces a
   404 through Starlette's own routing — this is a genuine "malformed
   request" (a request for something that doesn't exist) hitting production
   exception-handler wiring, satisfying the Milestone 0 exit criterion (§23)
   without inventing a fake endpoint in production code.
2. Against a small, isolated throwaway FastAPI app built inside this test
   file (not part of `app/`), which registers the *exact same* handler
   functions from `app.core.errors` and adds one throwaway route with a
   typed path parameter. This exercises `validation_exception_handler`
   directly and thoroughly — including the 422/`fields` shape — without
   adding a parameterized endpoint to the real API ahead of the milestone
   that actually needs one.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import register_exception_handlers


def test_undefined_route_returns_documented_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/this-route-does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert "message" in body["error"]


def _build_throwaway_app() -> FastAPI:
    """A minimal app sharing only `app.core.errors`'s handlers, used solely
    to exercise the validation-error and unhandled-exception paths with
    endpoints that don't belong in the real API yet.
    """
    throwaway = FastAPI()
    register_exception_handlers(throwaway)

    @throwaway.get("/items/{item_id}")
    def get_item(item_id: int) -> dict[str, int]:
        return {"item_id": item_id}

    @throwaway.get("/boom")
    def boom() -> None:
        raise ValueError("deliberately unhandled for the 500 test")

    return throwaway


def test_malformed_request_returns_documented_validation_envelope() -> None:
    """A deliberately malformed request (a non-integer path parameter where
    an integer is required) MUST return the API-010 envelope with a
    VALIDATION_ERROR code and field-level detail — this is the core
    assertion behind the Milestone 0 exit criterion (§23) and API-013.
    """
    throwaway_client = TestClient(_build_throwaway_app())

    response = throwaway_client.get("/items/not-an-integer")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "Request validation failed."
    assert "item_id" in body["error"]["fields"]
    assert isinstance(body["error"]["fields"]["item_id"], list)


def test_unhandled_exception_returns_generic_500_without_leaking_details() -> None:
    throwaway_client = TestClient(_build_throwaway_app(), raise_server_exceptions=False)

    response = throwaway_client.get("/boom")

    assert response.status_code == 500
    body = response.json()
    assert body == {
        "error": {
            "code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected error occurred.",
        }
    }
