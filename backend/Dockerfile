# Use an official lightweight Python image.
FROM python:3.9-slim

# Set the working directory in the container.
WORKDIR /app

# Install system dependencies needed for your application.
# - build-essential and libpq-dev for compiling dependencies and PostgreSQL support.
# - libgl1-mesa-glx for OpenCV.
# - tesseract-ocr for pytesseract.
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libgl1-mesa-glx \
    tesseract-ocr \
 && rm -rf /var/lib/apt/lists/*

# Copy the requirements file if available and install Python dependencies.
# Ensure you have a requirements.txt in your project root.
COPY requirements.txt requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt && \
    # Download the spaCy English model required by your app
    python -m spacy download en_core_web_sm

# Copy all application files into the container.
COPY . .

# Expose the port that the Flask app listens on.
# (app.py runs on port 5000 as defined in your code)
EXPOSE 5000

# Set the default command to run your Python application.
CMD ["python", "app.py"]
