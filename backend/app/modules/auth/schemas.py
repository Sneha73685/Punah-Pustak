"""Pydantic v2 request/response models for the auth endpoints (API-020) —
handlers MUST NOT accept raw dicts.
"""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    # SEC-011: 10+ characters, no composition rules — length is the
    # meaningful factor, composition requirements push users toward
    # predictable patterns.
    password: str = Field(min_length=10, max_length=256)
    display_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AccessTokenResponse(BaseModel):
    """Returned by both login and refresh — the refresh token itself never
    appears in a response body (SEC-022: it only ever travels as an
    HttpOnly cookie).
    """

    access_token: str
    token_type: str = "bearer"
    expires_in: int
