# Build stage
FROM node:22-alpine AS builder

# Enable Corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy root package files and ui-vue package file
COPY package.json pnpm-lock.yaml ./
COPY ui-vue/package.json ./ui-vue/

# Install dependencies (root installs ui-vue via pnpm -C ui-vue)
RUN pnpm install --frozen-lockfile

COPY . .

# Build server and client
RUN pnpm run build

# Production stage
FROM node:22-alpine

# Enable Corepack for pnpm
RUN corepack enable

WORKDIR /app

COPY package.json ./
RUN pnpm install --prod

COPY --from=builder /app/dist ./dist

ENV PORT=3001
EXPOSE 3001

CMD ["pnpm", "start"]
