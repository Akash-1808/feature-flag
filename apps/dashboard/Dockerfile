# Stage 1: Build dependencies and compile standalone Next.js bundle
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configuration
COPY package*.json turbo.json tsconfig.base.json ./
# Copy package.json files first to leverage Docker layer caching
COPY packages/sdk/package*.json ./packages/sdk/
COPY apps/dashboard/package*.json ./apps/dashboard/

# Install workspace dependencies cleanly
RUN npm ci

# Copy source files across packages and dashboard
COPY packages/sdk ./packages/sdk
COPY apps/dashboard ./apps/dashboard

# Disable telemetry and build standalone bundle
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=flagcraft && npm run build --workspace=@flagcraft/dashboard

# Stage 2: Minimal Production Standalone Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy public static assets and standalone bundle from builder
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER node

EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]
