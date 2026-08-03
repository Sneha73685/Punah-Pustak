"""Integration tests for `AdminActionRepository` against the real, migrated
Postgres schema (TEST-002) — the audit log itself (SEC-050).
"""

import uuid

from sqlalchemy.orm import Session

from app.modules.admin.models import AdminActionTypeEnum, AdminTargetTypeEnum
from app.modules.admin.repository import AdminActionRepository
from app.modules.users.models import RoleEnum, User
from app.modules.users.repository import UserRepository


def _make_admin(db_session: Session) -> User:
    admin = UserRepository(db_session).create(
        email=f"{uuid.uuid4()}@example.com", password_hash="x", display_name="Admin"
    )
    admin.role = RoleEnum.ADMIN
    db_session.flush()
    return admin


class TestCreate:
    def test_persists_every_field(self, db_session: Session) -> None:
        admin = _make_admin(db_session)
        repo = AdminActionRepository(db_session)
        target_id = uuid.uuid4()

        action = repo.create(
            admin_id=admin.id,
            action_type=AdminActionTypeEnum.SUSPEND_USER,
            target_type=AdminTargetTypeEnum.USER,
            target_id=target_id,
            reason_code="abusive-behavior",
        )

        assert action.id is not None
        assert action.admin_id == admin.id
        assert action.action_type == AdminActionTypeEnum.SUSPEND_USER
        assert action.target_type == AdminTargetTypeEnum.USER
        assert action.target_id == target_id
        assert action.reason_code == "abusive-behavior"
        assert action.created_at is not None

    def test_reason_code_is_nullable(self, db_session: Session) -> None:
        """§10.1: `reason_code` is "not applicable to reset_password" —
        `reinstate_user` also passes `None` (see `AdminService.reinstate_user`).
        """
        admin = _make_admin(db_session)
        repo = AdminActionRepository(db_session)

        action = repo.create(
            admin_id=admin.id,
            action_type=AdminActionTypeEnum.RESET_PASSWORD,
            target_type=AdminTargetTypeEnum.USER,
            target_id=uuid.uuid4(),
        )

        assert action.reason_code is None

    def test_round_trips_a_listing_target(self, db_session: Session) -> None:
        admin = _make_admin(db_session)
        repo = AdminActionRepository(db_session)
        target_id = uuid.uuid4()

        action = repo.create(
            admin_id=admin.id,
            action_type=AdminActionTypeEnum.REMOVE_LISTING,
            target_type=AdminTargetTypeEnum.LISTING,
            target_id=target_id,
            reason_code="counterfeit",
        )

        assert action.target_type == AdminTargetTypeEnum.LISTING
        assert action.target_id == target_id
