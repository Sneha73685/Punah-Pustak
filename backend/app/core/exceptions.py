"""Domain-level exception hierarchy for the service layer.

BE-001 forbids services from importing FastAPI request/response types, so a
service cannot raise `HTTPException` directly. These exceptions are the
service layer's error vocabulary instead: plain Python exceptions carrying
just enough information (an HTTP status, a stable machine-readable `code`
per API-011, and optional field-level detail per API-010) for
`app.core.errors` to translate them into the standard envelope centrally —
consistent with BE-042's "implemented once, centrally" requirement, rather
than each router hand-writing its own `try/except -> HTTPException`.

`app.core.errors.py` predicted this module's arrival explicitly: "This is
deferred, not forgotten — it is expected to arrive with the first module
(Milestone 1, auth) whose service layer needs to raise errors that don't
map 1:1 onto an HTTP status picked at the call site."

Status codes are plain `int` literals, not `fastapi.status` constants: per
`app.core.__init__`'s own charter, nothing in `app.core` may import FastAPI
except `app.core.errors` (whose entire job is translating framework
exceptions) — this module must stay framework-agnostic like every other
`app.core` module.
"""


class DomainError(Exception):
    """Base class for every service-layer error. Never raised directly."""

    status_code: int = 400
    code: str = "BAD_REQUEST"

    def __init__(self, message: str, *, fields: dict[str, list[str]] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.fields = fields


class ValidationFailedError(DomainError):
    """A request is well-formed but fails a business-rule validation.

    Distinct from `RequestValidationError` (a Pydantic schema-shape failure,
    handled separately) — this is for validation that can only be evaluated
    against existing state, e.g. "this email is already registered" (FR-014),
    which is not a fact Pydantic can check from the request body alone.
    """

    status_code = 422
    code = "VALIDATION_ERROR"


class NotFoundError(DomainError):
    """API-011's "404 not found" — including a soft-deleted resource for a
    requester who isn't its owner or an admin (FR-006a's visibility rule).
    """

    status_code = 404
    code = "NOT_FOUND"


class ForbiddenError(DomainError):
    """API-011's "403 authenticated but not authorized" — SEC-030's
    ownership check failed. Distinct from `InvalidAccessTokenError` (401):
    this requester IS who their token says, they just don't own the
    resource they're trying to mutate.
    """

    status_code = 403
    code = "FORBIDDEN"


class ConflictError(DomainError):
    """API-011's "409 state conflict" — the request is well-formed and the
    requester is authorized, but the resource's current state makes the
    operation invalid right now (e.g. FR-028: editing a `sold`/`deleted`
    listing).
    """

    status_code = 409
    code = "CONFLICT"


class StorageUnavailableError(DomainError):
    """NFR-007: object storage is temporarily unavailable — a listing
    mutation that depends on it (image upload) must fail clearly rather
    than partially succeed with missing images.
    """

    status_code = 503
    code = "SERVICE_UNAVAILABLE"

    def __init__(self) -> None:
        super().__init__("Object storage is temporarily unavailable. Please try again shortly.")


class InvalidCredentialsError(DomainError):
    """Login failed. Deliberately generic — never says which of email/password
    was wrong, to avoid account enumeration.
    """

    status_code = 401
    code = "INVALID_CREDENTIALS"

    def __init__(self) -> None:
        super().__init__("Invalid email or password.")


class InvalidAccessTokenError(DomainError):
    """API-011's "401 missing/invalid auth": the access token on an
    authenticated request is missing, malformed, expired, or has a bad
    signature. Distinct from `InvalidCredentialsError` (that's specifically
    the login endpoint's wrong-email-or-password case).
    """

    status_code = 401
    code = "UNAUTHORIZED"

    def __init__(self) -> None:
        super().__init__("Missing or invalid access token.")


class InvalidRefreshTokenError(DomainError):
    """The presented refresh token is missing, expired, unknown, or was
    already rotated away from (SEC-023/SEC-024 reuse detection). Deliberately
    generic for the same reason as `InvalidCredentialsError`: a client that
    triggered reuse detection gets the same response as one that simply sent
    a stale cookie, so the response itself never signals "theft detected".
    """

    status_code = 401
    code = "INVALID_REFRESH_TOKEN"

    def __init__(self) -> None:
        super().__init__("Refresh token is invalid or expired.")


class RateLimitExceededError(DomainError):
    """SEC-040: too many requests to a rate-limited auth endpoint."""

    status_code = 429
    code = "RATE_LIMITED"

    def __init__(self) -> None:
        super().__init__("Too many requests. Please try again later.")


class PasswordChangeRequiredError(DomainError):
    """FR-015: the authenticated user's account has `must_change_password`
    set (via FR-045's admin-assisted reset) and is attempting an
    authenticated action other than the password-change endpoint itself.

    Raised by `get_current_user` on every request — the same single choke
    point every other module already depends on for identity — so this is
    enforced globally with no per-router change required anywhere else.
    `get_current_user_for_password_change` is the one deliberate exception:
    the password-change endpoint has to resolve the caller's identity
    without tripping this same check, or a user could never satisfy it.
    """

    status_code = 403
    code = "PASSWORD_CHANGE_REQUIRED"

    def __init__(self) -> None:
        super().__init__("You must change your password before continuing.")
