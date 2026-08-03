"""Unit tests for `AdminService` (TEST-001): `UserServiceProtocol`,
`ListingServiceProtocol`, `AuthServiceProtocol`, and
`AdminActionRepositoryProtocol` are all faked with plain in-memory
objects — no database, no FastAPI, no HTTP anywhere in this file.

A recurring theme here: `AdminService` is a thin orchestrator, so most of
these tests are about *ordering and side effects* (does a rejected
precondition really produce zero side effects; does the audit log really
get written only when it should) rather than business-rule correctness —
that's already proven directly against `UserService`/`ListingService` in
their own test files.
"""

import uuid

import pytest

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.modules.admin.models import AdminAction, AdminActionTypeEnum, AdminTargetTypeEnum
from app.modules.admin.service import AdminService
from app.modules.listings.models import ListingStatusEnum
from app.modules.listings.repository import Page as ListingPage
from app.modules.users.models import RoleEnum, User
from app.modules.users.repository import Page as UserPage


def _make_user(role: RoleEnum = RoleEnum.USER, is_active: bool = True) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4()}@example.com",
        password_hash="x",
        display_name="Someone",
        role=role,
        is_active=is_active,
        must_change_password=False,
    )


class FakeUserService:
    """Fakes `AdminService`'s `UserServiceProtocol`. Precondition checks
    (admin-target, already-suspended/active) live here, mirroring the real
    `UserService`'s own rules exactly (TEST-001's "fake the collaborator,
    not the business logic under test" — the whole point of these tests is
    to prove `AdminService`'s orchestration around those rules, so the
    fake must enforce them for that orchestration to mean anything).
    """

    def __init__(self, users: list[User] | None = None) -> None:
        self._by_id: dict[uuid.UUID, User] = {u.id: u for u in (users or [])}
        self.suspend_calls: list[uuid.UUID] = []
        self.reinstate_calls: list[uuid.UUID] = []
        self.reset_password_calls: list[uuid.UUID] = []

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._by_id.get(user_id)

    def list_users(self, *, page: int, page_size: int) -> UserPage:
        items = list(self._by_id.values())
        return UserPage(items=items, total=len(items))

    def suspend(self, target: User) -> User:
        self.suspend_calls.append(target.id)
        if target.role == RoleEnum.ADMIN:
            raise ForbiddenError("Admin accounts cannot be suspended.")
        if not target.is_active:
            raise ConflictError("User is already suspended.")
        target.is_active = False
        return target

    def reinstate(self, target: User) -> User:
        self.reinstate_calls.append(target.id)
        if target.role == RoleEnum.ADMIN:
            raise ForbiddenError("Admin accounts cannot be reinstated via this endpoint.")
        if target.is_active:
            raise ConflictError("User is already active.")
        target.is_active = True
        return target

    def reset_password(self, target: User) -> str:
        self.reset_password_calls.append(target.id)
        if target.role == RoleEnum.ADMIN:
            raise ForbiddenError("Cannot reset the password of an admin account.")
        target.must_change_password = True
        return "fake-temporary-password"


class FakeListingService:
    """Fakes `AdminService`'s `ListingServiceProtocol`."""

    def __init__(self) -> None:
        self.existing_listing_ids: set[uuid.UUID] = set()
        self.deleted_listing_ids: set[uuid.UUID] = set()
        self.admin_remove_calls: list[uuid.UUID] = []
        self.admin_list_calls: list[ListingStatusEnum | None] = []

    def admin_list(
        self, *, status: ListingStatusEnum | None, page: int, page_size: int
    ) -> ListingPage:
        self.admin_list_calls.append(status)
        return ListingPage(items=[], total=0)

    def admin_remove(self, listing_id: uuid.UUID) -> bool:
        self.admin_remove_calls.append(listing_id)
        if listing_id not in self.existing_listing_ids:
            raise NotFoundError("Listing not found.")
        if listing_id in self.deleted_listing_ids:
            return False
        self.deleted_listing_ids.add(listing_id)
        return True


class FakeAuthService:
    """Fakes `AdminService`'s `AuthServiceProtocol`."""

    def __init__(self) -> None:
        self.revoked_for: list[uuid.UUID] = []

    def revoke_all_tokens_for_user(self, user_id: uuid.UUID) -> None:
        self.revoked_for.append(user_id)


class FakeAdminActionRepository:
    """Fakes `AdminService`'s `AdminActionRepositoryProtocol`."""

    def __init__(self) -> None:
        self.actions: list[AdminAction] = []

    def create(
        self,
        *,
        admin_id: uuid.UUID,
        action_type: AdminActionTypeEnum,
        target_type: AdminTargetTypeEnum,
        target_id: uuid.UUID,
        reason_code: str | None = None,
    ) -> AdminAction:
        action = AdminAction(
            id=uuid.uuid4(),
            admin_id=admin_id,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            reason_code=reason_code,
        )
        self.actions.append(action)
        return action


def _service(
    *,
    users: FakeUserService | None = None,
    listings: FakeListingService | None = None,
    auth: FakeAuthService | None = None,
    admin_actions: FakeAdminActionRepository | None = None,
) -> AdminService:
    return AdminService(
        users=users or FakeUserService(),
        listings=listings or FakeListingService(),
        auth=auth or FakeAuthService(),
        admin_actions=admin_actions or FakeAdminActionRepository(),
    )


class TestListUsers:
    def test_delegates_to_user_service(self) -> None:
        user = _make_user()
        service = _service(users=FakeUserService([user]))

        page = service.list_users(page=1, page_size=20)

        assert [u.id for u in page.items] == [user.id]


class TestSuspendUser:
    def test_happy_path_revokes_tokens_and_writes_audit(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        target = _make_user()
        users = FakeUserService([admin, target])
        auth = FakeAuthService()
        admin_actions = FakeAdminActionRepository()
        service = _service(users=users, auth=auth, admin_actions=admin_actions)

        updated = service.suspend_user(admin=admin, target_user_id=target.id, reason_code="abuse")

        assert updated.is_active is False
        assert auth.revoked_for == [target.id]
        assert len(admin_actions.actions) == 1
        action = admin_actions.actions[0]
        assert action.admin_id == admin.id
        assert action.action_type == AdminActionTypeEnum.SUSPEND_USER
        assert action.target_type == AdminTargetTypeEnum.USER
        assert action.target_id == target.id
        assert action.reason_code == "abuse"

    def test_target_not_found_raises_before_any_side_effect(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        users = FakeUserService([admin])
        auth = FakeAuthService()
        admin_actions = FakeAdminActionRepository()
        service = _service(users=users, auth=auth, admin_actions=admin_actions)

        with pytest.raises(NotFoundError):
            service.suspend_user(admin=admin, target_user_id=uuid.uuid4(), reason_code="abuse")

        assert auth.revoked_for == []
        assert admin_actions.actions == []

    def test_rejected_precondition_produces_no_side_effects(self) -> None:
        """A rejected `suspend` (admin target, or already suspended) must
        not revoke tokens or write an audit entry — verifying the ordering
        `AdminService.suspend_user`'s own docstring describes.
        """
        admin = _make_user(role=RoleEnum.ADMIN)
        admin_target = _make_user(role=RoleEnum.ADMIN)
        users = FakeUserService([admin, admin_target])
        auth = FakeAuthService()
        admin_actions = FakeAdminActionRepository()
        service = _service(users=users, auth=auth, admin_actions=admin_actions)

        with pytest.raises(ForbiddenError):
            service.suspend_user(admin=admin, target_user_id=admin_target.id, reason_code="abuse")

        assert auth.revoked_for == []
        assert admin_actions.actions == []

    def test_already_suspended_conflict_produces_no_side_effects(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        already_suspended = _make_user(is_active=False)
        users = FakeUserService([admin, already_suspended])
        auth = FakeAuthService()
        admin_actions = FakeAdminActionRepository()
        service = _service(users=users, auth=auth, admin_actions=admin_actions)

        with pytest.raises(ConflictError):
            service.suspend_user(
                admin=admin, target_user_id=already_suspended.id, reason_code="abuse"
            )

        assert auth.revoked_for == []
        assert admin_actions.actions == []


class TestReinstateUser:
    def test_happy_path_writes_audit_with_no_reason_code(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        target = _make_user(is_active=False)
        users = FakeUserService([admin, target])
        admin_actions = FakeAdminActionRepository()
        service = _service(users=users, admin_actions=admin_actions)

        updated = service.reinstate_user(admin=admin, target_user_id=target.id)

        assert updated.is_active is True
        assert len(admin_actions.actions) == 1
        action = admin_actions.actions[0]
        assert action.action_type == AdminActionTypeEnum.REINSTATE_USER
        assert action.reason_code is None

    def test_rejected_precondition_produces_no_audit_entry(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        already_active = _make_user(is_active=True)
        users = FakeUserService([admin, already_active])
        admin_actions = FakeAdminActionRepository()
        service = _service(users=users, admin_actions=admin_actions)

        with pytest.raises(ConflictError):
            service.reinstate_user(admin=admin, target_user_id=already_active.id)

        assert admin_actions.actions == []

    def test_target_not_found_raises(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        service = _service(users=FakeUserService([admin]))

        with pytest.raises(NotFoundError):
            service.reinstate_user(admin=admin, target_user_id=uuid.uuid4())


class TestResetPassword:
    def test_happy_path_returns_temp_password_and_writes_audit(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        target = _make_user()
        users = FakeUserService([admin, target])
        admin_actions = FakeAdminActionRepository()
        service = _service(users=users, admin_actions=admin_actions)

        temporary_password = service.reset_password(admin=admin, target_user_id=target.id)

        assert temporary_password == "fake-temporary-password"
        assert target.must_change_password is True
        assert len(admin_actions.actions) == 1
        action = admin_actions.actions[0]
        assert action.action_type == AdminActionTypeEnum.RESET_PASSWORD
        assert action.target_type == AdminTargetTypeEnum.USER
        assert action.target_id == target.id
        assert action.reason_code is None

    def test_admin_target_forbidden_produces_no_audit_entry(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        admin_target = _make_user(role=RoleEnum.ADMIN)
        users = FakeUserService([admin, admin_target])
        admin_actions = FakeAdminActionRepository()
        service = _service(users=users, admin_actions=admin_actions)

        with pytest.raises(ForbiddenError):
            service.reset_password(admin=admin, target_user_id=admin_target.id)

        assert admin_actions.actions == []

    def test_target_not_found_raises(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        service = _service(users=FakeUserService([admin]))

        with pytest.raises(NotFoundError):
            service.reset_password(admin=admin, target_user_id=uuid.uuid4())


class TestListListings:
    def test_delegates_status_filter_to_listing_service(self) -> None:
        listings = FakeListingService()
        service = _service(listings=listings)

        service.list_listings(status=ListingStatusEnum.SOLD, page=1, page_size=20)

        assert listings.admin_list_calls == [ListingStatusEnum.SOLD]


class TestRemoveListing:
    def test_happy_path_writes_audit(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        listing_id = uuid.uuid4()
        listings = FakeListingService()
        listings.existing_listing_ids.add(listing_id)
        admin_actions = FakeAdminActionRepository()
        service = _service(listings=listings, admin_actions=admin_actions)

        service.remove_listing(admin=admin, listing_id=listing_id, reason_code="counterfeit")

        assert len(admin_actions.actions) == 1
        action = admin_actions.actions[0]
        assert action.action_type == AdminActionTypeEnum.REMOVE_LISTING
        assert action.target_type == AdminTargetTypeEnum.LISTING
        assert action.target_id == listing_id
        assert action.reason_code == "counterfeit"

    def test_idempotent_removal_does_not_duplicate_the_audit_entry(self) -> None:
        """FR-029's admin-specific clause, exercised directly at the
        orchestration layer: removing an already-`deleted` listing a
        second time must produce zero new `AdminAction` rows — this is
        the exact scenario `ListingService.admin_remove`'s `bool` return
        exists to signal.
        """
        admin = _make_user(role=RoleEnum.ADMIN)
        listing_id = uuid.uuid4()
        listings = FakeListingService()
        listings.existing_listing_ids.add(listing_id)
        listings.deleted_listing_ids.add(listing_id)  # already deleted
        admin_actions = FakeAdminActionRepository()
        service = _service(listings=listings, admin_actions=admin_actions)

        service.remove_listing(admin=admin, listing_id=listing_id, reason_code="counterfeit")

        assert admin_actions.actions == []
        assert listings.admin_remove_calls == [listing_id]

    def test_not_found_raises(self) -> None:
        admin = _make_user(role=RoleEnum.ADMIN)
        service = _service(listings=FakeListingService())

        with pytest.raises(NotFoundError):
            service.remove_listing(admin=admin, listing_id=uuid.uuid4(), reason_code="counterfeit")
