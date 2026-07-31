"""Aggregates every v1 router under a single `/api/v1` prefix (API-002).

Milestone 0 wired up only the health router; Milestone 1 added auth;
Milestone 2 adds listings (both of its routers — see
`app.modules.listings.router`'s module docstring for why there are two).
Admin's router is added to this file when its own milestone implements it —
no placeholder/stub routers for unimplemented modules are added ahead of
time, per the instruction not to build ahead of the current milestone.
"""

from fastapi import APIRouter

from app.api.v1 import health
from app.modules.auth.router import router as auth_router
from app.modules.listings.router import my_listings_router
from app.modules.listings.router import router as listings_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(health.router, tags=["health"])
api_v1_router.include_router(auth_router)
api_v1_router.include_router(listings_router)
api_v1_router.include_router(my_listings_router)
