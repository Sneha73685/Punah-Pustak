"""Profile management endpoints (§7.4, §12.2): view/edit own profile, change
password.

Per BE-001, this router contains no SQLAlchemy queries — only HTTP concerns
(dependency wiring, request/response translation) and calls into
`UserService`. Every failure path is a `DomainError` raised by the service
layer, handled centrally by `app.core.errors` — no `try/except` appears
here.

FR-015's forced-password-change gate is enforced once, centrally, inside
`get_current_user` itself (see `app.modules.auth.dependencies`) — not here.
That is why every endpoint in this router except the password-change one
uses the plain `get_current_user` dependency and needs no FR-015-specific
code of its own: a `must_change_password` account is already rejected with
`403 PASSWORD_CHANGE_REQUIRED` before this router's own handler ever runs.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.auth.dependencies import get_current_user, get_current_user_for_password_change
from app.modules.users.models import User
from app.modules.users.schemas import PasswordChangeRequest, UserPublic, UserUpdate
from app.modules.users.service import UserService

router = APIRouter(prefix="/users/me", tags=["users"])


@router.get("", response_model=UserPublic, summary="Own profile (FR-030)")
def get_own_profile(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


@router.patch("", response_model=UserPublic, summary="Edit display name (FR-030/FR-033)")
def update_own_profile(
    body: UserUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    # FR-033: `UserUpdate` has no `email` field at all — there is nothing
    # for a client to submit that could change it, by construction, rather
    # than by a runtime check that silently ignores an `email` key.
    return UserService(db).update_display_name(current_user, body.display_name)


@router.post(
    "/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change password — self-initiated or forced (FR-031/FR-015)",
)
def change_own_password(
    body: PasswordChangeRequest,
    db: Annotated[Session, Depends(get_db)],
    # Deliberately NOT `get_current_user`: this is the one endpoint FR-015
    # requires to remain reachable while `must_change_password` is set — see
    # `get_current_user_for_password_change`'s docstring.
    current_user: Annotated[User, Depends(get_current_user_for_password_change)],
) -> None:
    UserService(db).change_password(
        current_user, current_password=body.current_password, new_password=body.new_password
    )
