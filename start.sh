#!/bin/sh
# Start the React frontend (runs on port 3000)
cd /app/frontend && npm start &

# Optionally, wait a few seconds for the frontend to initialize
sleep 5

# Start the Flask backend (runs on port 5000)
cd /app/backend && python app.py
