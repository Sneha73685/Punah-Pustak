"""Password hashing (SEC-010).

Argon2id via `argon2-cffi`, never bcrypt-only and never a fast general
-purpose hash. Applies equally to user-chosen passwords and to
admin-generated temporary passwords (FR-045, Milestone 4) since both end up
calling `hash_password` — this module doesn't need to know which caller it
is.
"""

import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()

# SEC-011: admin-generated temporary passwords (FR-045) "SHOULD exceed"
# the 10-character minimum, suggesting "e.g., a 16-character random
# string." `secrets.token_urlsafe(16)` yields ~22 URL-safe characters from
# 16 bytes of entropy — comfortably over both the minimum and the
# suggestion, and the same generator (and byte count reasoning) already
# used for refresh tokens (`app.modules.auth.tokens.generate_refresh_token`,
# which uses 32 bytes for a *token*, not a *password* a human has to
# relay/retype — 16 bytes is proportionate here, still far beyond
# brute-force range for a one-time, single-use credential).
_TEMPORARY_PASSWORD_BYTES = 16


def hash_password(plain_password: str) -> str:
    return _hasher.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Returns False for a wrong password AND for a malformed/corrupted
    stored hash (`InvalidHashError`) — a login attempt should never surface
    a 500 just because the stored hash is unreadable; it fails the same way
    a wrong password does. `VerificationError` is `VerifyMismatchError`'s
    base class and covers every "verification did not succeed" outcome
    argon2-cffi can raise.
    """
    try:
        return _hasher.verify(password_hash, plain_password)
    except (VerificationError, InvalidHashError):
        return False


def generate_temporary_password() -> str:
    """FR-045: a new, random temporary password for an admin-assisted
    password reset. Never chosen or memorized by the user (SEC-011's own
    reasoning for relaxing composition rules doesn't even apply here —
    there's no human picking a predictable pattern to guard against), and
    never stored in plaintext anywhere — the caller hashes it immediately
    via `hash_password` and returns the plaintext exactly once in the API
    response (FR-045), never persisting or logging it.
    """
    return secrets.token_urlsafe(_TEMPORARY_PASSWORD_BYTES)
