#!/bin/bash
set -e

# Update system packages
sudo apt-get update
sudo apt-get upgrade -y

# Install required packages: Python3, pip, git, Node.js, npm
sudo apt-get install -y python3 python3-pip git nodejs npm

# Define application directories (adjust these as needed)
APP_DIR="/home/ubuntu/myapp"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

# (Optional) Clone your repository if not already present
https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool.git $APP_DIR

# Install backend Python dependencies
cd "$BACKEND_DIR"
pip3 install -r requirements.txt

# Install frontend dependencies if a package.json exists
if [ -f "$FRONTEND_DIR/package.json" ]; then
  cd "$FRONTEND_DIR"
  npm install
fi

# Create systemd service file for the backend
sudo bash -c "cat > /etc/systemd/system/backend.service <<EOF
[Unit]
Description=Backend Flask Application
After=network.target

[Service]
User=ubuntu
WorkingDirectory=${BACKEND_DIR}
ExecStart=/usr/bin/python3 app.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF"

# Create systemd service file for the frontend if package.json exists
if [ -f "$FRONTEND_DIR/package.json" ]; then
  sudo bash -c "cat > /etc/systemd/system/frontend.service <<EOF
[Unit]
Description=Frontend Application
After=network.target

[Service]
User=ubuntu
WorkingDirectory=${FRONTEND_DIR}
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
EOF"
fi

# Reload systemd to pick up the new service files
sudo systemctl daemon-reload

# Enable and start the backend service
sudo systemctl enable backend.service
sudo systemctl start backend.service

# Enable and start the frontend service if applicable
if [ -f "$FRONTEND_DIR/package.json" ]; then
  sudo systemctl enable frontend.service
  sudo systemctl start frontend.service
fi

echo "Installation complete. The backend and frontend services have been installed and started."
