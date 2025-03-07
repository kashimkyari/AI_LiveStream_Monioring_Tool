# Stream Monitor - AI LiveStream Monitoring Tool

## Overview

Stream Monitor is a comprehensive AI-powered application designed to monitor and analyze live video streams in real-time. The application utilizes advanced computer vision and machine learning algorithms to detect events, objects, and anomalies in video feeds, providing timely alerts and insights to users.

## Architecture

The application follows a microservices architecture with two main components:

- **Frontend**: A lightweight React application served via Busybox httpd
- **Backend**: API server handling stream processing, AI analysis, and data storage

### Technology Stack

- **Frontend**: React.js, served by Busybox httpd
- **Backend**: Python (Flask/FastAPI)
- **Containerization**: Docker
- **Orchestration**: Kubernetes
- **Container Registry**: AWS ECR
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Docker and Docker Compose for local development
- kubectl and AWS CLI for production deployment
- Node.js 16+ for frontend development

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool.git
   cd AI_LiveStream_Monioring_Tool
   ```

2. Start the development environment:
   ```bash
   docker-compose up -d
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

### Production Deployment

1. Build and push Docker images:
   ```bash
   # Build and push frontend image
   docker build -t 038462756156.dkr.ecr.us-east-1.amazonaws.com/stream-monitor-frontend:latest -f frontend/Dockerfile frontend/
   docker push 038462756156.dkr.ecr.us-east-1.amazonaws.com/stream-monitor-frontend:latest
   
   # Build and push backend image (command will vary based on backend Dockerfile location)
   ```

2. Deploy to Kubernetes:
   ```bash
   kubectl apply -f k8s/deploy-frontend.yml
   kubectl apply -f k8s/deploy-backend.yml  # Assuming this file exists
   ```

## Features

- Real-time video stream monitoring
- Object detection and tracking
- Event and anomaly detection
- Customizable alerts and notifications
- Historical data analysis and reporting
- User-friendly dashboard interface

## Security Features

The application implements several security best practices:

- Non-root container execution
- Read-only root filesystem in production
- Minimized container capabilities
- Resource limits and requests
- Health checks and liveness probes
- Rolling update deployment strategy

## Monitoring and Maintenance

### Checking Application Status

```bash
# Get pod status
kubectl get pods -l app=stream-monitor-frontend

# View frontend logs
kubectl logs -l app=stream-monitor-frontend

# View backend logs
kubectl logs -l app=stream-monitor-backend
```

### Scaling

The application utilizes Horizontal Pod Autoscaler to automatically adjust to traffic demands:

```bash
# Check HPA status
kubectl get hpa
```

Manual scaling is also possible:

```bash
kubectl scale deployment stream-monitor-frontend --replicas=3
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

Project maintainer: DevOps Team - kashimkyari@gmail.com

GitHub Repository: https://github.com/kashimkyari/AI_LiveStream_Monioring_Tool