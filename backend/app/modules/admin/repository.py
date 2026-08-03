"""Data access for `AdminAction` (BE-001: repositories are the only layer
that issues SQLAlchemy queries against this module's models).

SEC-050: "Audit records are append-only — no update/delete endpoint exists
for them at the API layer." This repository reflects that literally: it
offers `create` and nothing else — no `update`/`delete` method exists here
either, so there is nothing for a future router to accidentally wire up.
"""

import uuid

from sqlalchemy.orm import Session

from app.modules.admin.models import AdminAction, AdminActionTypeEnum, AdminTargetTypeEnum


class AdminActionRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

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
            admin_id=admin_id,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            reason_code=reason_code,
        )
        self._db.add(action)
        self._db.flush()
        return action
