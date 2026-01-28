# Build stage
FROM node:22-alpine AS builder

# Enable Corepack for pnpm
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY ui-vue/package.json ui-vue/pnpm-lock.yaml ./ui-vue/
RUN pnpm install --frozen-lockfile && pnpm -C ui-vue install --frozen-lockfile

COPY . .

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
