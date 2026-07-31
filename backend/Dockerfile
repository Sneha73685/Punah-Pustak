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

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
