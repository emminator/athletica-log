FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY pyproject.toml README.md ./

FROM base AS development
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && pip install -e ".[dev]"
COPY . .
USER app
CMD ["fastapi", "dev", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS production
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && pip install .
COPY . .
USER app
CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
