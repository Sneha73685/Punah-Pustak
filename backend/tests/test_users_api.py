"""API-level tests for the users/profile endpoints (TEST-003): happy path,
authorization-failure path, and validation-failure path per endpoint.

Also the direct exercise of the Milestone 3 exit criterion (SRS §23):
"§7.4 requirements pass with tests, including a test that a
`must_change_password` account is blocked from all other endpoints until
it changes its password" — `TestForcedPasswordChangeFlow` below hits a
representative endpoint from *another* module (listings) as well as this
module's own, since FR-015's gate is enforced centrally in
`get_current_user` and is meant to apply everywhere that dependency is
used, not just within `users`.
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.users.models import User
from tests.conftest import auth_headers, register_and_login

_ME = "/api/v1/users/me"
_PASSWORD_CHANGE = "/api/v1/users/me/password"
_LISTINGS = "/api/v1/listings"
_LOGIN = "/api/v1/auth/login"
_LOGOUT = "/api/v1/auth/logout"

_PASSWORD = "a-long-enough-password"


def _force_password_change(db_session: Session, email: str) -> None:
    """Simulates the state FR-045's admin-assisted reset (Milestone 4, not
    yet implemented) would produce — there is no admin endpoint yet to
    trigger this through the API, so the test sets the flag directly via
    the same `db_session` the `api_client` fixture's requests run against
    (see conftest.py: both fixtures share one transactionally-isolated
    session, so this write is visible to subsequent requests in the same
    test).
    """
    user = db_session.query(User).filter(User.email == email).one()
    user.must_change_password = True
    db_session.flush()


class TestGetOwnProfile:
    def test_happy_path(self, api_client: TestClient) -> None:
        token = register_and_login(api_client, "profile-get@example.com")

        response = api_client.get(_ME, headers=auth_headers(token))

        assert response.status_code == 200
        body = response.json()
        assert body["email"] == "profile-get@example.com"
        assert body["display_name"] == "Reader"
        assert "password_hash" not in body
        assert "must_change_password" not in body

    def test_requires_authentication(self, api_client: TestClient) -> None:
        response = api_client.get(_ME)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"


class TestUpdateOwnProfile:
    def test_happy_path_updates_display_name(self, api_client: TestClient) -> None:
        token = register_and_login(api_client, "profile-patch@example.com")

        response = api_client.patch(
            _ME, json={"display_name": "New Display Name"}, headers=auth_headers(token)
        )

        assert response.status_code == 200
        assert response.json()["display_name"] == "New Display Name"
        # Persisted, not just echoed back:
        refetched = api_client.get(_ME, headers=auth_headers(token))
        assert refetched.json()["display_name"] == "New Display Name"

    def test_cannot_change_email(self, api_client: TestClient) -> None:
        """FR-033: there is no `email` field on `UserUpdate` at all — an
        `email` key in the request body is simply ignored by Pydantic
        (extra fields aren't forwarded to the schema), not rejected, since
        it isn't part of the documented contract either way.
        """
        token = register_and_login(api_client, "profile-email-immutable@example.com")

        response = api_client.patch(
            _ME,
            json={"display_name": "Still Me", "email": "hijacked@example.com"},
            headers=auth_headers(token),
        )

        assert response.status_code == 200
        assert response.json()["email"] == "profile-email-immutable@example.com"

    def test_validation_failure_empty_display_name_returns_envelope(
        self, api_client: TestClient
    ) -> None:
        token = register_and_login(api_client, "profile-patch-invalid@example.com")

        response = api_client.patch(_ME, json={"display_name": ""}, headers=auth_headers(token))

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_requires_authentication(self, api_client: TestClient) -> None:
        response = api_client.patch(_ME, json={"display_name": "Nobody"})

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"


class TestChangePassword:
    def test_happy_path_allows_login_with_new_password(self, api_client: TestClient) -> None:
        email = "password-change-happy@example.com"
        token = register_and_login(api_client, email)

        response = api_client.post(
            _PASSWORD_CHANGE,
            json={"current_password": _PASSWORD, "new_password": "a-brand-new-password"},
            headers=auth_headers(token),
        )

        assert response.status_code == 204

        old_password_login = api_client.post(_LOGIN, json={"email": email, "password": _PASSWORD})
        assert old_password_login.status_code == 401

        new_password_login = api_client.post(
            _LOGIN, json={"email": email, "password": "a-brand-new-password"}
        )
        assert new_password_login.status_code == 200

    def test_wrong_current_password_returns_envelope(self, api_client: TestClient) -> None:
        token = register_and_login(api_client, "password-change-wrong@example.com")

        response = api_client.post(
            _PASSWORD_CHANGE,
            json={"current_password": "not-the-real-password", "new_password": "a-new-password"},
            headers=auth_headers(token),
        )

        assert response.status_code == 422
        body = response.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert body["error"]["fields"] == {"current_password": ["Current password is incorrect."]}

    def test_validation_failure_short_new_password_returns_envelope(
        self, api_client: TestClient
    ) -> None:
        token = register_and_login(api_client, "password-change-short@example.com")

        response = api_client.post(
            _PASSWORD_CHANGE,
            json={"current_password": _PASSWORD, "new_password": "short"},
            headers=auth_headers(token),
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_requires_authentication(self, api_client: TestClient) -> None:
        response = api_client.post(
            _PASSWORD_CHANGE,
            json={"current_password": _PASSWORD, "new_password": "a-new-password"},
        )

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"


class TestForcedPasswordChangeFlow:
    """The Milestone 3 exit criterion (§23), exercised directly: a
    `must_change_password` account is blocked from all other endpoints
    (representatively: its own profile, and a different module's endpoint
    entirely — listings) until it changes its password, at which point
    normal access resumes with no new token required.
    """

    def test_blocked_from_own_profile_until_password_changed(
        self, api_client: TestClient, db_session: Session
    ) -> None:
        email = "forced-change-profile@example.com"
        token = register_and_login(api_client, email)
        _force_password_change(db_session, email)

        blocked = api_client.get(_ME, headers=auth_headers(token))
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    def test_blocked_from_unrelated_module_endpoint_until_password_changed(
        self, api_client: TestClient, db_session: Session
    ) -> None:
        """Proves FR-015's gate is genuinely global (enforced once, inside
        `get_current_user` itself) rather than something bolted onto just
        the `users` router — a listings-module endpoint is blocked too,
        with no listings-specific code aware of `must_change_password` at
        all.
        """
        email = "forced-change-listings@example.com"
        token = register_and_login(api_client, email)
        _force_password_change(db_session, email)

        blocked = api_client.post(
            _LISTINGS,
            json={
                "title": "Should Not Be Created",
                "author": "Nobody",
                "description": "N/A",
                "category": "fiction",
                "condition": "good",
                "price": 1.00,
            },
            headers=auth_headers(token),
        )

        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    def test_password_change_endpoint_itself_remains_reachable(
        self, api_client: TestClient, db_session: Session
    ) -> None:
        email = "forced-change-escape-hatch@example.com"
        token = register_and_login(api_client, email)
        _force_password_change(db_session, email)

        response = api_client.post(
            _PASSWORD_CHANGE,
            json={"current_password": _PASSWORD, "new_password": "a-brand-new-password"},
            headers=auth_headers(token),
        )

        assert response.status_code == 204

    def test_normal_access_resumes_immediately_after_change_with_the_same_access_token(
        self, api_client: TestClient, db_session: Session
    ) -> None:
        """FR-015: "requires no new token type — it is a per-request check
        against the flag, not a scoped token." The same, already-issued
        access token that was rejected pre-change must be accepted
        post-change — no re-login, no token refresh.
        """
        email = "forced-change-resume@example.com"
        token = register_and_login(api_client, email)
        _force_password_change(db_session, email)
        assert api_client.get(_ME, headers=auth_headers(token)).status_code == 403

        change = api_client.post(
            _PASSWORD_CHANGE,
            json={"current_password": _PASSWORD, "new_password": "a-brand-new-password"},
            headers=auth_headers(token),
        )
        assert change.status_code == 204

        resumed = api_client.get(_ME, headers=auth_headers(token))
        assert resumed.status_code == 200

    def test_wrong_temporary_password_leaves_flag_set_and_stays_blocked(
        self, api_client: TestClient, db_session: Session
    ) -> None:
        email = "forced-change-wrong-temp@example.com"
        token = register_and_login(api_client, email)
        _force_password_change(db_session, email)

        failed_change = api_client.post(
            _PASSWORD_CHANGE,
            json={"current_password": "not-the-temp-password", "new_password": "a-new-password"},
            headers=auth_headers(token),
        )
        assert failed_change.status_code == 422

        still_blocked = api_client.get(_ME, headers=auth_headers(token))
        assert still_blocked.status_code == 403
        assert still_blocked.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    def test_unset_account_is_never_blocked(self, api_client: TestClient) -> None:
        """Control case: an ordinary account (flag never set) is unaffected
        by any of the above — proves the gate is conditional, not a
        regression that blocks everyone.
        """
        token = register_and_login(api_client, "never-forced@example.com")

        response = api_client.get(_ME, headers=auth_headers(token))

        assert response.status_code == 200

    def test_invalid_token_still_returns_401_not_403(self, api_client: TestClient) -> None:
        """The FR-015 gate only ever applies to a *successfully resolved*
        user — an invalid token must still 401 (unauthorized), never 403
        (password-change-required), regardless of what account it might
        otherwise have resolved to.
        """
        response = api_client.get(_ME, headers={"Authorization": "Bearer not-a-real-token"})

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_logout_is_also_blocked_pending_a_forced_password_change(
        self, api_client: TestClient, db_session: Session
    ) -> None:
        """FR-015's wording ("any authenticated request other than the
        password-change endpoint") carves out no exception for logout, even
        though letting a locked-out user simply walk away might seem
        harmless — `auth.router.logout` uses the same `get_current_user`
        dependency as everything else, so it is blocked exactly like
        `TestForcedPasswordChangeFlow`'s other cross-module case
        (`POST /listings`), with no logout-specific code aware of
        `must_change_password` either.
        """
        email = "forced-change-logout@example.com"
        token = register_and_login(api_client, email)
        _force_password_change(db_session, email)

        response = api_client.post(_LOGOUT, headers=auth_headers(token))

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    def test_public_listing_detail_is_not_blocked_by_a_pending_password_change(
        self, api_client: TestClient, db_session: Session
    ) -> None:
        """Documented interpretation (see IMPLEMENTATION_SUMMARY.md): FR-015
        applies to `get_current_user`, not `get_current_user_optional` —
        a `must_change_password` account can still view public listing
        content, exactly as a guest could, rather than seeing *worse*
        availability than an anonymous visitor on a page with no mutating
        capability to begin with.
        """
        owner_email = "forced-change-listing-owner@example.com"
        owner_token = register_and_login(api_client, owner_email)
        listing = api_client.post(
            _LISTINGS,
            json={
                "title": "Still Viewable",
                "author": "Someone",
                "description": "N/A",
                "category": "fiction",
                "condition": "good",
                "price": 5.00,
            },
            headers=auth_headers(owner_token),
        ).json()

        viewer_email = "forced-change-listing-viewer@example.com"
        viewer_token = register_and_login(api_client, viewer_email)
        _force_password_change(db_session, viewer_email)

        response = api_client.get(
            f"{_LISTINGS}/{listing['id']}", headers=auth_headers(viewer_token)
        )

        assert response.status_code == 200
