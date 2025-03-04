# ---------- Backend Stage (Flask) ----------
FROM python:3.9 AS backend

WORKDIR /app/backend

# Install system dependencies required for building Python packages and OpenCV support
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
    libpq-dev \
    build-essential \
    libffi-dev \
    libssl-dev \
    libgl1-mesa-glx

# Copy and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy English model
RUN python -m spacy download en_core_web_sm

# Copy the backend source code
COPY backend .

# Expose Flask's port
EXPOSE 5000

# ---------- Frontend Stage (React) ----------
FROM node:18 AS frontend

WORKDIR /app/frontend

# Copy package manifests and install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

# Copy the rest of the frontend source code
COPY frontend .

# ---------- Final Stage (Run Both Processes) ----------
FROM node:18 AS final

# Install Python 3 and pip
RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

# Copy the backend from the backend stage
COPY --from=backend /app/backend /app/backend

# Copy the frontend from the frontend stage
COPY --from=frontend /app/frontend /app/frontend

# Copy entrypoint script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose ports for backend and frontend
EXPOSE 5000 3000

# Start both frontend and backend
CMD ["/app/start.sh"]
