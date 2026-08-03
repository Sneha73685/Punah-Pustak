"""Data access for `RefreshToken` (BE-001: repositories are the only layer
that issues SQLAlchemy queries against this module's models).
"""

import uuid
from datetime import datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.modules.auth.models import RefreshToken


class RefreshTokenRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: str,
        family_id: uuid.UUID,
        expires_at: datetime,
    ) -> RefreshToken:
        token = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            family_id=family_id,
            expires_at=expires_at,
        )
        self._db.add(token)
        self._db.flush()
        return token

    def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        return (
            self._db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).one_or_none()
        )

    def revoke(self, token: RefreshToken) -> None:
        token.revoked = True
        self._db.flush()

    def revoke_family(self, family_id: uuid.UUID) -> None:
        """SEC-024: reuse-detection revokes every token descended from one
        login, not just the presented one. A bulk `UPDATE` (rather than
        loading each row into the session) is correct here since no
        in-Python logic needs to run per row — this is exactly the kind of
        query BE-001 keeps out of routers and services, and in here, the
        repository, is exactly where it belongs.
        """
        self._db.execute(
            update(RefreshToken).where(RefreshToken.family_id == family_id).values(revoked=True)
        )
        self._db.flush()

    def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        """SEC-025/UC-6 (Milestone 4): suspending a user MUST immediately
        revoke *every* `RefreshToken` row belonging to them — every family,
        not just one — so no future refresh or re-login succeeds from that
        point forward. Same bulk-`UPDATE` shape as `revoke_family` (no
        per-row Python logic needed), scoped to `user_id` instead of a
        single `family_id`. `revoked = false` in the `WHERE` clause is an
        optimization, not a correctness requirement — re-marking an
        already-revoked row `True` is harmless — it just avoids writing to
        rows that don't need it.
        """
        self._db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
            .values(revoked=True)
        )
        self._db.flush()
