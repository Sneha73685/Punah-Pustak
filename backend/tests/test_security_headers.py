"""Tests for SEC-002's security response headers (`SecurityHeadersMiddleware`).

Uses the `client` fixture (the real application, per `conftest.py`) rather
than a throwaway app, specifically because the thing under test is the
*middleware stack's* behavior — CORS interaction and header presence on
both success and the API-010 error envelope — which only the real, fully
wired `app` exercises.
"""

from fastapi.testclient import TestClient

_EXPECTED_HEADERS = {
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
}

_DEFAULT_ORIGIN = "http://localhost:5173"


def _assert_security_headers_present(headers: dict[str, str]) -> None:
    for name, value in _EXPECTED_HEADERS.items():
        assert headers.get(name) == value, f"missing/incorrect {name!r} header"


def test_successful_response_has_security_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    _assert_security_headers_present(dict(response.headers))


def test_not_found_error_response_has_security_headers(client: TestClient) -> None:
    """A 404 through Starlette's own routing (`http_exception_handler`) —
    the same path `test_error_envelope.py` uses for the same reason: a
    genuine "malformed request" hitting production exception-handler
    wiring, not a fake endpoint.
    """
    response = client.get("/api/v1/this-route-does-not-exist")

    assert response.status_code == 404
    _assert_security_headers_present(dict(response.headers))


def test_validation_error_response_has_security_headers(client: TestClient) -> None:
    """A 422 through `validation_exception_handler` — a different
    exception-handler code path than the 404 above, confirming the
    middleware applies uniformly across the error envelope, not just to
    one handler.
    """
    response = client.post("/api/v1/auth/login", json={"email": "not-an-email"})

    assert response.status_code == 422
    _assert_security_headers_present(dict(response.headers))


def test_cors_preflight_still_returns_cors_headers_and_security_headers(
    client: TestClient,
) -> None:
    """SecurityHeadersMiddleware wraps CORSMiddleware (see `app.main`'s
    ordering comment) — it must add its own headers without suppressing or
    altering any header CORSMiddleware sets on a preflight response.
    """
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": _DEFAULT_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == _DEFAULT_ORIGIN
    _assert_security_headers_present(dict(response.headers))


def test_cors_actual_request_still_returns_cors_headers_and_security_headers(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/health", headers={"Origin": _DEFAULT_ORIGIN})

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == _DEFAULT_ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"
    _assert_security_headers_present(dict(response.headers))
