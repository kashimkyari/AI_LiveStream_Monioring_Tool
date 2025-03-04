# ---------- Backend Stage (Flask) ----------
FROM python:3.9 AS backend

WORKDIR /app/backend

# Install system dependencies needed for Python packages and OpenCV
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
    libpq-dev \
    build-essential \
    libffi-dev \
    libssl-dev \
    libgl1-mesa-glx

# Copy and install backend dependencies
COPY backend/requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model (adjust if you use a different model)
RUN python -m spacy download en_core_web_sm

# Copy the backend source code
COPY backend .

EXPOSE 5000

# ---------- Frontend Stage (React) ----------
FROM node:18 AS frontend

WORKDIR /app/frontend

# Copy package manifests and install frontend dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

# Copy the rest of the frontend source code
COPY frontend .

# (For development purposes, we run the frontend without building a production bundle)

# ---------- Final Stage (Run Both Processes) ----------
FROM node:18 AS final

# Install Python runtime
RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

# Copy backend and frontend from previous stages
COPY --from=backend /app/backend /app/backend
COPY --from=frontend /app/frontend /app/frontend

# Copy an entrypoint script to run both processes
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose ports (backend on 5000 and frontend on 3000)
EXPOSE 5000 3000

CMD ["/app/start.sh"]
