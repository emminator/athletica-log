FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_CERT=/etc/ssl/certs/ca-certificates.crt
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY pyproject.toml README.md ./

FROM base AS development
RUN --mount=type=secret,id=local_ca,required=false \
    --mount=type=cache,target=/root/.cache/pip \
    if [ -f /run/secrets/local_ca ]; then \
      cat /etc/ssl/certs/ca-certificates.crt /run/secrets/local_ca > /tmp/ca-bundle.crt && \
      export PIP_CERT=/tmp/ca-bundle.crt; \
    fi && \
    pip install --upgrade pip && pip install -e ".[dev]" && rm -f /tmp/ca-bundle.crt
COPY . .
USER app
CMD ["fastapi", "dev", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS production
RUN --mount=type=secret,id=local_ca,required=false \
    --mount=type=cache,target=/root/.cache/pip \
    if [ -f /run/secrets/local_ca ]; then \
      cat /etc/ssl/certs/ca-certificates.crt /run/secrets/local_ca > /tmp/ca-bundle.crt && \
      export PIP_CERT=/tmp/ca-bundle.crt; \
    fi && \
    pip install --upgrade pip && pip install . && rm -f /tmp/ca-bundle.crt
COPY . .
USER app
CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
