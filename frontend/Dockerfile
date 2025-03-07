# Use an official Node.js runtime as a lightweight base image
FROM node:16-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application (assuming it's a React/Vue/Angular app)
RUN npm run build

# Create production image
FROM nginx:alpine

# Copy the build output from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx config if needed
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Configure container health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

# Expose the port for the application
EXPOSE 80

# Set user to non-root for better security
USER nginx

# NGINX starts automatically, no need for CMD