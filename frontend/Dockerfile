# Stage 1: Build the React app using Node.js
FROM node:16-alpine as build

# Set working directory for the build process
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the entire frontend code and build the production bundle
COPY . .
RUN npm run build

# Stage 2: Serve the built React app with Nginx
FROM nginx:stable-alpine

# Copy the production build from the previous stage into Nginx's html directory
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80 for serving HTTP traffic
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
