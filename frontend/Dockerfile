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

# Production stage: Serve the built app with busybox httpd
FROM busybox:1.36

# Create a non-root user
RUN adduser -D -u 1001 appuser

# Create directory structure
WORKDIR /app
COPY --from=build /app/build /app

# Give ownership to the non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080 || exit 1

# Container metadata
LABEL maintainer="DevOps Team <kashimkyari@gmail.com>" \
      version="2.0" \
      description="Stream Monitor Frontend (Production)" \
      org.opencontainers.image.source="https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool"

# Start the httpd server
CMD ["busybox", "httpd", "-f", "-v", "-p", "8080", "-h", "/app"]