# Build stage: Build the React app
FROM node:16-alpine as build
WORKDIR /app

# Set npm cache to a directory with appropriate permissions
ENV npm_config_cache=/tmp/.npm

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the app for production
RUN npm run build

# Production stage: Serve the built app with nginx
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Copy the built app from the build stage
COPY --from=build /app/build ./

# Create a custom nginx config that addresses permission issues
RUN mkdir -p /tmp/nginx/client_temp && \
    mkdir -p /tmp/nginx/proxy_temp && \
    mkdir -p /tmp/nginx/fastcgi_temp && \
    mkdir -p /tmp/nginx/uwsgi_temp && \
    mkdir -p /tmp/nginx/scgi_temp && \
    mkdir -p /tmp/nginx/logs

# Create custom nginx.conf
RUN echo 'worker_processes auto; \
pid /tmp/nginx.pid; \
events { \
    worker_connections 1024; \
} \
http { \
    include /etc/nginx/mime.types; \
    default_type application/octet-stream; \
    access_log /tmp/nginx/logs/access.log; \
    error_log /tmp/nginx/logs/error.log; \
    sendfile on; \
    keepalive_timeout 65; \
    client_body_temp_path /tmp/nginx/client_temp; \
    proxy_temp_path /tmp/nginx/proxy_temp; \
    fastcgi_temp_path /tmp/nginx/fastcgi_temp; \
    uwsgi_temp_path /tmp/nginx/uwsgi_temp; \
    scgi_temp_path /tmp/nginx/scgi_temp; \
    server { \
        listen 8080; \
        server_name _; \
        location / { \
            root /usr/share/nginx/html; \
            index index.html index.htm; \
            try_files $uri $uri/ /index.html; \
        } \
        error_page 500 502 503 504 /50x.html; \
        location = /50x.html { \
            root /usr/share/nginx/html; \
        } \
    } \
}' > /tmp/nginx.conf

# Expose port 8080 instead of 80
EXPOSE 8080

# Health check: verify nginx responsiveness
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080 || exit 1

# Container metadata
LABEL maintainer="DevOps Team <kashimkyari@gmail.com>" \
      version="2.0" \
      description="Stream Monitor Frontend (Production)" \
      org.opencontainers.image.source="https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool"

# Run nginx with custom config as non-root user
USER nginx
CMD ["nginx", "-c", "/tmp/nginx.conf", "-g", "daemon off;"]