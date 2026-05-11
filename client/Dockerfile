# ─── Stage 1: Builder ───────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build the React app — outputs to /app/dist
RUN npm run build

# ─── Stage 2: Production (Nginx) ────────────────────────────────
# Nginx serves the static files — no Node needed at all
FROM nginx:1.27-alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy built React app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Non-root user for nginx
RUN addgroup -g 1001 -S nginxgroup
RUN adduser -S nginxuser -u 1001 -G nginxgroup

# Nginx needs to write to these directories
RUN chown -R nginxuser:nginxgroup /usr/share/nginx/html
RUN chown -R nginxuser:nginxgroup /var/cache/nginx
RUN chown -R nginxuser:nginxgroup /var/log/nginx
RUN chown -R nginxuser:nginxgroup /etc/nginx/conf.d

# Create nginx PID directory for non-root
RUN touch /tmp/nginx.pid && chown nginxuser:nginxgroup /tmp/nginx.pid

USER nginxuser

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]