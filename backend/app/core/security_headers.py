"""SEC-002 security response headers.

A small, dedicated ASGI middleware (not `BaseHTTPMiddleware`) — it adds
headers by wrapping the raw ASGI `send` callable rather than buffering and
reconstructing the response, which avoids `BaseHTTPMiddleware`'s documented
interactions with streaming responses, `BackgroundTasks`, and contextvars.
Registered in `app.main`; see that module for why it's added *after*
`CORSMiddleware`.

CSP is deliberately minimal and API-shaped, not copied from a browser
application: this backend serves JSON under `/api/v1/*` and renders no HTML
of its own beyond FastAPI's auto-generated `/docs`/`/redoc` pages (which
load their assets from a CDN). `default-src 'none'` means those two pages
will not render correctly in a browser under this policy — an accepted
trade-off, since they are developer tooling, not the product; the actual
frontend is a separate application served by Vercel, so no `script-src`/
`style-src` allowance for it belongs in this API's CSP.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_SECURITY_HEADERS: list[tuple[bytes, bytes]] = [
    (
        b"content-security-policy",
        b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    ),
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
]


class SecurityHeadersMiddleware:
    """Adds SEC-002's fixed set of security response headers to every HTTP response.

    Applies uniformly to success responses, the API-010 structured error
    envelope (validation/domain/HTTP errors, all of which pass back through
    this middleware as ordinary responses), and CORS preflight responses —
    it only appends headers via the ASGI `send` callable, never inspecting
    or altering the response body or status, so it cannot change what any
    of those paths return.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(_SECURITY_HEADERS)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_security_headers)
