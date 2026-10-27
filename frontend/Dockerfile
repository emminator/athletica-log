FROM node:22.23.4-alpine AS base
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

FROM base AS development
RUN --mount=type=secret,id=local_ca,required=false \
    --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    if [ -f /run/secrets/local_ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/local_ca; \
    fi && \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM base AS builder
RUN --mount=type=secret,id=local_ca,required=false \
    --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    if [ -f /run/secrets/local_ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/local_ca; \
    fi && \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
