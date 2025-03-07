# Build stage
FROM node:16-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies using regular npm install rather than npm ci
# This is more reliable with your current package.json
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

# Copy build output from builder stage
COPY --from=builder /app/build .

# Create nginx configuration for SPA and security
RUN echo 'server { \
    listen 80; \
    server_tokens off; \
    root /usr/share/nginx/html; \
    index index.html; \
    # SPA routing \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    # Basic security headers \
    add_header X-Content-Type-Options "nosniff"; \
    add_header X-Frame-Options "SAMEORIGIN"; \
    # Enable gzip \
    gzip on; \
    gzip_types text/plain text/css application/javascript; \
}' > /etc/nginx/conf.d/default.conf

# Simple health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

# Expose port
EXPOSE 80

# No need to switch to nginx user in this alpine image
# as it causes permission issues with default nginx config
# Add container labels
LABEL maintainer="DevOps Team <kashimkyari@gmail.com>" \
      version="2.0" \
      description="Stream Monitor Frontend" \
      org.opencontainers.image.source="https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool"