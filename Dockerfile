# syntax=docker/dockerfile:1.7

FROM node:22.23.4-alpine AS frontend-builder
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates
WORKDIR /app/frontend
RUN --mount=type=secret,id=local_ca,required=false \
    if [ -f /run/secrets/local_ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/local_ca; \
    fi && corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN --mount=type=secret,id=local_ca,required=false \
    --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    if [ -f /run/secrets/local_ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/local_ca; \
    fi && pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY frontend/ ./
ENV NEXT_PUBLIC_API_URL=""
RUN pnpm build

FROM python:3.13-slim AS production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_CERT=/etc/ssl/certs/ca-certificates.crt \
    STATIC_FILES_DIR=/app/static
WORKDIR /app/backend
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates && rm -rf /var/lib/apt/lists/*
RUN addgroup --system app && adduser --system --ingroup app app
COPY backend/ ./
RUN --mount=type=secret,id=local_ca,required=false \
    --mount=type=cache,target=/root/.cache/pip \
    if [ -f /run/secrets/local_ca ]; then \
      cat /etc/ssl/certs/ca-certificates.crt /run/secrets/local_ca > /tmp/ca-bundle.crt && \
      export PIP_CERT=/tmp/ca-bundle.crt; \
    fi && pip install --upgrade pip && pip install . && rm -f /tmp/ca-bundle.crt
COPY --from=frontend-builder /app/frontend/out /app/static
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:' + __import__('os').environ.get('PORT', '8000') + '/health/live')"
CMD ["sh", "-c", "fastapi run app/main.py --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
