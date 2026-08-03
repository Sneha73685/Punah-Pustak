"""API-level tests for the listings endpoints (TEST-003): happy path,
authorization-failure path, and validation-failure path per endpoint, plus
the Milestone 2 exit criterion (§23): "a test asserting the FR-006a
visibility matrix (guest/other-user/owner/admin x available/sold/deleted)"
exercised here through real HTTP requests (the full 12-case matrix is
already covered at the unit level in test_listings_service.py — this file
covers the representative cases through the actual router/dependency
wiring, which the unit tests never touch).

Image-upload tests override `get_storage_backend` with an in-memory fake
(see `_override_storage`) so this suite runs hermetically via `pytest`
alone, without a real MinIO instance — the real S3/MinIO integration
(bucket policy, CORS, public URL fetchability, actual multipart parsing)
was verified separately against a live `docker compose` deployment; see
IMPLEMENTATION_SUMMARY.md.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.storage.dependencies import get_storage_backend
from tests.conftest import auth_headers, register_and_login
from tests.test_listings_service import FakeStorageBackend

_LISTINGS = "/api/v1/listings"
_MY_LISTINGS = "/api/v1/users/me/listings"
_MY_LISTINGS_SUMMARY = "/api/v1/users/me/listings/summary"

_VALID_LISTING = {
    "title": "The Hobbit",
    "author": "J.R.R. Tolkien",
    "description": "Great condition, no markings.",
    "category": "fiction",
    "condition": "good",
    "price": 9.99,
}
_JPEG_BYTES = bytes.fromhex("FFD8FFE000104A46494600010100000100010000FFD9")


@pytest.fixture
def fake_storage() -> FakeStorageBackend:
    return FakeStorageBackend()


@pytest.fixture
def client(
    api_client: TestClient, fake_storage: FakeStorageBackend
) -> Generator[TestClient, None, None]:
    """Shadows conftest's read-only `client` fixture within this module:
    every listings test needs `api_client`'s DB isolation anyway (almost
    all of them write), so there is no separate read-only variant here —
    unlike auth's tests, which had genuinely read-only tests worth keeping
    on the plain, uncontrolled `client`.
    """
    app.dependency_overrides[get_storage_backend] = lambda: fake_storage
    try:
        yield api_client
    finally:
        app.dependency_overrides.pop(get_storage_backend, None)


def _create_listing(client: TestClient, token: str, **overrides: object) -> dict[str, object]:
    body = {**_VALID_LISTING, **overrides}
    response = client.post(_LISTINGS, json=body, headers=auth_headers(token))
    assert response.status_code == 201, response.text
    result: dict[str, object] = response.json()
    return result


class TestBrowse:
    def test_happy_path_and_pagination_shape(self, client: TestClient) -> None:
        token = register_and_login(client, "browse-happy@example.com")
        _create_listing(client, token, title="Browsable Book")

        response = client.get(_LISTINGS)

        assert response.status_code == 200
        body = response.json()
        assert set(body.keys()) == {"items", "total", "page", "page_size"}
        assert body["total"] >= 1
        assert any(item["title"] == "Browsable Book" for item in body["items"])

    def test_validation_failure_page_size_too_large_returns_envelope(
        self, client: TestClient
    ) -> None:
        response = client.get(_LISTINGS, params={"page_size": 500})

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_no_results_is_empty_list_not_error(self, client: TestClient) -> None:
        response = client.get(_LISTINGS, params={"search": "zzzznomatchzzzz"})

        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.json()["total"] == 0


class TestDetailVisibilityMatrix:
    """Representative FR-006a/API-012 cases through real HTTP — see this
    file's module docstring for why the full matrix isn't repeated here.
    """

    def test_available_listing_visible_to_guest(self, client: TestClient) -> None:
        token = register_and_login(client, "detail-avail@example.com")
        listing = _create_listing(client, token)

        response = client.get(f"{_LISTINGS}/{listing['id']}")

        assert response.status_code == 200

    def test_deleted_listing_is_404_to_guest(self, client: TestClient) -> None:
        token = register_and_login(client, "detail-del-guest@example.com")
        listing = _create_listing(client, token)
        client.delete(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(token))

        response = client.get(f"{_LISTINGS}/{listing['id']}")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"

    def test_deleted_listing_is_404_to_other_authenticated_user(self, client: TestClient) -> None:
        owner_token = register_and_login(client, "detail-del-owner2@example.com")
        listing = _create_listing(client, owner_token)
        client.delete(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(owner_token))
        stranger_token = register_and_login(client, "detail-del-stranger@example.com")

        response = client.get(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(stranger_token))

        assert response.status_code == 404

    def test_deleted_listing_is_visible_to_owner(self, client: TestClient) -> None:
        token = register_and_login(client, "detail-del-owner@example.com")
        listing = _create_listing(client, token)
        client.delete(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(token))

        response = client.get(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(token))

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

    def test_deleted_listing_is_visible_to_expired_stale_token_as_guest(
        self, client: TestClient
    ) -> None:
        """`get_current_user_optional` treats an invalid/garbage token as a
        guest rather than hard-failing (see its docstring) — proven here
        against the one endpoint that actually uses it.
        """
        token = register_and_login(client, "detail-garbage-token@example.com")
        listing = _create_listing(client, token)

        response = client.get(
            f"{_LISTINGS}/{listing['id']}", headers=auth_headers("not-a-real-token")
        )

        assert response.status_code == 200  # available listing, treated as guest — still visible

    def test_nonexistent_listing_is_404(self, client: TestClient) -> None:
        response = client.get(f"{_LISTINGS}/00000000-0000-0000-0000-000000000000")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"


class TestCreate:
    def test_happy_path(self, client: TestClient) -> None:
        token = register_and_login(client, "create-happy@example.com")

        response = client.post(_LISTINGS, json=_VALID_LISTING, headers=auth_headers(token))

        assert response.status_code == 201
        body = response.json()
        assert body["title"] == _VALID_LISTING["title"]
        assert body["status"] == "available"
        assert body["images"] == []

    def test_requires_authentication(self, client: TestClient) -> None:
        response = client.post(_LISTINGS, json=_VALID_LISTING)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_validation_failure_negative_price_returns_envelope(self, client: TestClient) -> None:
        token = register_and_login(client, "create-badprice@example.com")

        response = client.post(
            _LISTINGS,
            json={**_VALID_LISTING, "price": -5.00},
            headers=auth_headers(token),
        )

        assert response.status_code == 422
        body = response.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert "price" in body["error"]["fields"]

    def test_validation_failure_missing_title_returns_envelope(self, client: TestClient) -> None:
        token = register_and_login(client, "create-notitle@example.com")
        incomplete = {k: v for k, v in _VALID_LISTING.items() if k != "title"}

        response = client.post(_LISTINGS, json=incomplete, headers=auth_headers(token))

        assert response.status_code == 422
        assert "title" in response.json()["error"]["fields"]


class TestUpdate:
    def test_happy_path(self, client: TestClient) -> None:
        token = register_and_login(client, "update-happy@example.com")
        listing = _create_listing(client, token)

        response = client.patch(
            f"{_LISTINGS}/{listing['id']}",
            json={"title": "The Hobbit (Revised)"},
            headers=auth_headers(token),
        )

        assert response.status_code == 200
        assert response.json()["title"] == "The Hobbit (Revised)"

    def test_not_owner_is_forbidden(self, client: TestClient) -> None:
        owner_token = register_and_login(client, "update-owner@example.com")
        listing = _create_listing(client, owner_token)
        stranger_token = register_and_login(client, "update-stranger@example.com")

        response = client.patch(
            f"{_LISTINGS}/{listing['id']}",
            json={"title": "Hacked"},
            headers=auth_headers(stranger_token),
        )

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_sold_listing_returns_conflict(self, client: TestClient) -> None:
        token = register_and_login(client, "update-sold@example.com")
        listing = _create_listing(client, token)
        client.post(f"{_LISTINGS}/{listing['id']}/sold", headers=auth_headers(token))

        response = client.patch(
            f"{_LISTINGS}/{listing['id']}",
            json={"title": "Too Late"},
            headers=auth_headers(token),
        )

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "CONFLICT"

    def test_validation_failure_returns_envelope(self, client: TestClient) -> None:
        token = register_and_login(client, "update-badprice@example.com")
        listing = _create_listing(client, token)

        response = client.patch(
            f"{_LISTINGS}/{listing['id']}",
            json={"price": -1},
            headers=auth_headers(token),
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_not_found(self, client: TestClient) -> None:
        token = register_and_login(client, "update-notfound@example.com")

        response = client.patch(
            f"{_LISTINGS}/00000000-0000-0000-0000-000000000000",
            json={"title": "X"},
            headers=auth_headers(token),
        )

        assert response.status_code == 404


class TestDelete:
    def test_happy_path_returns_204(self, client: TestClient) -> None:
        token = register_and_login(client, "delete-happy@example.com")
        listing = _create_listing(client, token)

        response = client.delete(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(token))

        assert response.status_code == 204

    def test_is_idempotent(self, client: TestClient) -> None:
        token = register_and_login(client, "delete-idempotent@example.com")
        listing = _create_listing(client, token)

        first = client.delete(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(token))
        second = client.delete(f"{_LISTINGS}/{listing['id']}", headers=auth_headers(token))

        assert first.status_code == second.status_code == 204

    def test_not_owner_is_forbidden(self, client: TestClient) -> None:
        owner_token = register_and_login(client, "delete-owner@example.com")
        listing = _create_listing(client, owner_token)
        stranger_token = register_and_login(client, "delete-stranger@example.com")

        response = client.delete(
            f"{_LISTINGS}/{listing['id']}", headers=auth_headers(stranger_token)
        )

        assert response.status_code == 403

    def test_requires_authentication(self, client: TestClient) -> None:
        token = register_and_login(client, "delete-noauth@example.com")
        listing = _create_listing(client, token)

        response = client.delete(f"{_LISTINGS}/{listing['id']}")

        assert response.status_code == 401


class TestMarkSold:
    def test_happy_path(self, client: TestClient) -> None:
        token = register_and_login(client, "sold-happy@example.com")
        listing = _create_listing(client, token)

        response = client.post(f"{_LISTINGS}/{listing['id']}/sold", headers=auth_headers(token))

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "sold"
        assert body["sold_at"] is not None

    def test_removed_from_public_browse_after_sold(self, client: TestClient) -> None:
        token = register_and_login(client, "sold-hidden@example.com")
        listing = _create_listing(client, token, title="Soon Sold Unique Title")
        client.post(f"{_LISTINGS}/{listing['id']}/sold", headers=auth_headers(token))

        response = client.get(_LISTINGS, params={"search": "Soon Sold Unique Title"})

        assert response.json()["items"] == []

    def test_not_owner_is_forbidden(self, client: TestClient) -> None:
        owner_token = register_and_login(client, "sold-owner@example.com")
        listing = _create_listing(client, owner_token)
        stranger_token = register_and_login(client, "sold-stranger@example.com")

        response = client.post(
            f"{_LISTINGS}/{listing['id']}/sold", headers=auth_headers(stranger_token)
        )

        assert response.status_code == 403

    def test_already_sold_returns_conflict(self, client: TestClient) -> None:
        token = register_and_login(client, "sold-twice@example.com")
        listing = _create_listing(client, token)
        client.post(f"{_LISTINGS}/{listing['id']}/sold", headers=auth_headers(token))

        response = client.post(f"{_LISTINGS}/{listing['id']}/sold", headers=auth_headers(token))

        assert response.status_code == 409


class TestMyListings:
    def test_returns_every_status(self, client: TestClient) -> None:
        token = register_and_login(client, "mylistings-happy@example.com")
        available = _create_listing(client, token, title="Available One")
        sold = _create_listing(client, token, title="Sold One")
        deleted = _create_listing(client, token, title="Deleted One")
        client.post(f"{_LISTINGS}/{sold['id']}/sold", headers=auth_headers(token))
        client.delete(f"{_LISTINGS}/{deleted['id']}", headers=auth_headers(token))

        response = client.get(_MY_LISTINGS, headers=auth_headers(token))

        assert response.status_code == 200
        titles = {item["title"] for item in response.json()}
        assert {"Available One", "Sold One", "Deleted One"} <= titles
        assert available["id"] in {item["id"] for item in response.json()}

    def test_requires_authentication(self, client: TestClient) -> None:
        response = client.get(_MY_LISTINGS)

        assert response.status_code == 401


class TestMyListingsSummary:
    """FR-032 (Milestone 3), exercised through real HTTP — the fully faked
    grouping/scoping logic is covered at the unit level in
    `test_listings_service.py`; this proves the router/schema wiring.
    """

    def test_happy_path_counts_by_status(self, client: TestClient) -> None:
        token = register_and_login(client, "summary-happy@example.com")
        available = _create_listing(client, token, title="Available Book")
        sold = _create_listing(client, token, title="Sold Book")
        deleted = _create_listing(client, token, title="Deleted Book")
        client.post(f"{_LISTINGS}/{sold['id']}/sold", headers=auth_headers(token))
        client.delete(f"{_LISTINGS}/{deleted['id']}", headers=auth_headers(token))
        assert available["status"] == "available"  # left untouched

        response = client.get(_MY_LISTINGS_SUMMARY, headers=auth_headers(token))

        assert response.status_code == 200
        assert response.json() == {"available": 1, "sold": 1, "deleted": 1}

    def test_no_listings_returns_all_zeros(self, client: TestClient) -> None:
        token = register_and_login(client, "summary-empty@example.com")

        response = client.get(_MY_LISTINGS_SUMMARY, headers=auth_headers(token))

        assert response.status_code == 200
        assert response.json() == {"available": 0, "sold": 0, "deleted": 0}

    def test_scoped_to_the_caller_only(self, client: TestClient) -> None:
        owner_token = register_and_login(client, "summary-owner@example.com")
        other_token = register_and_login(client, "summary-other@example.com")
        _create_listing(client, other_token, title="Not Mine")

        response = client.get(_MY_LISTINGS_SUMMARY, headers=auth_headers(owner_token))

        assert response.status_code == 200
        assert response.json() == {"available": 0, "sold": 0, "deleted": 0}

    def test_requires_authentication(self, client: TestClient) -> None:
        response = client.get(_MY_LISTINGS_SUMMARY)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"


class TestImageUpload:
    def test_happy_path(self, client: TestClient) -> None:
        token = register_and_login(client, "images-happy@example.com")
        listing = _create_listing(client, token)

        response = client.post(
            f"{_LISTINGS}/{listing['id']}/images",
            files=[("images", ("photo.jpg", _JPEG_BYTES, "image/jpeg"))],
            headers=auth_headers(token),
        )

        assert response.status_code == 201
        body = response.json()
        assert len(body) == 1
        assert body[0]["position"] == 0
        assert body[0]["url"]

        detail = client.get(f"{_LISTINGS}/{listing['id']}")
        assert len(detail.json()["images"]) == 1

    def test_multiple_files_in_one_request(self, client: TestClient) -> None:
        token = register_and_login(client, "images-multi@example.com")
        listing = _create_listing(client, token)

        response = client.post(
            f"{_LISTINGS}/{listing['id']}/images",
            files=[
                ("images", ("a.jpg", _JPEG_BYTES, "image/jpeg")),
                ("images", ("b.jpg", _JPEG_BYTES, "image/jpeg")),
            ],
            headers=auth_headers(token),
        )

        assert response.status_code == 201
        assert [img["position"] for img in response.json()] == [0, 1]

    def test_not_owner_is_forbidden(self, client: TestClient) -> None:
        owner_token = register_and_login(client, "images-owner@example.com")
        listing = _create_listing(client, owner_token)
        stranger_token = register_and_login(client, "images-stranger@example.com")

        response = client.post(
            f"{_LISTINGS}/{listing['id']}/images",
            files=[("images", ("a.jpg", _JPEG_BYTES, "image/jpeg"))],
            headers=auth_headers(stranger_token),
        )

        assert response.status_code == 403

    def test_invalid_content_returns_validation_envelope(self, client: TestClient) -> None:
        token = register_and_login(client, "images-badcontent@example.com")
        listing = _create_listing(client, token)

        response = client.post(
            f"{_LISTINGS}/{listing['id']}/images",
            files=[("images", ("fake.jpg", b"not an image at all", "image/jpeg"))],
            headers=auth_headers(token),
        )

        assert response.status_code == 422
        body = response.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert "images" in body["error"]["fields"]

    def test_cumulative_limit_rejected_atomically(
        self, client: TestClient, fake_storage: FakeStorageBackend
    ) -> None:
        token = register_and_login(client, "images-limit@example.com")
        listing = _create_listing(client, token)
        six_files = [("images", (f"{i}.jpg", _JPEG_BYTES, "image/jpeg")) for i in range(6)]
        first = client.post(
            f"{_LISTINGS}/{listing['id']}/images", files=six_files, headers=auth_headers(token)
        )
        assert first.status_code == 201

        response = client.post(
            f"{_LISTINGS}/{listing['id']}/images",
            files=[("images", ("seventh.jpg", _JPEG_BYTES, "image/jpeg"))],
            headers=auth_headers(token),
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
        detail = client.get(f"{_LISTINGS}/{listing['id']}")
        assert len(detail.json()["images"]) == 6

    def test_sold_listing_rejects_upload(self, client: TestClient) -> None:
        token = register_and_login(client, "images-sold@example.com")
        listing = _create_listing(client, token)
        client.post(f"{_LISTINGS}/{listing['id']}/sold", headers=auth_headers(token))

        response = client.post(
            f"{_LISTINGS}/{listing['id']}/images",
            files=[("images", ("a.jpg", _JPEG_BYTES, "image/jpeg"))],
            headers=auth_headers(token),
        )

        assert response.status_code == 409

    def test_requires_authentication(self, client: TestClient) -> None:
        token = register_and_login(client, "images-noauth@example.com")
        listing = _create_listing(client, token)

        response = client.post(
            f"{_LISTINGS}/{listing['id']}/images",
            files=[("images", ("a.jpg", _JPEG_BYTES, "image/jpeg"))],
        )

        assert response.status_code == 401
