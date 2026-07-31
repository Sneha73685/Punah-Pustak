"""AdminAction entity (§10.1) — append-only audit log.

- action_type includes `reset_password`, added in SRS 2.1.0 for FR-045/UC-7.
- target_type/target_id: two plain columns rather than a generic
  polymorphic-association pattern, since there are only two target types
  (`listing`, `user`) — see §10.1/§10.2 rationale against over-engineering
  this for a third type that doesn't exist yet.
- reason_code is nullable: required by the service layer for
  `remove_listing` and `suspend_user` (enforced in Milestone 4, not at the
  DB layer), but not applicable to `reset_password`, which is user-initiated
  via an admin rather than punitive (§10.1).
- admin_id FK: ON DELETE RESTRICT. Not stated explicitly in the SRS;
  recorded here as a decision (see implementation summary) — an audit log
  must never lose its actor, so the row referencing an admin cannot be
  silently orphaned by cascade. Moot today since DB-021 forbids hard-deleting
  users at all.
"""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy import func as sa_func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Enum as SAEnum

from app.core.db import Base, enum_values


class AdminActionTypeEnum(str, Enum):
    REMOVE_LISTING = "remove_listing"
    SUSPEND_USER = "suspend_user"
    REINSTATE_USER = "reinstate_user"
    RESET_PASSWORD = "reset_password"


class AdminTargetTypeEnum(str, Enum):
    LISTING = "listing"
    USER = "user"


class AdminAction(Base):
    __tablename__ = "admin_actions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    action_type: Mapped[AdminActionTypeEnum] = mapped_column(
        SAEnum(
            AdminActionTypeEnum,
            name="admin_action_type_enum",
            native_enum=True,
            values_callable=enum_values,
        ),
        nullable=False,
    )
    target_type: Mapped[AdminTargetTypeEnum] = mapped_column(
        SAEnum(
            AdminTargetTypeEnum,
            name="admin_target_type_enum",
            native_enum=True,
            values_callable=enum_values,
        ),
        nullable=False,
    )
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reason_code: Mapped[str | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa_func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return (
            f"AdminAction(id={self.id!r}, action_type={self.action_type!r}, "
            f"target_type={self.target_type!r}, target_id={self.target_id!r})"
        )
