FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./

FROM base AS development
RUN pnpm install --frozen-lockfile=false
COPY . .
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM base AS builder
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm build

