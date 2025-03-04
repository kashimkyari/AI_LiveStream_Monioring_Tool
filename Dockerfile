# --------------------------
# Stage 1: Build Flask Backend
# --------------------------
FROM python:3.9 AS backend

WORKDIR /app/backend

# Install system dependencies needed for Python packages and OpenCV support
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
    libpq-dev \
    build-essential \
    libffi-dev \
    libssl-dev \
    libgl1-mesa-glx

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Download the spaCy English model (if your app uses it)
RUN python -m spacy download en_core_web_sm

# Copy the rest of the backend source code (including app.py)
COPY backend/ .

EXPOSE 5000

# --------------------------
# Stage 2: Build React Frontend
# --------------------------
FROM node:18 AS frontend

WORKDIR /app/frontend

# Copy package manifests and install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

# Copy the rest of the frontend source code
COPY frontend/ .

# (We are using 'npm start' so no production build is performed here)
EXPOSE 3000

# --------------------------
# Stage 3: Final Stage - Combine and Run Both
# --------------------------
FROM node:18 AS final

# Install Python runtime
RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

# Copy backend and frontend from previous stages
COPY --from=backend /app/backend /app/backend
COPY --from=frontend /app/frontend /app/frontend

# Copy entrypoint script that starts both servers
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 5000 3000

CMD ["/app/start.sh"]
