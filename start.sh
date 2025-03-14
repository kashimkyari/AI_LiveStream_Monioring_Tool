#!/bin/bash

# Pull latest changes
git pull

# Start frontend
cd frontend
npm run devstart &

# Start backend
cd ../backend
pip install -r requirements.txt
exec python -m gunicorn --workers 4 --bind 0.0.0.0:5000 main:app  # Modified line