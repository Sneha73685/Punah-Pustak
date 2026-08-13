#!/usr/bin/env bash
# Waits for the Docker Compose stack's API and frontend to be reachable
# before the Playwright suite starts, instead of letting the first test's
# own navigation timeout be the thing that reports "the stack isn't up" —
# used identically by local development (README.md) and CI (see
# .github/workflows/ci.yml's `e2e-tests` job), so there is exactly one
# place this readiness check is written.
set -euo pipefail

BACKEND_URL="${E2E_BACKEND_URL:-http://localhost:8000}"
FRONTEND_URL="${E2E_FRONTEND_URL:-http://localhost:5173}"
MAX_WAIT_SECONDS=120
INTERVAL_SECONDS=2

wait_for() {
  local name="$1"
  local url="$2"
  local elapsed=0
  echo "Waiting for ${name} at ${url}..."
  until curl --silent --fail --output /dev/null "${url}"; do
    if [ "${elapsed}" -ge "${MAX_WAIT_SECONDS}" ]; then
      echo "Timed out after ${MAX_WAIT_SECONDS}s waiting for ${name} at ${url}." >&2
      return 1
    fi
    sleep "${INTERVAL_SECONDS}"
    elapsed=$((elapsed + INTERVAL_SECONDS))
  done
  echo "${name} is ready."
}

wait_for "backend (GET /api/v1/health)" "${BACKEND_URL}/api/v1/health"
wait_for "frontend" "${FRONTEND_URL}/"
