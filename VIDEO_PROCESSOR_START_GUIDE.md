# Video Processor Start Guide 🎬

## Quick Start (Recommended)

The TypeScript build is having issues with the output directory structure. Use the development mode instead:

```bash
cd video-processor
./start-dev.sh
```

This will start the video processor using `tsx` (TypeScript runtime) without needing to compile.

## Alternative Methods

### 1. Fix Build and Run (if you want compiled output)
```bash
./build-fix.sh
npm start
```

### 2. Direct Development Mode
```bash
npm run dev
```

### 3. Check Build Issues
```bash
./check-build.sh
```

## Service Details

- **Port**: 3002
- **Health Check**: GET http://localhost:3002/health
- **Process Video**: POST http://localhost:3002/process
  ```json
  {
    "jobId": "your-cuid-job-id"
  }
  ```

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  VideoStacking   │────▶│ Video Processor │
│   (Port 3000)   │     │   API (3001)     │     │    (Port 3002)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                          │
                                ▼                          ▼
                          ┌──────────┐              ┌──────────┐
                          │ Database │              │  FFMPEG  │
                          └──────────┘              └──────────┘
```

## Troubleshooting

### If `tsx` is not found:
```bash
npm install --save-dev tsx
```

### If port 3002 is already in use:
```bash
lsof -i :3002
kill -9 <PID>
```

### To run without any dependencies:
The service has fallbacks for:
- Redis → Mock queue (direct processing)
- S3 → Local file storage
- External APIs → Placeholder responses

## Next Steps

1. Start the video processor: `./start-dev.sh`
2. Check health: `curl http://localhost:3002/health`
3. The main API at port 3001 can now send video jobs to this processor

The video processor is now ready to handle video generation requests!