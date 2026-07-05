# syntax=docker/dockerfile:1
# ============================================================================
# HWMS Web (PWA) — production multi-stage image: Vite build -> nginx static.
# Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile -t hwms-web .
# The API base URL is baked at build time; default /api/v1 is same-origin and
# proxied to the API service by nginx (no CORS in production).
# ============================================================================

# ---- Stage 1: builder ----
FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# pnpm 10.x reads lockfileVersion 9.0 and runs on Node 20 LTS (11.x needs Node 22+).
RUN npm install -g pnpm@10
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @hwms/shared build \
 && pnpm --filter @hwms/web build

# ---- Stage 2: nginx static server ----
FROM nginx:1.27-alpine AS runner
RUN apk add --no-cache curl
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:80/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
