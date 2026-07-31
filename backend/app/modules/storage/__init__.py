"""Storage module (BE-002): object-storage abstraction (BE-030).

`StorageBackend` (backend.py) is a `Protocol` — the `listings` module's
service layer depends on it structurally, not on `S3StorageBackend`
(s3_backend.py) directly, so unit tests can substitute an in-memory fake
with no inheritance and no real storage (TEST-001). This module has no
model of its own — it has nothing to persist to Postgres, only to object
storage — so unlike every other module it never appears in
`alembic/env.py`'s model imports.
"""
