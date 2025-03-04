#!/bin/sh
# Start the React frontend in the background
cd /app/frontend && npm start &
# Wait a few seconds to allow the frontend to initialize
sleep 5
# Start the Flask backend
cd /app/backend && python app.py
