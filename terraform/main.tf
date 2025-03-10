terraform {
  required_version = ">= 0.12"
}

provider "aws" {
  region = var.aws_region
}

# Create an SSH key pair resource using your public key
resource "aws_key_pair" "default" {
  key_name   = var.key_name
  public_key = file(var.public_key_path)
}

# Define a security group to allow SSH, backend (port 5000), frontend (port 3000),
# and PostgreSQL (port 5432, restricted to allowed CIDRs)
resource "aws_security_group" "instance_sg" {
  name        = "instance-sg"
  description = "Allow inbound SSH, backend, frontend, and PostgreSQL access"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs_ssh
  }

  ingress {
    description = "Flask Backend"
    from_port   = 5000
    to_port     = 5000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "React Frontend"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs_postgres
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Provision a GPU-enabled EC2 instance (example instance type: g4dn.xlarge)
resource "aws_instance" "gpu_instance" {
  ami                    = var.ami_id            # Replace with a valid GPU-enabled AMI ID
  instance_type          = var.instance_type     # e.g., "g4dn.xlarge"
  key_name               = aws_key_pair.default.key_name
  security_groups        = [aws_security_group.instance_sg.name]
  associate_public_ip_address = true

  # The user_data script installs necessary packages, clones the repository,
  # sets up PostgreSQL, installs dependencies, downloads the spaCy model,
  # and starts both the Python backend and the React frontend (if available).
  user_data = <<-EOF
    #!/bin/bash
    set -e

    # Update packages and install dependencies
    sudo apt-get update -y
    sudo apt-get upgrade -y
    sudo apt-get install -y git python3 python3-pip npm nodejs postgresql postgresql-contrib

    # Clone the repository containing app.py and the React frontend code
    git clone https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool.git /home/ubuntu/AI_LiveStream_Monioring_Tool
    cd /home/ubuntu/AI_LiveStream_Monioring_Tool

    # -------------------------------
    # PostgreSQL Setup
    # -------------------------------
    sudo service postgresql start
    # Create the database user and database if they do not exist (credentials per app.py)
    sudo -u postgres psql -c "DO \$\$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
          CREATE ROLE postgres LOGIN PASSWORD 'password';
        END IF;
      END\$\$;"
    sudo -u postgres psql -c "SELECT 'CREATE DATABASE stream_monitor' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'stream_monitor')\gexec"

    # -------------------------------
    # Environment Variables for the App
    # -------------------------------
    export DB_HOST=localhost
    export DB_PORT=5432
    export DB_USER=postgres
    export DB_PASSWORD=password
    export NEW_DB_NAME=stream_monitor

    # -------------------------------
    # Python Backend Setup
    # -------------------------------
    # Install Python dependencies (if a requirements.txt exists)
    if [ -f requirements.txt ]; then
      sudo pip3 install -r requirements.txt
    fi
    # Ensure spaCy is installed and download the English model
    sudo pip3 install spacy
    python3 -m spacy download en_core_web_sm

    # Start the Python backend in the background and log output
    nohup python3 app.py > backend.log 2>&1 &

    # -------------------------------
    # React Frontend Setup
    # -------------------------------
    # If a frontend directory exists, install Node dependencies and start the app
    if [ -d "frontend" ]; then
      cd frontend
      npm install
      nohup npm start > frontend.log 2>&1 &
    fi
  EOF

  tags = {
    Name = "GPU-EC2-Instance"
  }
}

# Allocate an Elastic IP and attach it to the instance
resource "aws_eip" "instance_eip" {
  instance = aws_instance.gpu_instance.id
  vpc      = true
}

# -------------------------------
# Variables for Customization
# -------------------------------
variable "aws_region" {
  description = "AWS region to deploy resources"
  default     = "us-east-1"
}

variable "ami_id" {
  description = "AMI ID for a GPU-enabled instance (e.g., an Ubuntu GPU AMI or Deep Learning AMI)"
  default     = "ami-0xxxxxxx"  # Replace with a valid AMI ID
}

variable "instance_type" {
  description = "EC2 instance type (must be GPU-enabled)"
  default     = "g4dn.xlarge"
}

variable "key_name" {
  description = "Name of the existing AWS key pair to use"
  default     = "my-key"  # Replace with your key pair name
}

variable "public_key_path" {
  description = "Local path to the public SSH key"
  default     = "~/.ssh/id_rsa.pub"
}

variable "vpc_id" {
  description = "The VPC ID in which to launch the instance"
  default     = "vpc-xxxxxxxx"  # Replace with your VPC ID
}

variable "allowed_cidrs_ssh" {
  description = "CIDR blocks allowed to access SSH"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "allowed_cidrs_postgres" {
  description = "CIDR blocks allowed to access PostgreSQL (typically localhost)"
  type        = list(string)
  default     = ["127.0.0.1/32"]
}
