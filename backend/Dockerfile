FROM python:3.12-slim

# psycopg[binary] avoids needing libpq-dev at build time; kept minimal
# on purpose (C-3: no build complexity beyond what pip needs).
WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

RUN pip install --no-cache-dir .

EXPOSE 8000

# Shell form (not exec-form CMD) so ${PORT} expands: most container hosts
# (Render, Railway) inject PORT and expect the process to bind to it;
# ${PORT:-8000} falls back to this image's own EXPOSE'd default for
# `docker run` without one set. `exec` replaces the shell with uvicorn
# (making it PID 1) rather than running it as the shell's child, so it
# receives SIGTERM directly for a clean shutdown instead of the shell
# swallowing it — plain shell-form CMD without `exec` would not do this.
# docker-compose.yml's `api` service overrides this command entirely (with
# --reload for local dev), so this change has no effect on the local
# Docker Compose workflow — it only matters for a container run
# standalone, i.e. in production.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
