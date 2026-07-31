"""Password hashing (SEC-010).

Argon2id via `argon2-cffi`, never bcrypt-only and never a fast general
-purpose hash. Applies equally to user-chosen passwords and to
admin-generated temporary passwords (FR-045, Milestone 4) since both end up
calling `hash_password` — this module doesn't need to know which caller it
is.
"""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()


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
