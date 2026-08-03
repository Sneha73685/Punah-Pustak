"""API-level tests for the admin endpoints (TEST-003): happy path,
authorization-failure path, and validation-failure path per endpoint.

Also the direct exercise of the Milestone 4 exit criterion (SRS §23):
"§7.5 and UC-6/UC-7 pass with tests; audit trail verified for all admin
action types" — `TestAuditTrail` queries `AdminAction` directly after
driving all four action types through the real endpoints. `TestSuspendUser`
additionally demonstrates SEC-025's "bounded-immediate, not instantaneous"
suspension semantics end-to-end: refresh/login block immediately, but an
already-issued access token keeps working until its own natural expiry.

There is no self-service way to create an admin account (by design — see
`app.modules.users.repository.UserRepository.create`, which always sets
`role=RoleEnum.USER`), so `_make_admin` promotes a normally-registered user
by writing directly to `db_session`, the same pattern
`test_users_api.py::_force_password_change` already established for
"state with no self-service API path."
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.modules.admin.models import AdminAction, AdminActionTypeEnum, AdminTargetTypeEnum
from app.modules.storage.dependencies import get_storage_backend
from app.modules.users.models import RoleEnum, User
from tests.conftest import auth_headers, register_and_login
from tests.test_listings_service import FakeStorageBackend

_ADMIN_USERS = "/api/v1/admin/users"
_ADMIN_LISTINGS = "/api/v1/admin/listings"
_LISTINGS = "/api/v1/listings"
_ME = "/api/v1/users/me"
_LOGIN = "/api/v1/auth/login"
_REFRESH = "/api/v1/auth/refresh"
_PASSWORD_CHANGE = "/api/v1/users/me/password"

_PASSWORD = "a-long-enough-password"

_VALID_LISTING = {
    "title": "A Book",
    "author": "An Author",
    "description": "A description.",
    "category": "fiction",
    "condition": "good",
    "price": 9.99,
}


@pytest.fixture
def fake_storage() -> FakeStorageBackend:
    return FakeStorageBackend()


@pytest.fixture
def client(
    api_client: TestClient, fake_storage: FakeStorageBackend
) -> Generator[TestClient, None, None]:
    """Mirrors `test_listings_api.py`'s `client` fixture: admin's own
    endpoints construct a `ListingService` under the hood (via
    `build_admin_service`) even where a given test never touches images.
    """
    app.dependency_overrides[get_storage_backend] = lambda: fake_storage
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_storage_backend, None)


def _make_admin(db_session: Session, client: TestClient, email: str) -> str:
    """Registers + logs in a normal account, then promotes it to admin
    directly via `db_session` (see module docstring), returning its access
    token.
    """
    token = register_and_login(client, email)
    user = db_session.query(User).filter(User.email == email).one()
    user.role = RoleEnum.ADMIN
    db_session.flush()
    return token


class TestListUsers:
    def test_happy_path(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "list-users-admin@example.com")
        register_and_login(client, "list-users-target@example.com")

        response = client.get(_ADMIN_USERS, headers=auth_headers(admin_token))

        assert response.status_code == 200
        body = response.json()
        assert set(body.keys()) == {"items", "total", "page", "page_size"}
        emails = {item["email"] for item in body["items"]}
        assert "list-users-admin@example.com" in emails
        assert "list-users-target@example.com" in emails
        # FR-040: email, display name, created date, status.
        sample = body["items"][0]
        assert {"id", "email", "display_name", "created_at", "is_active"} <= set(sample.keys())
        assert "password_hash" not in sample

    def test_non_admin_is_forbidden(self, client: TestClient) -> None:
        token = register_and_login(client, "not-an-admin@example.com")

        response = client.get(_ADMIN_USERS, headers=auth_headers(token))

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_requires_authentication(self, client: TestClient) -> None:
        response = client.get(_ADMIN_USERS)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_validation_failure_page_size_too_large_returns_envelope(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "list-users-invalid-admin@example.com")

        response = client.get(
            _ADMIN_USERS, params={"page_size": 500}, headers=auth_headers(admin_token)
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


class TestSuspendUser:
    def test_happy_path(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "suspend-admin@example.com")
        target_email = "suspend-target@example.com"
        target_token = register_and_login(client, target_email)
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]

        response = client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={"reason_code": "abusive-behavior"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        assert response.json()["is_active"] is False

    def test_suspended_user_cannot_log_in_again(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "suspend-login-admin@example.com")
        target_email = "suspend-login-target@example.com"
        target_token = register_and_login(client, target_email)
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]

        client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )

        login_attempt = client.post(_LOGIN, json={"email": target_email, "password": _PASSWORD})
        assert login_attempt.status_code == 401
        assert login_attempt.json()["error"]["code"] == "INVALID_CREDENTIALS"

    def test_suspended_users_refresh_token_is_immediately_revoked(
        self, client: TestClient, db_session: Session
    ) -> None:
        """SEC-025: "immediately revoke all of that user's RefreshToken
        rows, preventing any further token refresh." The target's refresh
        cookie was set on `client` by `register_and_login`'s login call —
        still present after the admin (a *different* login on the same
        shared `client`/cookie-jar) acts, since `TestClient` persists
        cookies per path and this cookie is scoped to `/api/v1/auth`
        regardless of which account most recently logged in.
        """
        admin_token = _make_admin(db_session, client, "suspend-refresh-admin@example.com")
        target_email = "suspend-refresh-target@example.com"
        target_token = register_and_login(client, target_email)
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]
        target_refresh_cookie = client.cookies.get("refresh_token")
        assert target_refresh_cookie is not None

        client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )

        client.cookies.set("refresh_token", target_refresh_cookie)
        refresh_attempt = client.post(_REFRESH)
        assert refresh_attempt.status_code == 401
        assert refresh_attempt.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"

    def test_suspension_is_bounded_immediate_not_instantaneous(
        self, client: TestClient, db_session: Session
    ) -> None:
        """SEC-025's explicit, accepted trade-off, demonstrated directly:
        the target's *already-issued access token* (obtained before
        suspension) MUST remain valid and continue authenticating normal
        requests after suspension — only login/refresh are immediately
        blocked. True per-request revocation was deliberately rejected by
        the SRS ("would reintroduce the statefulness JWTs exist to avoid").
        """
        admin_token = _make_admin(db_session, client, "bounded-admin@example.com")
        target_email = "bounded-target@example.com"
        target_token = register_and_login(client, target_email)
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]

        client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )

        still_works = client.get(_ME, headers=auth_headers(target_token))
        assert still_works.status_code == 200
        assert still_works.json()["email"] == target_email

    def test_admin_target_is_forbidden(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "suspend-self-admin@example.com")
        other_admin_token = _make_admin(db_session, client, "suspend-other-admin@example.com")
        other_admin_id = client.get(_ME, headers=auth_headers(other_admin_token)).json()["id"]

        response = client.post(
            f"{_ADMIN_USERS}/{other_admin_id}/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_already_suspended_is_conflict(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "suspend-twice-admin@example.com")
        target_token = register_and_login(client, "suspend-twice-target@example.com")
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]
        client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )

        response = client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={"reason_code": "abuse-again"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "CONFLICT"

    def test_nonexistent_target_is_not_found(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "suspend-404-admin@example.com")

        response = client.post(
            f"{_ADMIN_USERS}/00000000-0000-0000-0000-000000000000/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"

    def test_missing_reason_code_returns_validation_envelope(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "suspend-no-reason-admin@example.com")
        target_token = register_and_login(client, "suspend-no-reason-target@example.com")
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]

        response = client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_non_admin_is_forbidden(self, client: TestClient) -> None:
        token = register_and_login(client, "suspend-not-admin@example.com")

        response = client.post(
            f"{_ADMIN_USERS}/00000000-0000-0000-0000-000000000000/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(token),
        )

        assert response.status_code == 403


class TestReinstateUser:
    def test_happy_path_allows_login_again(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "reinstate-admin@example.com")
        target_email = "reinstate-target@example.com"
        target_token = register_and_login(client, target_email)
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]
        client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )

        response = client.post(
            f"{_ADMIN_USERS}/{target_id}/reinstate", headers=auth_headers(admin_token)
        )

        assert response.status_code == 200
        assert response.json()["is_active"] is True
        login_again = client.post(_LOGIN, json={"email": target_email, "password": _PASSWORD})
        assert login_again.status_code == 200

    def test_admin_target_is_forbidden(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "reinstate-self-admin@example.com")
        other_admin_token = _make_admin(db_session, client, "reinstate-other-admin@example.com")
        other_admin_id = client.get(_ME, headers=auth_headers(other_admin_token)).json()["id"]

        response = client.post(
            f"{_ADMIN_USERS}/{other_admin_id}/reinstate", headers=auth_headers(admin_token)
        )

        assert response.status_code == 403

    def test_already_active_is_conflict(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "reinstate-active-admin@example.com")
        target_token = register_and_login(client, "reinstate-active-target@example.com")
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]

        response = client.post(
            f"{_ADMIN_USERS}/{target_id}/reinstate", headers=auth_headers(admin_token)
        )

        assert response.status_code == 409

    def test_nonexistent_target_is_not_found(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "reinstate-404-admin@example.com")

        response = client.post(
            f"{_ADMIN_USERS}/00000000-0000-0000-0000-000000000000/reinstate",
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404

    def test_non_admin_is_forbidden(self, client: TestClient) -> None:
        token = register_and_login(client, "reinstate-not-admin@example.com")

        response = client.post(
            f"{_ADMIN_USERS}/00000000-0000-0000-0000-000000000000/reinstate",
            headers=auth_headers(token),
        )

        assert response.status_code == 403


class TestResetPassword:
    def test_happy_path_returned_password_works_and_forces_change(
        self, client: TestClient, db_session: Session
    ) -> None:
        """Full Milestone 3 + Milestone 4 integration: the returned
        temporary password lets the target log in, and FR-015's forced
        -change gate (Milestone 3) immediately blocks them until they
        change it — exactly §8.5's account-recovery flow end-to-end.
        """
        admin_token = _make_admin(db_session, client, "reset-admin@example.com")
        target_email = "reset-target@example.com"
        target_token = register_and_login(client, target_email)
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]

        response = client.post(
            f"{_ADMIN_USERS}/{target_id}/reset-password", headers=auth_headers(admin_token)
        )
        assert response.status_code == 200
        temporary_password = response.json()["temporary_password"]
        assert len(temporary_password) >= 16

        login_with_temp = client.post(
            _LOGIN, json={"email": target_email, "password": temporary_password}
        )
        assert login_with_temp.status_code == 200
        new_access_token = login_with_temp.json()["access_token"]

        blocked = client.get(_ME, headers=auth_headers(new_access_token))
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

        changed = client.post(
            _PASSWORD_CHANGE,
            json={"current_password": temporary_password, "new_password": "a-brand-new-password"},
            headers=auth_headers(new_access_token),
        )
        assert changed.status_code == 204
        resumed = client.get(_ME, headers=auth_headers(new_access_token))
        assert resumed.status_code == 200

    def test_old_password_no_longer_works_after_reset(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "reset-old-pw-admin@example.com")
        target_email = "reset-old-pw-target@example.com"
        target_token = register_and_login(client, target_email)
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]

        client.post(f"{_ADMIN_USERS}/{target_id}/reset-password", headers=auth_headers(admin_token))

        old_password_login = client.post(
            _LOGIN, json={"email": target_email, "password": _PASSWORD}
        )
        assert old_password_login.status_code == 401

    def test_admin_target_is_forbidden(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "reset-self-admin@example.com")
        other_admin_token = _make_admin(db_session, client, "reset-other-admin@example.com")
        other_admin_id = client.get(_ME, headers=auth_headers(other_admin_token)).json()["id"]

        response = client.post(
            f"{_ADMIN_USERS}/{other_admin_id}/reset-password", headers=auth_headers(admin_token)
        )

        assert response.status_code == 403

    def test_nonexistent_target_is_not_found(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "reset-404-admin@example.com")

        response = client.post(
            f"{_ADMIN_USERS}/00000000-0000-0000-0000-000000000000/reset-password",
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404

    def test_non_admin_is_forbidden(self, client: TestClient) -> None:
        token = register_and_login(client, "reset-not-admin@example.com")

        response = client.post(
            f"{_ADMIN_USERS}/00000000-0000-0000-0000-000000000000/reset-password",
            headers=auth_headers(token),
        )

        assert response.status_code == 403


class TestListListings:
    def test_happy_path_returns_any_status(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "list-listings-admin@example.com")
        seller_token = register_and_login(client, "list-listings-seller@example.com")
        available = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(seller_token)
        ).json()
        sold = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(seller_token)
        ).json()
        client.post(f"{_LISTINGS}/{sold['id']}/sold", headers=auth_headers(seller_token))

        response = client.get(_ADMIN_LISTINGS, headers=auth_headers(admin_token))

        assert response.status_code == 200
        ids = {item["id"] for item in response.json()["items"]}
        assert available["id"] in ids
        assert sold["id"] in ids

    def test_status_filter(self, client: TestClient, db_session: Session) -> None:
        admin_token = _make_admin(db_session, client, "list-listings-filter-admin@example.com")
        seller_token = register_and_login(client, "list-listings-filter-seller@example.com")
        available = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(seller_token)
        ).json()
        sold = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(seller_token)
        ).json()
        client.post(f"{_LISTINGS}/{sold['id']}/sold", headers=auth_headers(seller_token))

        response = client.get(
            _ADMIN_LISTINGS, params={"status": "sold"}, headers=auth_headers(admin_token)
        )

        ids = {item["id"] for item in response.json()["items"]}
        assert sold["id"] in ids
        assert available["id"] not in ids

    def test_includes_suspended_sellers_listings(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "list-listings-suspended-admin@example.com")
        seller_token = register_and_login(client, "list-listings-suspended-seller@example.com")
        seller_id = client.get(_ME, headers=auth_headers(seller_token)).json()["id"]
        listing = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(seller_token)
        ).json()
        client.post(
            f"{_ADMIN_USERS}/{seller_id}/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )

        response = client.get(_ADMIN_LISTINGS, headers=auth_headers(admin_token))

        ids = {item["id"] for item in response.json()["items"]}
        assert listing["id"] in ids

    def test_non_admin_is_forbidden(self, client: TestClient) -> None:
        token = register_and_login(client, "list-listings-not-admin@example.com")

        response = client.get(_ADMIN_LISTINGS, headers=auth_headers(token))

        assert response.status_code == 403

    def test_requires_authentication(self, client: TestClient) -> None:
        response = client.get(_ADMIN_LISTINGS)

        assert response.status_code == 401

    def test_validation_failure_page_size_too_large_returns_envelope(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "list-listings-invalid-admin@example.com")

        response = client.get(
            _ADMIN_LISTINGS, params={"page_size": 500}, headers=auth_headers(admin_token)
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_validation_failure_invalid_status_returns_envelope(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(
            db_session, client, "list-listings-invalid-status-admin@example.com"
        )

        response = client.get(
            _ADMIN_LISTINGS,
            params={"status": "not-a-real-status"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


class TestRemoveListing:
    def test_happy_path_removes_from_public_browse(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "remove-admin@example.com")
        seller_token = register_and_login(client, "remove-seller@example.com")
        listing = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(seller_token)
        ).json()

        response = client.delete(
            f"{_ADMIN_LISTINGS}/{listing['id']}",
            params={"reason_code": "counterfeit"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 204
        browse = client.get(_LISTINGS)
        assert listing["id"] not in {item["id"] for item in browse.json()["items"]}
        # Still visible to the admin, any status:
        admin_view = client.get(_ADMIN_LISTINGS, headers=auth_headers(admin_token))
        removed = next(item for item in admin_view.json()["items"] if item["id"] == listing["id"])
        assert removed["status"] == "deleted"
        # Still visible to its owner (FR-006a):
        detail = client.get(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(seller_token))
        assert detail.status_code == 200

    def test_idempotent_second_removal_returns_204_without_duplicate_audit(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "remove-idempotent-admin@example.com")
        seller_token = register_and_login(client, "remove-idempotent-seller@example.com")
        listing = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(seller_token)
        ).json()
        client.delete(
            f"{_ADMIN_LISTINGS}/{listing['id']}",
            params={"reason_code": "counterfeit"},
            headers=auth_headers(admin_token),
        )

        second = client.delete(
            f"{_ADMIN_LISTINGS}/{listing['id']}",
            params={"reason_code": "counterfeit-again"},
            headers=auth_headers(admin_token),
        )

        assert second.status_code == 204
        audit_rows = (
            db_session.query(AdminAction)
            .filter(
                AdminAction.target_type == AdminTargetTypeEnum.LISTING,
                AdminAction.target_id == listing["id"],
            )
            .all()
        )
        assert len(audit_rows) == 1  # FR-029: no duplicate audit entry

    def test_nonexistent_listing_is_not_found(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "remove-404-admin@example.com")

        response = client.delete(
            f"{_ADMIN_LISTINGS}/00000000-0000-0000-0000-000000000000",
            params={"reason_code": "counterfeit"},
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404

    def test_missing_reason_code_returns_validation_envelope(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "remove-no-reason-admin@example.com")
        seller_token = register_and_login(client, "remove-no-reason-seller@example.com")
        listing = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(seller_token)
        ).json()

        response = client.delete(
            f"{_ADMIN_LISTINGS}/{listing['id']}",
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_non_admin_is_forbidden(self, client: TestClient) -> None:
        token = register_and_login(client, "remove-not-admin@example.com")

        response = client.delete(
            f"{_ADMIN_LISTINGS}/00000000-0000-0000-0000-000000000000",
            params={"reason_code": "counterfeit"},
            headers=auth_headers(token),
        )

        assert response.status_code == 403


class TestAuditTrail:
    """Milestone 4 exit criterion (§23): "audit trail verified for all
    admin action types." Drives all four `AdminActionTypeEnum` values
    through the real endpoints in one test, then queries `AdminAction`
    directly — there is no API endpoint to list audit records (SEC-050
    deliberately doesn't specify one), so a direct query is the only way
    to verify this, matching the acceptance-criteria wording ("produce a
    queryable AdminAction record").
    """

    def test_all_four_action_types_are_recorded(
        self, client: TestClient, db_session: Session
    ) -> None:
        admin_token = _make_admin(db_session, client, "audit-admin@example.com")
        admin_id = client.get(_ME, headers=auth_headers(admin_token)).json()["id"]
        target_token = register_and_login(client, "audit-target@example.com")
        target_id = client.get(_ME, headers=auth_headers(target_token)).json()["id"]
        listing = client.post(
            _LISTINGS, json=_VALID_LISTING, headers=auth_headers(target_token)
        ).json()

        client.post(
            f"{_ADMIN_USERS}/{target_id}/suspend",
            json={"reason_code": "abuse"},
            headers=auth_headers(admin_token),
        )
        client.post(f"{_ADMIN_USERS}/{target_id}/reinstate", headers=auth_headers(admin_token))
        client.post(f"{_ADMIN_USERS}/{target_id}/reset-password", headers=auth_headers(admin_token))
        client.delete(
            f"{_ADMIN_LISTINGS}/{listing['id']}",
            params={"reason_code": "counterfeit"},
            headers=auth_headers(admin_token),
        )

        rows = db_session.query(AdminAction).filter(AdminAction.admin_id == admin_id).all()
        actions_by_type = {row.action_type: row for row in rows}
        assert set(actions_by_type) == {
            AdminActionTypeEnum.SUSPEND_USER,
            AdminActionTypeEnum.REINSTATE_USER,
            AdminActionTypeEnum.RESET_PASSWORD,
            AdminActionTypeEnum.REMOVE_LISTING,
        }

        # `target_id`/`listing["id"]` are `str` (as JSON gives them back);
        # `row.target_id` is a real `uuid.UUID` (as SQLAlchemy loads it) —
        # `str(...)` on the ORM side for a like-for-like comparison.
        suspend_row = actions_by_type[AdminActionTypeEnum.SUSPEND_USER]
        assert suspend_row.target_type == AdminTargetTypeEnum.USER
        assert str(suspend_row.target_id) == target_id
        assert suspend_row.reason_code == "abuse"
        assert suspend_row.created_at is not None

        reinstate_row = actions_by_type[AdminActionTypeEnum.REINSTATE_USER]
        assert reinstate_row.target_type == AdminTargetTypeEnum.USER
        assert str(reinstate_row.target_id) == target_id
        assert reinstate_row.reason_code is None

        reset_row = actions_by_type[AdminActionTypeEnum.RESET_PASSWORD]
        assert reset_row.target_type == AdminTargetTypeEnum.USER
        assert str(reset_row.target_id) == target_id
        assert reset_row.reason_code is None

        remove_row = actions_by_type[AdminActionTypeEnum.REMOVE_LISTING]
        assert remove_row.target_type == AdminTargetTypeEnum.LISTING
        assert str(remove_row.target_id) == listing["id"]
        assert remove_row.reason_code == "counterfeit"
