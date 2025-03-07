# Use an official Python runtime as the base image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire backend code (including app.py)
COPY . .

# Expose port 5000 (Flask/Gunicorn will listen here)
EXPOSE 5000

# Start the Flask application using Gunicorn
# Assumes that app.py contains a WSGI application named "app"
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--workers", "3"]
