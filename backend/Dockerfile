FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies (modify as needed)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libffi-dev \
    libssl-dev \
    libgl1-mesa-glx

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy the application source code
COPY . .

# Expose the port the app listens on
EXPOSE 5000

# Start the Flask backend
CMD ["python", "app.py"]
