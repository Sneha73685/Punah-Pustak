"""RefreshToken entity (§10.1), added in SRS 2.1.0 to make the rotation and
reuse-detection model in SEC-021/023/024 concrete.

- token_hash: the opaque refresh token is a cryptographically random string;
  only its hash is ever persisted (SEC-021).
- family_id: shared by every token descended from one login. Reuse of an
  already-`revoked` token triggers revocation of the whole family
  (SEC-024) — this column is what makes that possible.
- `user_id` FK uses ON DELETE CASCADE: a decision not made explicit in the
  SRS. Rationale (see implementation summary): a refresh token has no
  meaning without its user, exactly like ListingImage has no meaning
  without its Listing (DB-031's stated rationale for that cascade). Moot in
  practice today since DB-021 forbids hard-deleting users, but the
  constraint should still document the intended relationship.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy import func as sa_func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(nullable=False, unique=True)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    revoked: Mapped[bool] = mapped_column(nullable=False, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa_func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return (
            f"RefreshToken(id={self.id!r}, user_id={self.user_id!r}, "
            f"family_id={self.family_id!r}, revoked={self.revoked!r})"
        )
