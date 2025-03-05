FROM node:18

# Set working directory
WORKDIR /app

# Copy package manifests and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the React app using npm start
CMD ["npm", "start"]
