FROM python:3.12-slim

# psycopg[binary] avoids needing libpq-dev at build time; kept minimal
# on purpose (C-3: no build complexity beyond what pip needs).
WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

RUN pip install --no-cache-dir .

EXPOSE 8000

# The entrypoint applies migrations (`alembic upgrade head`), then `exec`s
# whatever CMD (below) or docker-compose.yml's `command:` override actually
# resolves to -- see docker-entrypoint.sh for the full reasoning (this
# replaces the old "run migrations by hand as a separate step" policy,
# which Render's Shell-less free tier makes impossible to carry out).
# `["/app/docker-entrypoint.sh"]` is exec-form so docker-compose's own
# `command:` override is passed to it as arguments (not swallowed) --
# compose overrides CMD, never ENTRYPOINT.
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Shell form (not exec-form CMD) so ${PORT} expands: most container hosts
# (Render, Railway) inject PORT and expect the process to bind to it;
# ${PORT:-8000} falls back to this image's own EXPOSE'd default for
# `docker run` without one set. `exec` replaces the entrypoint's shell with
# uvicorn (making it PID 1) rather than running it as a child, so it
# receives SIGTERM directly for a clean shutdown instead of a wrapping
# shell swallowing it. docker-compose.yml's `api` service overrides this
# command entirely (with --reload for local dev) -- entrypoint.sh still
# runs first either way, since compose only overrides CMD, not ENTRYPOINT.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
