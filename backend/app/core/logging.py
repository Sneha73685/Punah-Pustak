"""Structured logging configuration (NFR-006).

NFR-006 requires JSON-structured logs in non-local environments so they can
be ingested by a standard log aggregator without custom parsing. In local
development, a plain human-readable format is used instead, since a
developer reading a terminal is a different audience than a log aggregator
and JSON adds no value there.

No third-party logging library is used — the standard library's `logging`
module with a small custom `Formatter` is sufficient for this scope and
keeps the dependency list minimal.
"""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings

_RESERVED_LOG_RECORD_ATTRS = frozenset(
    logging.LogRecord(
        name="", level=0, pathname="", lineno=0, msg="", args=(), exc_info=None
    ).__dict__.keys()
)


class JsonFormatter(logging.Formatter):
    """Renders each log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        # Include any extra fields passed via `logger.info(..., extra={...})`
        # without requiring callers to know about a special "context" key.
        for key, value in record.__dict__.items():
            if key not in _RESERVED_LOG_RECORD_ATTRS and key not in payload:
                payload[key] = value

        return json.dumps(payload, default=str)


def configure_logging(settings: Settings) -> None:
    """Configure the root logger once, at application startup.

    Idempotent-safe to call more than once (e.g. once from a test fixture
    and once from `main.py`) — it always clears and re-adds a single handler
    rather than accumulating duplicate handlers.
    """
    root = logging.getLogger()
    root.setLevel(settings.log_level.upper())

    for existing_handler in list(root.handlers):
        root.removeHandler(existing_handler)

    handler = logging.StreamHandler(stream=sys.stdout)
    if settings.is_local:
        handler.setFormatter(
            logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
        )
    else:
        handler.setFormatter(JsonFormatter())

    root.addHandler(handler)
