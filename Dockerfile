# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
RUN apk update && apk upgrade --no-cache && corepack enable
WORKDIR /app
ENV CI=true

# Build stage
FROM base AS builder

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --prod=false

COPY . .

# The first install above only had the root package.json + lockfile; the workspace
# manifest (pnpm-workspace.yaml + ui-vue/package.json) arrives with `COPY . .`, so
# install the ui-vue workspace package's deps now.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm -C ui-vue install --prod=false --no-frozen-lockfile

# Build server and client
RUN pnpm run build

# Production stage
FROM base AS runtime
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/ui-vue/public ./ui-vue/public

ENV PORT=3001
EXPOSE 3001

CMD ["pnpm", "start"]
