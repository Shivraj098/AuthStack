# ─── Stage 1: Builder ───────────────────────────────────────────
# Full Node image with dev dependencies for TypeScript compilation
FROM node:22-alpine AS builder

# Install dumb-init for proper signal handling inside containers
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files first — Docker layer caching
# If package.json doesn't change, npm install layer is reused
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY server/prisma ./server/prisma

# Install ALL dependencies including devDependencies for compilation
ENV HUSKY=0
RUN npm ci --workspace=server --ignore-scripts

# Copy source
COPY server ./server
# Generate Prisma client for the target platform
RUN npx prisma generate --schema=server/prisma/schema.prisma
# Compile TypeScript → JavaScript
RUN npm run build --workspace=server
# Prune devDependencies — only keep what production needs
RUN npm prune --omit=dev 

# ─── Stage 2: Production ────────────────────────────────────────
# Fresh minimal image — no compiler, no dev tools, no test files
FROM node:22-alpine AS production

RUN apk add --no-cache dumb-init

# Create non-root user — never run Node as root in production
RUN addgroup -g 1001 -S nodejs
RUN adduser -S authapp -u 1001

WORKDIR /app/server

# Copy only what the production app needs:
# 1. Compiled JavaScript output
COPY --from=builder --chown=authapp:nodejs /app/server/dist ./dist

# 2. Pruned node_modules (no devDependencies)
COPY --from=builder --chown=authapp:nodejs /app/node_modules ../node_modules

# 3. Generated Prisma client from the node_modules
# NOTE: prisma client is generated from the node_modules

# 4. Prisma schema (needed for migrations at startup)
COPY --from=builder --chown=authapp:nodejs /app/server/prisma ./prisma

# 5. Package.json (needed for npm scripts)
COPY --from=builder --chown=authapp:nodejs /app/server/package.json ./

# Switch to non-root user
USER authapp

# Expose port
EXPOSE 3000

# Health check — Docker will restart container if this fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# dumb-init wraps Node to handle signals correctly
# Without it, Ctrl+C and Docker stop signals are not forwarded to Node
ENTRYPOINT ["dumb-init", "--"]

# Run migrations then start the server
# Using shell form so environment variables are expanded
CMD ["sh", "-c", "npx prisma migrate deploy || echo 'Migration skipped'; node dist/app.js"]