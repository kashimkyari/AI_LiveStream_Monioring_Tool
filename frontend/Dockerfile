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

# Copy a custom nginx configuration if needed
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check: verify nginx responsiveness
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:80 || exit 1

# Container metadata
LABEL maintainer="DevOps Team <kashimkyari@gmail.com>" \
      version="2.0" \
      description="Stream Monitor Frontend (Production)" \
      org.opencontainers.image.source="https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool"

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]