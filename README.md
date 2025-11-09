# Video Processor Service

A dedicated video processing service that handles FFMPEG operations for the Home Service Providers Media Generator platform.

## Features

- Scale-to-zero deployment on Railway
- HTTP endpoints for video processing jobs
- Integrates with existing FFMPEG code
- Shared database with VideoStacking
- S3/R2 storage integration

## Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /process` - Process a video job
  ```json
  {
    "jobId": "cuid_string"
  }
  ```

## Deployment

### Railway

1. Initialize Railway project:
   ```bash
   railway init
   ```

2. Link to existing project:
   ```bash
   railway link
   ```

3. Deploy:
   ```bash
   railway up
   ```

### Docker

Build and run locally:
```bash
docker build -t video-processor .
docker run -p 3002:3002 --env-file .env video-processor
```

## Environment Variables

See `.env.example` for required environment variables.

## Architecture

The service uses:
- Express.js for HTTP server
- Prisma for database access (shared with VideoStacking)
- fluent-ffmpeg for video processing
- AWS SDK for S3/R2 storage
- Winston for logging