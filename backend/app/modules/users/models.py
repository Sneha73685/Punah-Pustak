"""User entity (§10.1).

Field-by-field mapping to the SRS:
- email: CITEXT, unique — committed in 2.1.0 (DB-004) to eliminate an entire
  class of case-sensitivity bugs; requires the `citext` Postgres extension,
  enabled in the initial migration before this table is created.
- role: fixed two-value enum (`user`, `admin`) — no separate seller/buyer
  role exists; see §6 rationale.
- is_active: False means suspended (FR-041); public listing queries join on
  this column (DB-044 indexes it for exactly that reason).
- must_change_password: added in 2.1.0 to support the forced password-change
  flow (FR-015) after an admin-assisted reset (FR-045).
"""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Enum as SAEnum

from app.core.db import Base, enum_values


class RoleEnum(str, Enum):
    """§6 — exactly two roles; ownership checks, not roles, gate seller/buyer actions."""

    USER = "user"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # unique=True alone (no index=True) matches the migration, which relies
    # on the UNIQUE constraint Postgres creates for `email` rather than a
    # separately named index (DB-043: "already implied by the unique
    # constraint") — `unique=True, index=True` together produce a *different*
    # database object (a named unique Index rather than a UniqueConstraint),
    # which would silently drift from the migration's actual schema.
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    display_name: Mapped[str] = mapped_column(nullable=False)
    role: Mapped[RoleEnum] = mapped_column(
        SAEnum(RoleEnum, name="role_enum", native_enum=True, values_callable=enum_values),
        nullable=False,
        default=RoleEnum.USER,
    )
    # DB-044: indexed because every public listing query joins on this
    # column to exclude suspended users.
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, index=True)
    must_change_password: Mapped[bool] = mapped_column(nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"User(id={self.id!r}, email={self.email!r}, role={self.role!r})"
