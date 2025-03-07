# Stage 1: Build the React app
FROM node:16-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies (use package-lock.json if available)
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the application code and build the app
COPY . .
RUN npm run build

# Stage 2: Serve the app using the 'serve' package
FROM node:16-alpine AS production
WORKDIR /app

# Install 'serve' globally and wget (used in health checks)
RUN npm install -g serve && apk add --no-cache wget

# Copy the built files from the builder stage
COPY --from=builder /app/build ./build

# Expose port 3000 (as specified)
EXPOSE 3000

# Health check to monitor container health on port 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000 || exit 1

# Start the app using serve in single-page application mode on port 3000
CMD ["serve", "-s", "build", "-l", "tcp://0.0.0.0:3000"]


# No need to switch to nginx user in this alpine image
# as it causes permission issues with default nginx config
# Add container labels
LABEL maintainer="DevOps Team <kashimkyari@gmail.com>" \
      version="2.0" \
      description="Stream Monitor Frontend" \
      org.opencontainers.image.source="https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool"