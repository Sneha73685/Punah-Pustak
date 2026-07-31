"""Global error handling — the single source of the API-010 error envelope.

API-013 / BE-042 require that *every* error response, including ones
FastAPI/Starlette/Pydantic generate automatically, is rewritten into:

    {"error": {"code": "...", "message": "...", "fields": {...}}}

`fields` is omitted entirely when there is no field-level detail (e.g. a
plain 404), rather than being present-but-null, to keep the envelope
minimal for the common case.

This module registers four handlers:

1. `RequestValidationError` — FastAPI's default shape for this is
   `{"detail": [...]}`, which does NOT match API-010. This handler is what
   makes the Milestone 0 exit criterion (§23 — "a manually-triggered 422
   returns the documented envelope shape") true for FastAPI's own
   validation failures, not just for errors the application code raises
   deliberately.
2. `StarletteHTTPException` — covers FastAPI's `HTTPException` (a subclass)
   as well as Starlette's own routing errors (404 on an undefined path,
   405 on a disallowed method, etc).
3. `app.core.exceptions.DomainError` — the service layer's error vocabulary
   (added in Milestone 1, as this module's own comment previously predicted:
   "expected to arrive with the first module ... whose service layer needs
   to raise errors that don't map 1:1 onto an HTTP status picked at the call
   site"). Each `DomainError` subclass already carries its own status code
   and machine-readable `code`, so this handler is a direct passthrough
   into the envelope rather than a lookup table.
4. Unhandled `Exception` — a last-resort 500 handler so an unexpected bug
   never leaks a framework traceback or an undocumented error shape to a
   client. The real exception is logged with its traceback; the client
   receives a generic, non-leaking message.
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import DomainError

logger = logging.getLogger(__name__)

# Maps common HTTP status codes to the stable machine-readable `code` field
# used in the envelope (API-011). Anything not listed falls back to a
# generic "HTTP_ERROR" code derived from the status phrase. Only used for
# `StarletteHTTPException` (framework/Starlette-raised errors, which carry a
# status code but no `code` of their own) — `DomainError` supplies its own
# `code` directly and never consults this table.
_STATUS_CODE_NAMES: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
    status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
    status.HTTP_403_FORBIDDEN: "FORBIDDEN",
    status.HTTP_404_NOT_FOUND: "NOT_FOUND",
    status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
    status.HTTP_409_CONFLICT: "CONFLICT",
    status.HTTP_422_UNPROCESSABLE_ENTITY: "VALIDATION_ERROR",
    status.HTTP_429_TOO_MANY_REQUESTS: "RATE_LIMITED",
    status.HTTP_500_INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
    status.HTTP_503_SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
}


def _error_body(
    code: str, message: str, fields: dict[str, list[str]] | None = None
) -> dict[str, object]:
    """Build the API-010 envelope body."""
    error: dict[str, object] = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Translate FastAPI's default `{"detail": [...]}` shape into API-010.

    Multiple errors on the same field are collected into a list rather than
    the last one silently overwriting an earlier one.

    `exc` is typed as the base `Exception` rather than `RequestValidationError`
    because Starlette's own `add_exception_handler` stub declares handlers as
    `Callable[[Request, Exception], ...]` (invariant, not narrowable) — a
    handler typed to the specific exception fails mypy strict on
    registration even though FastAPI only ever dispatches this handler for
    `RequestValidationError`. The `isinstance` assertion below documents and
    enforces that runtime guarantee explicitly.
    """
    assert isinstance(exc, RequestValidationError)
    fields: dict[str, list[str]] = {}
    for err in exc.errors():
        # `loc` looks like ("body", "price") or ("query", "page_size").
        # The leading "body"/"query"/"path" segment is dropped so the field
        # path shown to the client matches the field name in the request,
        # e.g. "price" rather than "body.price".
        loc_parts = [str(part) for part in err["loc"] if part not in ("body", "query", "path")]
        field_path = ".".join(loc_parts) or "__root__"
        fields.setdefault(field_path, []).append(err["msg"])

    body = _error_body(
        code="VALIDATION_ERROR",
        message="Request validation failed.",
        fields=fields,
    )
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=body)


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Translate any `HTTPException` (including FastAPI's) into API-010.

    See `validation_exception_handler` for why `exc` is typed `Exception`
    rather than `StarletteHTTPException` here.
    """
    assert isinstance(exc, StarletteHTTPException)
    code = _STATUS_CODE_NAMES.get(exc.status_code, "HTTP_ERROR")
    message = str(exc.detail) if exc.detail else code.replace("_", " ").title()
    body = _error_body(code=code, message=message)
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


async def domain_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Translate any `app.core.exceptions.DomainError` into API-010.

    See `validation_exception_handler` for why `exc` is typed `Exception`
    rather than `DomainError` here.
    """
    assert isinstance(exc, DomainError)
    body = _error_body(code=exc.code, message=exc.message, fields=exc.fields)
    return JSONResponse(status_code=exc.status_code, content=body)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last-resort 500 handler — logs the real error, never leaks it to the client."""
    logger.exception("Unhandled exception while processing request", exc_info=exc)
    body = _error_body(
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred.",
    )
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=body)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the given FastAPI app.

    Called once from `app.main` at application construction time. Kept as
    a single function so `main.py` stays declarative and so tests can build
    an isolated app with the same handlers without duplicating this wiring.
    """
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
