# syntax=docker/dockerfile:1
# ============================================================================
# HWMS API + Worker — production multi-stage image.
# The SAME image runs both the HTTP API (dist/src/main.js) and the standalone
# BullMQ worker (dist/src/worker.js); docker-compose.prod.yml overrides the CMD
# for the worker service. Build from the REPO ROOT:
#   docker build -f apps/api/Dockerfile -t hwms-api .
# ============================================================================

# ---- Stage 1: builder (installs full workspace, compiles, generates Prisma) ----
FROM node:20-slim AS builder
# openssl + ca-certificates: required by Prisma engines and the SheetJS CDN pin.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# pnpm 10.x reads lockfileVersion 9.0 and runs on Node 20 LTS (11.x needs Node 22+).
RUN npm install -g pnpm@10
WORKDIR /repo

# Copy manifests first for better layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Copy sources needed to build the API (+ shared) and the seed workbook.
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY seed seed

RUN pnpm --filter @hwms/shared build \
 && pnpm --filter @hwms/api exec prisma generate \
 && pnpm --filter @hwms/api build

# ---- Stage 2: runner ----
# Keeps the intact monorepo layout so runtime relative paths (seed workbook,
# uploads/ fallback, Prisma schema) resolve exactly as in development. Prisma
# CLI and ts-node remain available so the `migrate`/`seed` compose services can
# reuse this image.
FROM node:20-slim AS runner
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
WORKDIR /repo/apps/api

COPY --from=builder /repo /repo

# Non-root runtime user; owns the uploads fallback directory.
RUN useradd -r -u 1001 -g root hwms \
    && mkdir -p /repo/apps/uploads /repo/apps/api/uploads \
    && chown -R hwms:root /repo/apps/uploads /repo/apps/api/uploads
USER hwms

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# API service. The worker service overrides this to: node dist/src/worker.js
CMD ["node", "dist/src/main.js"]
