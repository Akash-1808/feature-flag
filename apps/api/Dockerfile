# Stage 1: Build dependencies and compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configuration
COPY package*.json turbo.json tsconfig.base.json ./
# Copy package.json files first to leverage Docker layer caching
COPY packages/sdk/package*.json ./packages/sdk/
COPY apps/api/package*.json ./apps/api/

# Install all workspace dependencies cleanly
RUN npm ci

# Copy source code across packages and api
COPY packages/sdk ./packages/sdk
COPY apps/api ./apps/api

# Build the SDK and API
RUN npm run build --workspace=@feature-flag/sdk && npm run build --workspace=@feature-flag/api

# Stage 2: Minimal Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy workspace node_modules and compiled output from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/sdk ./packages/sdk
COPY --from=builder /app/apps/api ./apps/api

# Security: Run as non-root user
USER node

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]