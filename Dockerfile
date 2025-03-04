# Backend Stage (Flask)
FROM python:3.9 AS backend

WORKDIR /app/backend

# Copy and install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY backend .

# Expose Flask's default port
EXPOSE 5000

# Frontend Stage (React)
FROM node:18 AS frontend

WORKDIR /app/frontend

# Copy and install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

# Copy the rest of the frontend code
COPY frontend .

# Build the frontend
RUN npm run build

# Final Stage (Serving Both)
FROM python:3.9 AS final

WORKDIR /app

# Copy backend from the previous stage
COPY --from=backend /app/backend /app/backend

# Copy frontend build to serve it with Flask
COPY --from=frontend /app/frontend/build /app/backend/static

# Set environment variables for Flask
ENV FLASK_APP=backend/app.py
ENV FLASK_RUN_HOST=0.0.0.0

# Start the backend (which serves the frontend)
CMD ["python", "backend/app.py"]
