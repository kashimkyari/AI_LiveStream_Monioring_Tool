# Use an official Node.js runtime as a lightweight base image.
FROM node:16-alpine

# Set the working directory in the container.
WORKDIR /app

# Copy the package.json and package-lock.json (if available) for dependency installation.
COPY package*.json ./

# Install production dependencies.
RUN npm install

# Copy all application source code into the container.
COPY . .

# Expose the port that your application listens on.
# Adjust the port number if your app uses a different port.
EXPOSE 3000

# Set the default command to run your Node.js application.
CMD ["npm", "start"]
