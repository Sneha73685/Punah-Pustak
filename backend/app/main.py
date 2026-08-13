"""Application entrypoint.

Deliberately thin: this module wires together configuration, logging, CORS,
the global error handlers, and the versioned API router. No business logic
lives here — that is exactly what BE-001's layering exists to prevent.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.security_headers import SecurityHeadersMiddleware

settings = get_settings()
configure_logging(settings)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Punah-Pustak API starting", extra={"environment": settings.environment})
    yield
    logger.info("Punah-Pustak API shutting down")


app = FastAPI(title="Punah-Pustak V2 API", version="2.1.0", lifespan=lifespan)

# DEPLOY-024: exact-origin allowlist, no wildcard (enforced again at the
# Settings layer by config.py's validator); credentials allowed because the
# refresh-token cookie (SEC-022) must be sent cross-origin during local dev
# (DEPLOY-025) between the Vite dev server and the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# SEC-002. Starlette's `add_middleware` inserts each call at the *front* of
# the middleware list, so — counterintuitively — the middleware added last
# ends up wrapping the ones added earlier. Adding this after CORSMiddleware
# means SecurityHeadersMiddleware wraps CORSMiddleware, not the reverse: it
# sees (and can add headers to) every response CORSMiddleware produces,
# including its own preflight responses, without altering any header CORS
# already set. Swapping this order would still add the headers, but would
# put CORS's own header-writing logic outside this middleware's reach for
# no benefit — this order is deliberate, not incidental.
app.add_middleware(SecurityHeadersMiddleware)

register_exception_handlers(app)

app.include_router(api_v1_router)
