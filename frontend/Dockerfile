FROM node:18

# Set working directory
WORKDIR /app

# Copy package manifests and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the source code and build the React app
COPY . .
RUN npm run build

# Install a static file server globally
RUN npm install -g serve

# Expose the port the app will run on
EXPOSE 3000

# Serve the built app on port 3000
CMD ["serve", "-s", "build", "-l", "3000"]
