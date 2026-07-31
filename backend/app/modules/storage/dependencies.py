"""FastAPI dependency for obtaining a `StorageBackend` (BE-030).

Mirrors `app.modules.auth.dependencies`'s pattern: the framework-aware
wiring (reading `Settings` via `Depends`) lives here, not in
`backend.py`/`s3_backend.py`, which stay framework-agnostic.
"""

from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.modules.storage.backend import StorageBackend
from app.modules.storage.s3_backend import S3StorageBackend


def get_storage_backend(settings: Annotated[Settings, Depends(get_settings)]) -> StorageBackend:
    return S3StorageBackend(settings)
