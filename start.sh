#!/bin/bash

# Pull latest changes
git pull

# Start frontend
cd frontend
npm run devstart &

# Start backend
cd ../backend
pip install -r requirements.txt 
exec /opt/pytorch/bin/gunicorn --workers 4 --bind 0.0.0.0:5000 main:app 

