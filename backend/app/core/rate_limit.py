"""In-memory, per-key rate limiter (SEC-040).

A single-process, in-memory limiter is explicitly what SEC-040 calls for at
this project's single-instance target (NFR-002, §19.5/DEPLOY-027) —
"if the deployment is ever scaled to multiple instances, this MUST move to
a shared store — that is a deployment-scaling change, not a v2.1.0
requirement." Framework-agnostic (no FastAPI import) per `app.core`'s
charter; the HTTP-facing wrapper (reading the client IP off the request)
lives in `app.modules.auth.dependencies`.
"""

import threading
import time

from app.core.exceptions import RateLimitExceededError

_WINDOW_SECONDS = 60.0


class FixedWindowRateLimiter:
    """A fixed 60-second window, per `(bucket, key)` counter.

    `threading.Lock`-protected because FastAPI runs sync dependencies in a
    threadpool — concurrent requests can genuinely race on the shared dict
    within a single process, even though there's only one process.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[tuple[str, str], tuple[float, int]] = {}

    def check(self, *, bucket: str, key: str, limit: int) -> None:
        """Raises `RateLimitExceededError` once `key` has made more than
        `limit` requests to `bucket` within the current window.
        """
        now = time.monotonic()
        window_key = (bucket, key)
        with self._lock:
            window_start, count = self._windows.get(window_key, (now, 0))
            if now - window_start >= _WINDOW_SECONDS:
                window_start, count = now, 0
            count += 1
            self._windows[window_key] = (window_start, count)
            if count > limit:
                raise RateLimitExceededError()

    def reset(self) -> None:
        """Test-only: clears all in-memory state so one test's requests
        don't count against the next test's limit. Production code never
        calls this — the window simply expires on its own after 60s.
        """
        with self._lock:
            self._windows.clear()


auth_rate_limiter = FixedWindowRateLimiter()
