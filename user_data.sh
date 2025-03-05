#!/bin/bash

# Update and install required packages
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip nginx npm git postgresql postgresql-contrib

# Install PM2 globally
echo "Installing PM2..."
npm install -g pm2 serve

# Set GitHub repo details
REPO_URL="https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool.git"  # Change this to your actual repo
APP_DIR="/home/ubuntu/app"

# Clone the GitHub repo
echo "Cloning repository..."
if [ ! -d "$APP_DIR" ]; then
    git clone $REPO_URL $APP_DIR
else
    echo "Repository already exists. Pulling latest changes..."
    cd $APP_DIR && git pull origin main
fi

# Define backend and frontend paths
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

# Set up PostgreSQL with default credentials
echo "Configuring PostgreSQL..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

sudo -u postgres psql <<EOF
ALTER USER postgres PASSWORD 'password';
DROP DATABASE IF EXISTS stream_monitor;
CREATE DATABASE stream_monitor;
GRANT ALL PRIVILEGES ON DATABASE stream_monitor TO postgres;
EOF

# Install Flask dependencies
echo "Setting up Flask backend..."
cd $BACKEND_DIR
pip3 install -r requirements.txt

# Create a systemd service for Flask API
echo "Creating Flask systemd service..."
FLASK_SERVICE="/etc/systemd/system/flask_api.service"
sudo bash -c "cat > $FLASK_SERVICE" <<EOF
[Unit]
Description=Flask API Service
After=network.target postgresql.service

[Service]
User=ubuntu
WorkingDirectory=$BACKEND_DIR
Environment="DATABASE_URL=postgresql://postgres:password@localhost:5432/stream_monitor"
ExecStart=/usr/bin/python3 $BACKEND_DIR/app.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start Flask API service
echo "Starting Flask API service..."
sudo systemctl daemon-reload
sudo systemctl enable flask_api
sudo systemctl start flask_api

# Build and serve the React frontend
echo "Setting up React frontend..."
cd $FRONTEND_DIR
npm install
npm run build
pm2 serve $FRONTEND_DIR/build --name react_frontend --spa

# Save PM2 process list to start on reboot
pm2 startup
pm2 save

# Configure Nginx as a reverse proxy
echo "Configuring Nginx..."
NGINX_CONFIG="/etc/nginx/sites-available/default"
sudo bash -c "cat > $NGINX_CONFIG" <<EOF
server {
    listen 80;

    location /api/ {
        proxy_pass http://127.0.0.1:5000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location / {
        root $FRONTEND_DIR/build;
        index index.html;
        try_files \$uri /index.html;
    }
}
EOF

# Restart Nginx to apply changes
echo "Restarting Nginx..."
sudo systemctl restart nginx

echo "Deployment completed successfully!"
