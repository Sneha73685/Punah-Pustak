"""S3-compatible `StorageBackend` implementation (BE-030).

A plain `boto3` S3 client works identically against real AWS S3 and any
S3-compatible self-hosted server (MinIO, used in docker-compose) — this
class doesn't know or care which it's talking to; only `Settings` differs
between environments.
"""

import boto3
from botocore.client import Config

from app.core.config import Settings


class S3StorageBackend:
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.storage_bucket
        self._public_base_url = settings.storage_public_url.rstrip("/")
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.storage_endpoint_url,
            aws_access_key_id=settings.storage_access_key,
            aws_secret_access_key=settings.storage_secret_key,
            config=Config(signature_version="s3v4"),
        )

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)

    def get_url(self, key: str) -> str:
        # Direct object URL against a publicly-readable bucket (see
        # `storage-init` in docker-compose.yml for the anonymous-download
        # policy that makes this valid) — not a presigned URL, per
        # `StorageBackend.get_url`'s contract.
        return f"{self._public_base_url}/{self._bucket}/{key}"

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)
