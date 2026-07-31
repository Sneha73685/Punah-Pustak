"""Object storage abstraction (BE-030).

A small interface — `put`, `get_url`, `delete` — so the service layer never
imports boto3/S3 concepts directly, and so unit tests can use an in-memory
fake without hitting real storage (TEST-001). `S3StorageBackend` (in
`s3_backend.py`) is the only implementation; there is no local-disk variant
(BE-030 says one MAY exist for local/dev, not that it must) since MinIO —
already provisioned in docker-compose from Milestone 0 — is itself
S3-compatible, so one implementation correctly serves both local dev and
production.
"""

from typing import Protocol


class StorageBackend(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None:
        """Write `data` to `key`, overwriting if it already exists."""
        ...

    def get_url(self, key: str) -> str:
        """The browser-fetchable URL for `key`. Assumes the bucket is
        publicly readable (BE-031's CORS policy is meaningless otherwise) —
        this is not a presigned/expiring URL.
        """
        ...

    def delete(self, key: str) -> None:
        """Remove `key`. MUST NOT raise if `key` does not exist — deletion
        is used from listing/image-deletion paths that are themselves
        idempotent (FR-029), and a missing object is not an error there.
        """
        ...
