# ========== Build Stage ==========
FROM node:20-alpine AS deps
WORKDIR /app

# Set proper environment for build
ENV NODE_ENV=production

# Install dependencies for node-gyp if needed
RUN apk add --no-cache python3 make g++

# Install and configure pnpm for better dependency management
RUN corepack enable && corepack prepare pnpm@latest --activate

# Cache dependencies with lockfile
COPY package.json ./
COPY package-lock.json* pnpm-lock.yaml* ./
RUN [ -f pnpm-lock.yaml ] && pnpm install --frozen-lockfile --production=false || npm ci --only=production

# ========== Builder Stage ==========
FROM node:20-alpine AS builder
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with proper environment configuration
ENV NODE_ENV=production
ENV REACT_APP_API_URL=https://api.example.com

# Build the application with tree shaking and optimization
RUN npm run build

# ========== Production Stage ==========
FROM nginx:alpine-slim AS production
WORKDIR /usr/share/nginx/html

# Install security utilities and set up proper permissions
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/* && \
    mkdir -p /var/cache/nginx /var/run /var/log/nginx && \
    chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx

# Copy build files with proper ownership
COPY --from=builder --chown=nginx:nginx /app/build .

# Create nginx configuration directly instead of attempting to copy non-existent file
RUN echo 'server { \
    listen 80; \
    server_tokens off; \
    root /usr/share/nginx/html; \
    index index.html; \
    # SPA routing \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    # Cache static assets \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ { \
        expires 30d; \
        add_header Cache-Control "public, no-transform"; \
    } \
    # Security headers \
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always; \
    add_header X-Content-Type-Options "nosniff" always; \
    add_header X-Frame-Options "SAMEORIGIN" always; \
    add_header X-XSS-Protection "1; mode=block" always; \
    add_header Content-Security-Policy "default-src '\''self'\''; script-src '\''self'\'' '\''unsafe-inline'\''; style-src '\''self'\'' '\''unsafe-inline'\''; img-src '\''self'\'' data:; font-src '\''self'\'' data:;" always; \
    add_header Referrer-Policy "strict-origin-when-cross-origin" always; \
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always; \
    # Gzip settings \
    gzip on; \
    gzip_vary on; \
    gzip_min_length 1000; \
    gzip_proxied expired no-cache no-store private auth; \
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript; \
}' > /etc/nginx/conf.d/default.conf

# Set up proper environment configurations
ENV NGINX_WORKER_PROCESSES=auto
ENV NGINX_WORKER_CONNECTIONS=1024

# Advanced health check that verifies key resources are available
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/index.html || exit 1

# Configure container for unprivileged operation
USER nginx
EXPOSE 80

# Add container labels
LABEL maintainer="DevOps Team <kashimkyari@gmail.com>" \
      version="2.0" \
      description="Stream Monitor Frontend" \
      org.opencontainers.image.source="https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool"