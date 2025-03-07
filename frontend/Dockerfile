# Development stage: Run the React app in dev mode with hot-reloading
FROM node:16-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Ensure the dev server listens on all interfaces
ENV HOST=0.0.0.0

# Expose port 3000 (matching React dev server default)
EXPOSE 3000

# Health check (verify dev server responsiveness)
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000 || exit 1

# Start the app in development mode with hot-reload
CMD ["npm", "start"]

# Container metadata
LABEL maintainer="DevOps Team <kashimkyari@gmail.com>" \
      version="2.0-dev" \
      description="Stream Monitor Frontend (Development Mode)" \
      org.opencontainers.image.source="https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool"