"""Auth endpoints (§12.2): register, login, refresh, logout.

Per BE-001, this router contains no SQLAlchemy queries — only HTTP concerns
(reading/setting the refresh-token cookie, wiring dependencies, calling
`AuthService`) and translating its return values into response models.
Every failure path is a `DomainError` raised by the service layer, handled
centrally by `app.core.errors` — no `try/except` appears here.
"""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.exceptions import InvalidRefreshTokenError
from app.modules.auth.dependencies import enforce_auth_rate_limit, get_current_user
from app.modules.auth.schemas import AccessTokenResponse, LoginRequest, RegisterRequest
from app.modules.auth.service import TokenPair, build_auth_service
from app.modules.users.models import User
from app.modules.users.schemas import UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])

# Scoped to /api/v1/auth rather than the whole API (least-privilege: this
# cookie only needs to be sent on the three endpoints that actually read
# it — refresh and logout — not on every request to the API).
_REFRESH_COOKIE_NAME = "refresh_token"
_REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    """SEC-022: HttpOnly, Secure (per environment), SameSite=Strict."""
    response.set_cookie(
        key=_REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.refresh_token_ttl_days * 86400,
        path=_REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=_REFRESH_COOKIE_NAME,
        path=_REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


def _token_response(pair: TokenPair) -> AccessTokenResponse:
    return AccessTokenResponse(access_token=pair.access_token, expires_in=pair.expires_in)


@router.post(
    "/register",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_auth_rate_limit)],
    summary="Create account (FR-010)",
)
def register(
    body: RegisterRequest,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    # §8.2: deliberately not auto-logged-in — no tokens issued here.
    return build_auth_service(db, settings).register(
        email=body.email, password=body.password, display_name=body.display_name
    )


@router.post(
    "/login",
    response_model=AccessTokenResponse,
    dependencies=[Depends(enforce_auth_rate_limit)],
    summary="Issue access + refresh token (FR-012)",
)
def login(
    body: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AccessTokenResponse:
    pair = build_auth_service(db, settings).login(email=body.email, password=body.password)
    _set_refresh_cookie(response, pair.refresh_token, settings)
    return _token_response(pair)


@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    dependencies=[Depends(enforce_auth_rate_limit)],
    summary="Rotate refresh token, issue new access token (SEC-023)",
)
def refresh(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> AccessTokenResponse:
    if refresh_token is None:
        raise InvalidRefreshTokenError()
    pair = build_auth_service(db, settings).refresh(presented_token=refresh_token)
    _set_refresh_cookie(response, pair.refresh_token, settings)
    return _token_response(pair)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke current refresh token (FR-013)",
)
def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    # Unused beyond enforcing "User"-level auth (§12.2) — logout requires a
    # valid access token even though it acts on the refresh-token cookie.
    _current_user: Annotated[User, Depends(get_current_user)],
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> None:
    if refresh_token is not None:
        build_auth_service(db, settings).logout(presented_token=refresh_token)
    _clear_refresh_cookie(response, settings)
