"""API-level tests for the auth endpoints (TEST-003): every endpoint's
happy path, authorization-failure path, and validation-failure path, with
an explicit assertion that failures come back in the API-010 envelope.

Also the direct exercise of the Milestone 1 exit criterion (SRS §23):
"Full auth lifecycle passes automated tests, including: normal refresh
rotates the token; presenting an already-rotated token revokes the family;
rate limiting on login/register/refresh is in place."
"""

from fastapi import Response as FastAPIResponse
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.modules.auth.router import _set_refresh_cookie
from app.modules.users.models import User
from tests.conftest import register_and_login

_REGISTER = "/api/v1/auth/register"
_LOGIN = "/api/v1/auth/login"
_REFRESH = "/api/v1/auth/refresh"
_LOGOUT = "/api/v1/auth/logout"

_PASSWORD = "a-long-enough-password"


def _register(
    client: TestClient,
    *,
    email: str,
    password: str = _PASSWORD,
    display_name: str = "Reader",
) -> Response:
    return client.post(
        _REGISTER, json={"email": email, "password": password, "display_name": display_name}
    )


def _login(client: TestClient, *, email: str, password: str = _PASSWORD) -> Response:
    return client.post(_LOGIN, json={"email": email, "password": password})


class TestRegister:
    def test_happy_path_returns_public_user_without_password(self, api_client: TestClient) -> None:
        response = _register(api_client, email="new-user@example.com")

        assert response.status_code == 201
        body = response.json()
        assert body["email"] == "new-user@example.com"
        assert body["display_name"] == "Reader"
        assert "password" not in body
        assert "password_hash" not in body

    def test_validation_failure_short_password_returns_envelope(
        self, api_client: TestClient
    ) -> None:
        response = _register(api_client, email="short-pw@example.com", password="short")

        assert response.status_code == 422
        body = response.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert "password" in body["error"]["fields"]

    def test_duplicate_email_returns_envelope(self, api_client: TestClient) -> None:
        _register(api_client, email="dup@example.com")

        response = _register(api_client, email="Dup@Example.com")  # citext: same account, any case

        assert response.status_code == 422
        body = response.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert body["error"]["fields"]["email"] == ["An account with this email already exists."]

    def test_does_not_auto_login(self, api_client: TestClient) -> None:
        """§8.2: "redirected to login (not auto-logged-in...)"."""
        response = _register(api_client, email="no-auto-login@example.com")

        assert "access_token" not in response.json()
        assert "refresh_token" not in api_client.cookies


class TestLogin:
    def test_happy_path_sets_refresh_cookie_and_returns_access_token(
        self, api_client: TestClient
    ) -> None:
        _register(api_client, email="login-happy@example.com")

        response = _login(api_client, email="login-happy@example.com")

        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert isinstance(body["access_token"], str) and body["access_token"]
        assert body["expires_in"] == 15 * 60

        set_cookie = response.headers.get("set-cookie", "")
        assert "refresh_token=" in set_cookie
        assert "HttpOnly" in set_cookie
        assert "samesite=strict" in set_cookie.lower()
        # `Secure` is NOT asserted here: `api_client` overrides cookie_secure
        # to False specifically so this cookie can round-trip through
        # `TestClient` (which never uses real TLS — see conftest.py's
        # `_test_settings`). The Secure-flag behavior itself is verified
        # directly, independent of TestClient/TLS, in
        # `TestRefreshCookieAttributes` below.

    def test_wrong_password_returns_generic_envelope(self, api_client: TestClient) -> None:
        _register(api_client, email="wrong-pw@example.com")

        response = _login(api_client, email="wrong-pw@example.com", password="totally-wrong-pw")

        assert response.status_code == 401
        body = response.json()
        assert body["error"]["code"] == "INVALID_CREDENTIALS"

    def test_unknown_email_returns_identical_envelope_to_wrong_password(
        self, api_client: TestClient
    ) -> None:
        """No account enumeration: the response for a nonexistent email must
        be indistinguishable from a wrong password for a real one.
        """
        _register(api_client, email="exists@example.com")
        wrong_password = _login(api_client, email="exists@example.com", password="nope-nope-nope")
        unknown_email = _login(
            api_client, email="does-not-exist@example.com", password="whatever12"
        )

        assert wrong_password.status_code == unknown_email.status_code == 401
        assert wrong_password.json() == unknown_email.json()

    def test_validation_failure_malformed_email_returns_envelope(
        self, api_client: TestClient
    ) -> None:
        response = api_client.post(_LOGIN, json={"email": "not-an-email", "password": _PASSWORD})

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_suspended_user_is_rejected_with_the_same_envelope_as_wrong_password(
        self, api_client: TestClient, db_session: Session
    ) -> None:
        """FR-041 (Milestone 4): "A suspended user cannot log in." There is
        no admin endpoint call here on purpose — this test is scoped to
        `auth`'s own login behavior given `is_active = False`, independent
        of how that flag got set; the full admin-suspend-then-login-fails
        flow is covered end-to-end in `test_admin_api.py`.
        """
        email = "suspend-then-login@example.com"
        _register(api_client, email=email)
        user = db_session.query(User).filter(User.email == email).one()
        user.is_active = False
        db_session.flush()

        response = _login(api_client, email=email, password=_PASSWORD)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


class TestRefresh:
    """Direct exercise of the Milestone 1 exit criterion (§23): normal
    refresh rotates the token; presenting an already-rotated token revokes
    the family.
    """

    def test_normal_refresh_rotates_the_token(self, api_client: TestClient) -> None:
        register_and_login(api_client, "rotate@example.com")
        original_cookie = api_client.cookies.get("refresh_token")
        assert original_cookie is not None

        response = api_client.post(_REFRESH)

        assert response.status_code == 200
        assert isinstance(response.json()["access_token"], str)
        rotated_cookie = api_client.cookies.get("refresh_token")
        assert rotated_cookie is not None
        assert rotated_cookie != original_cookie  # a genuinely new token was issued

    def test_reusing_an_already_rotated_token_revokes_the_family(
        self, api_client: TestClient
    ) -> None:
        register_and_login(api_client, "reuse@example.com")
        original_cookie = api_client.cookies.get("refresh_token")
        assert original_cookie is not None

        first_refresh = api_client.post(_REFRESH)
        assert first_refresh.status_code == 200
        rotated_cookie = api_client.cookies.get("refresh_token")
        assert rotated_cookie is not None

        # Re-present the ORIGINAL (now-rotated-away-from) token — simulate
        # theft/replay by putting it back on the client directly.
        api_client.cookies.set("refresh_token", original_cookie)
        reuse_response = api_client.post(_REFRESH)

        assert reuse_response.status_code == 401
        assert reuse_response.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"

        # SEC-024: the whole family is revoked, not just the reused token —
        # the token issued by the FIRST (legitimate) refresh must now also
        # be rejected, even though it was never itself reused.
        api_client.cookies.set("refresh_token", rotated_cookie)
        second_use_of_rotated_token = api_client.post(_REFRESH)
        assert second_use_of_rotated_token.status_code == 401
        assert second_use_of_rotated_token.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"

    def test_missing_cookie_returns_envelope(self, api_client: TestClient) -> None:
        response = api_client.post(_REFRESH)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"


class TestLogout:
    def test_happy_path_revokes_refresh_token(self, api_client: TestClient) -> None:
        access_token = register_and_login(api_client, "logout@example.com")

        response = api_client.post(_LOGOUT, headers={"Authorization": f"Bearer {access_token}"})
        assert response.status_code == 204

        # The refresh token that was valid pre-logout must now be rejected.
        refresh_after_logout = api_client.post(_REFRESH)
        assert refresh_after_logout.status_code == 401

    def test_missing_access_token_returns_envelope(self, api_client: TestClient) -> None:
        response = api_client.post(_LOGOUT)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_invalid_access_token_returns_envelope(self, api_client: TestClient) -> None:
        response = api_client.post(_LOGOUT, headers={"Authorization": "Bearer not-a-real-token"})

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_is_idempotent(self, api_client: TestClient) -> None:
        access_token = register_and_login(api_client, "double-logout@example.com")
        headers = {"Authorization": f"Bearer {access_token}"}

        first = api_client.post(_LOGOUT, headers=headers)
        second = api_client.post(_LOGOUT, headers=headers)

        assert first.status_code == second.status_code == 204


class TestRateLimiting:
    """SEC-040 / the Milestone 1 exit criterion: "rate limiting on
    login/register/refresh is in place."
    """

    def test_register_is_rate_limited(self, api_client: TestClient) -> None:
        limit = get_settings().auth_rate_limit_per_minute
        for i in range(limit):
            _register(api_client, email=f"rl-register-{i}@example.com")

        response = _register(api_client, email="rl-register-over@example.com")

        assert response.status_code == 429
        assert response.json()["error"]["code"] == "RATE_LIMITED"

    def test_login_is_rate_limited(self, api_client: TestClient) -> None:
        _register(api_client, email="rl-login@example.com")
        limit = get_settings().auth_rate_limit_per_minute
        for _ in range(limit):
            _login(api_client, email="rl-login@example.com", password="wrong-on-purpose")

        response = _login(api_client, email="rl-login@example.com", password="wrong-on-purpose")

        assert response.status_code == 429
        assert response.json()["error"]["code"] == "RATE_LIMITED"

    def test_refresh_is_rate_limited(self, api_client: TestClient) -> None:
        limit = get_settings().auth_rate_limit_per_minute
        for _ in range(limit):
            api_client.post(_REFRESH)  # no cookie: each fails 401, still counts against the limit

        response = api_client.post(_REFRESH)

        assert response.status_code == 429
        assert response.json()["error"]["code"] == "RATE_LIMITED"


class TestRefreshCookieAttributes:
    """SEC-022's cookie flags, verified directly against the router's
    cookie-setting helper rather than through `TestClient` — a `Secure`
    cookie is correctly never re-sent by any HTTP (non-TLS) client,
    `TestClient` included, so asserting its presence has to happen by
    inspecting the `Set-Cookie` header on the response that sets it, not by
    round-tripping it through a second request.
    """

    def test_secure_flag_present_when_cookie_secure_is_true(self) -> None:
        response = FastAPIResponse()
        _set_refresh_cookie(response, "a-token", Settings(cookie_secure=True))

        set_cookie = response.headers.get("set-cookie", "")
        assert "Secure" in set_cookie
        assert "HttpOnly" in set_cookie
        assert "samesite=strict" in set_cookie.lower()

    def test_secure_flag_absent_when_cookie_secure_is_false(self) -> None:
        response = FastAPIResponse()
        _set_refresh_cookie(response, "a-token", Settings(cookie_secure=False))

        set_cookie = response.headers.get("set-cookie", "")
        assert "Secure" not in set_cookie
