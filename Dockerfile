# ---------- Backend Stage (Flask) ----------
FROM python:3.9 AS backend

WORKDIR /app/backend

# Install system dependencies required by some Python packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
    libpq-dev \
    build-essential \
    libffi-dev \
    libssl-dev

# Copy and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY backend .

# Expose Flask's default port
EXPOSE 5000

# ---------- Frontend Stage (React) ----------
FROM node:18 AS frontend

WORKDIR /app/frontend

# Copy package manifests and install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

# Copy the rest of the frontend code
COPY frontend .

# Build the React app
RUN npm run build

# ---------- Final Stage (Combine and Serve) ----------
FROM python:3.9 AS final

WORKDIR /app

# Copy the backend from the backend stage
COPY --from=backend /app/backend /app/backend

# Copy the React build into the backend's static folder for serving
COPY --from=frontend /app/frontend/build /app/backend/static

# Set environment variables for Flask
ENV FLASK_APP=backend/app.py
ENV FLASK_RUN_HOST=0.0.0.0

# Start the Flask app
CMD ["python", "backend/app.py"]
