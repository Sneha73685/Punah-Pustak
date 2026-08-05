#!/bin/sh
# Container entrypoint: apply Alembic migrations, then exec whatever command
# was actually requested (the Dockerfile's own CMD in production, or
# docker-compose.yml's `command:` override for local dev with --reload).
#
# Why this replaces the old "run `alembic upgrade head` by hand, as a
# separate release step" policy (formerly DEPLOY-022, SRS-v2.1.0.md): that
# policy assumed an operator could open a shell against the running service
# to run it. Render's free tier has no Shell access at all, which makes a
# manual step literally impossible to execute there, not just inconvenient
# -- see docs/deployment.md for the full reasoning, including why this is
# safe specifically because this project targets exactly one running
# instance (architecture.md's guiding constraint): the race DEPLOY-022 was
# actually guarding against -- multiple instances independently racing to
# migrate concurrently -- cannot happen when there is only ever one.
#
# `set -e` alone would already stop this script on `alembic upgrade head`
# failing, but the explicit check below exists to print an unambiguous
# FATAL line before exiting -- Render's deploy log is now the only
# diagnostic surface available (no Shell to inspect the container
# afterward), so a clear, deliberate message here matters more than it
# would have under the old manual-step policy.
set -e

echo "docker-entrypoint: applying database migrations (alembic upgrade head)..."
if ! alembic upgrade head; then
  echo "docker-entrypoint: FATAL - migration failed, refusing to start the application." >&2
  exit 1
fi
echo "docker-entrypoint: migrations applied successfully."

exec "$@"
