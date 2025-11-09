# Deployment Testing and Validation Strategy
## Video Processor - Railway Deployment

### Document Version: 1.0.0
### Last Updated: 2025-11-08
### Owner: Tester Agent

---

## Table of Contents
1. [Overview](#overview)
2. [Pre-Deployment Validation](#pre-deployment-validation)
3. [Deployment Testing](#deployment-testing)
4. [Post-Deployment Validation](#post-deployment-validation)
5. [CI/CD Integration](#cicd-integration)
6. [Test Scenarios](#test-scenarios)
7. [Monitoring & Alerting](#monitoring--alerting)
8. [Rollback Procedures](#rollback-procedures)

---

## Overview

This document outlines the comprehensive testing and validation strategy for deploying the video-processor service to Railway. The strategy ensures zero-downtime deployments, proper environment configuration, and service reliability.

### Deployment Architecture
- **Platform**: Railway.app
- **Service**: video-processor
- **Container**: Docker-based (Node.js 23-alpine with FFmpeg)
- **Health Check**: `/health` endpoint
- **Scaling**: Auto-scaling (0-3 replicas)
- **Database**: Shared PostgreSQL with VideoStacking
- **Storage**: Cloudflare R2

---

## Pre-Deployment Validation

### 1. Docker Image Build Testing

**Objective**: Ensure Docker image builds successfully and contains all required dependencies.

#### Test Steps:
```bash
# Build the Docker image locally
cd video-processor
docker build -t video-processor:test .

# Verify FFmpeg installation
docker run --rm video-processor:test ffmpeg -version
docker run --rm video-processor:test ffprobe -version

# Verify Node.js version
docker run --rm video-processor:test node --version

# Check for required directories
docker run --rm video-processor:test ls -la /app
docker run --rm video-processor:test ls -la /tmp/video-processor
docker run --rm video-processor:test ls -la /app/assets
```

#### Success Criteria:
- ✅ Image builds without errors
- ✅ FFmpeg version 6.0+ installed
- ✅ FFprobe available
- ✅ Node.js v23.x present
- ✅ All required directories exist with correct permissions
- ✅ Prisma client generated
- ✅ Application code compiled to `/app/dist`

---

### 2. Environment Variable Validation

**Objective**: Verify all required environment variables are properly configured.

#### Required Variables Checklist:

**Core Configuration:**
- [ ] `NODE_ENV` (production/development)
- [ ] `PORT` (default: 3002)
- [ ] `DATABASE_URL` (PostgreSQL connection string)

**Storage Configuration:**
- [ ] `R2_ENDPOINT`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `R2_BUCKET_NAME`
- [ ] `R2_PUBLIC_URL` (optional)

**Processing Configuration:**
- [ ] `FFMPEG_PATH` (default: ffmpeg)
- [ ] `FFPROBE_PATH` (default: ffprobe)
- [ ] `MAX_CONCURRENT_JOBS` (default: 2)
- [ ] `JOB_TIMEOUT_MS` (default: 1800000)

**Path Configuration:**
- [ ] `TEMP_DIR` (default: /tmp/video-processor)
- [ ] `ASSET_PATH` (default: /app/assets)

#### Validation Script:
```typescript
// Run this script in Railway environment
import { config } from './src/config/environment.js'

const validateEnv = () => {
  const checks = {
    port: config.PORT > 0 && config.PORT < 65536,
    database: config.DATABASE_URL.startsWith('postgresql://'),
    r2Endpoint: config.R2_ENDPOINT.startsWith('http'),
    ffmpegPath: config.FFMPEG_PATH === 'ffmpeg',
    tempDir: config.TEMP_DIR.length > 0,
  }

  console.log('Environment Validation:', checks)
  return Object.values(checks).every(Boolean)
}
```

---

### 3. Dependency Verification

**Objective**: Confirm all npm dependencies are installed and compatible.

#### Test Commands:
```bash
# Run inside Docker container
docker run --rm video-processor:test npm list --depth=0

# Check for security vulnerabilities
docker run --rm video-processor:test npm audit --production

# Verify Prisma client
docker run --rm video-processor:test npx prisma validate
```

#### Success Criteria:
- ✅ All dependencies installed
- ✅ No critical vulnerabilities
- ✅ Prisma schema valid
- ✅ Production dependencies only

---

### 4. Configuration Testing

**Objective**: Test application configuration loading and validation.

#### Test Script:
```typescript
// tests/config.test.ts
import { describe, it, expect } from 'vitest'
import { config } from '../src/config/environment.js'

describe('Configuration Validation', () => {
  it('should load PORT correctly', () => {
    expect(config.PORT).toBeGreaterThan(0)
    expect(config.PORT).toBeLessThan(65536)
  })

  it('should validate DATABASE_URL format', () => {
    expect(config.DATABASE_URL).toMatch(/^postgresql:\/\//)
  })

  it('should set correct NODE_ENV', () => {
    expect(['development', 'production', 'test']).toContain(config.NODE_ENV)
  })

  it('should configure FFmpeg paths', () => {
    expect(config.FFMPEG_PATH).toBeTruthy()
    expect(config.FFPROBE_PATH).toBeTruthy()
  })
})
```

---

## Deployment Testing

### 1. Railway Deployment Smoke Tests

**Objective**: Verify service deploys and starts correctly on Railway.

#### Test Sequence:

**Step 1: Trigger Deployment**
```bash
# Using Railway CLI
railway up

# Monitor build logs
railway logs --follow
```

**Step 2: Health Check Verification**
```bash
# Wait for deployment to complete
sleep 30

# Test health endpoint
curl -f https://your-service.railway.app/health

# Expected response:
# {
#   "status": "healthy",
#   "service": "video-processor",
#   "timestamp": "2025-11-08T..."
# }
```

**Step 3: Container Startup Test**
```bash
# Verify container is running
railway status

# Check startup logs for errors
railway logs --tail 100
```

#### Success Criteria:
- ✅ Build completes in < 5 minutes
- ✅ Container starts successfully
- ✅ Health check returns 200 OK
- ✅ No startup errors in logs
- ✅ Service responds within 2 seconds

---

### 2. Health Check Endpoint Testing

**Objective**: Validate health check endpoint functionality.

#### Test Cases:

**Test 1: Basic Health Check**
```bash
curl -X GET https://your-service.railway.app/health \
  -H "Accept: application/json"

# Expected: 200 OK
# Response includes: status, service, timestamp
```

**Test 2: Health Check During Load**
```bash
# Concurrent health checks
for i in {1..10}; do
  curl -f https://your-service.railway.app/health &
done
wait

# All should return 200 OK
```

**Test 3: Health Check Timeout**
```bash
# Test with 5-second timeout
curl -f --max-time 5 https://your-service.railway.app/health

# Should respond within timeout
```

---

### 3. Service Connectivity Tests

**Objective**: Verify service can connect to external dependencies.

#### Database Connectivity:
```typescript
// tests/integration/database.test.ts
import { describe, it, expect } from 'vitest'
import { prisma } from '../src/database/prisma-client.js'

describe('Database Connectivity', () => {
  it('should connect to PostgreSQL', async () => {
    await expect(prisma.$connect()).resolves.not.toThrow()
  })

  it('should execute simple query', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as value`
    expect(result).toBeDefined()
  })

  it('should disconnect gracefully', async () => {
    await expect(prisma.$disconnect()).resolves.not.toThrow()
  })
})
```

#### R2 Storage Connectivity:
```typescript
// tests/integration/storage.test.ts
import { describe, it, expect } from 'vitest'
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'
import { config } from '../src/config/environment.js'

describe('R2 Storage Connectivity', () => {
  const s3Client = new S3Client({
    endpoint: config.R2_ENDPOINT,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
    region: 'auto',
  })

  it('should connect to R2 bucket', async () => {
    const command = new HeadBucketCommand({ Bucket: config.R2_BUCKET_NAME })
    await expect(s3Client.send(command)).resolves.not.toThrow()
  })
})
```

---

### 4. Integration with Existing Services

**Objective**: Verify video-processor integrates with VideoStacking service.

#### Test Scenarios:

**Test 1: Video Processing Request**
```bash
# Send test request from VideoStacking service
curl -X POST https://video-processor.railway.app/process \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "cm12345678901234567890",
    "platform": "youtube",
    "targetDuration": 60,
    "settings": {
      "layoutMode": "single",
      "transitions": "fade"
    }
  }'

# Expected: 200 OK with job acknowledgment
```

**Test 2: Enhanced Processing Request**
```bash
curl -X POST https://video-processor.railway.app/enhance \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "cm12345678901234567890",
    "platform": "youtube",
    "mediaIds": ["media-1", "media-2"],
    "enhancements": {
      "logo": { "enabled": true },
      "music": { "enabled": true }
    },
    "settings": {},
    "organizationId": "org-123"
  }'

# Expected: 200 OK with processing result
```

---

## Post-Deployment Validation

### 1. Video Processing Functionality Tests

**Objective**: Verify end-to-end video processing works correctly.

#### Test Suite:

**Test 1: Simple Video Generation**
```typescript
// tests/e2e/simple-video.test.ts
import { describe, it, expect } from 'vitest'

describe('Simple Video Processing', () => {
  it('should generate video from single image', async () => {
    const response = await fetch('https://your-service.railway.app/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: 'test-video-001',
        platform: 'youtube',
        mediaIds: ['test-image-1'],
        enhancements: {},
        settings: { duration: 5 },
        organizationId: 'test-org'
      })
    })

    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.success).toBe(true)
    expect(result.outputPath).toBeDefined()
  })
})
```

**Test 2: Multi-Image Slideshow**
```typescript
it('should generate slideshow from multiple images', async () => {
  const response = await fetch('https://your-service.railway.app/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId: 'test-video-002',
      platform: 'instagram',
      mediaIds: ['img-1', 'img-2', 'img-3'],
      enhancements: {
        music: { enabled: true, trackUrl: 'https://...' }
      },
      settings: { duration: 15 },
      organizationId: 'test-org'
    })
  })

  expect(response.status).toBe(200)
})
```

**Test 3: Platform-Specific Processing**
```typescript
const platforms = ['youtube', 'instagram', 'tiktok', 'facebook', 'linkedin']

platforms.forEach(platform => {
  it(`should process video for ${platform}`, async () => {
    const response = await fetch('https://your-service.railway.app/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: `test-${platform}`,
        platform,
        mediaIds: ['test-image'],
        enhancements: {},
        settings: {},
        organizationId: 'test-org'
      })
    })

    expect(response.status).toBe(200)
  })
})
```

---

### 2. Performance Benchmarks

**Objective**: Validate processing performance meets requirements.

#### Benchmark Tests:

**Test 1: Processing Time**
```typescript
// tests/performance/processing-time.test.ts
import { describe, it, expect } from 'vitest'

describe('Processing Performance', () => {
  it('should process single image in < 10 seconds', async () => {
    const start = Date.now()

    await fetch('https://your-service.railway.app/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: 'perf-test-001',
        platform: 'youtube',
        mediaIds: ['test-image'],
        enhancements: {},
        settings: { duration: 5 },
        organizationId: 'test-org'
      })
    })

    const duration = Date.now() - start
    expect(duration).toBeLessThan(10000) // 10 seconds
  })

  it('should process 5 images in < 30 seconds', async () => {
    const start = Date.now()

    await fetch('https://your-service.railway.app/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: 'perf-test-002',
        platform: 'youtube',
        mediaIds: ['img-1', 'img-2', 'img-3', 'img-4', 'img-5'],
        enhancements: { music: { enabled: true } },
        settings: { duration: 15 },
        organizationId: 'test-org'
      })
    })

    const duration = Date.now() - start
    expect(duration).toBeLessThan(30000) // 30 seconds
  })
})
```

**Test 2: Concurrent Processing**
```bash
# Load test with Apache Bench
ab -n 10 -c 2 -T 'application/json' \
  -p test-payload.json \
  https://your-service.railway.app/enhance

# Expected:
# - All requests succeed
# - 95th percentile < 15 seconds
# - No timeout errors
```

---

### 3. Error Handling Verification

**Objective**: Ensure proper error handling and recovery.

#### Error Test Cases:

**Test 1: Invalid Input**
```typescript
it('should handle invalid videoId', async () => {
  const response = await fetch('https://your-service.railway.app/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId: 'invalid-id',
      platform: 'youtube',
      mediaIds: [],
      enhancements: {},
      settings: {},
      organizationId: 'test-org'
    })
  })

  expect(response.status).toBe(400)
  const error = await response.json()
  expect(error.error).toBeDefined()
})
```

**Test 2: Missing Required Fields**
```typescript
it('should reject request with missing fields', async () => {
  const response = await fetch('https://your-service.railway.app/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId: 'test-123'
      // Missing platform, mediaIds, etc.
    })
  })

  expect(response.status).toBe(400)
})
```

**Test 3: Database Connection Failure**
```typescript
it('should handle database disconnection gracefully', async () => {
  // This test requires manual database shutdown
  // Verify service returns appropriate error
  // and doesn't crash
})
```

---

### 4. Rollback Testing

**Objective**: Verify rollback procedures work correctly.

#### Rollback Test Sequence:

**Step 1: Deploy New Version**
```bash
# Deploy potentially problematic version
railway up

# Note deployment ID
DEPLOYMENT_ID=$(railway status --json | jq -r '.deploymentId')
```

**Step 2: Verify Issues**
```bash
# Run health checks
curl -f https://your-service.railway.app/health

# Check for errors in logs
railway logs --tail 50
```

**Step 3: Execute Rollback**
```bash
# Rollback to previous deployment
railway rollback

# Verify service is healthy
curl -f https://your-service.railway.app/health
```

**Step 4: Validate Rollback Success**
```bash
# Test core functionality
curl -X POST https://your-service.railway.app/enhance \
  -H "Content-Type: application/json" \
  -d @test-payload.json

# Verify previous version is running
railway status
```

---

## CI/CD Integration

### 1. Automated Deployment Tests

**Objective**: Integrate testing into Railway deployment pipeline.

#### GitHub Actions Workflow:
```yaml
# .github/workflows/deploy-railway.yml
name: Deploy to Railway

on:
  push:
    branches: [main]
    paths:
      - 'video-processor/**'

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '23'

      - name: Install Dependencies
        working-directory: ./video-processor
        run: npm ci

      - name: Run Unit Tests
        working-directory: ./video-processor
        run: npm test

      - name: Build Docker Image
        working-directory: ./video-processor
        run: docker build -t video-processor:test .

      - name: Test Docker Image
        run: |
          docker run --rm video-processor:test ffmpeg -version
          docker run --rm video-processor:test node --version

      - name: Deploy to Railway
        uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: video-processor

      - name: Wait for Deployment
        run: sleep 30

      - name: Health Check
        run: |
          curl -f ${{ secrets.RAILWAY_SERVICE_URL }}/health

      - name: Run Integration Tests
        env:
          SERVICE_URL: ${{ secrets.RAILWAY_SERVICE_URL }}
        run: npm run test:integration

      - name: Rollback on Failure
        if: failure()
        run: |
          railway rollback
```

---

### 2. Railway CLI Integration Tests

**Objective**: Automate Railway-specific testing.

#### Test Script:
```bash
#!/bin/bash
# scripts/railway-integration-test.sh

set -e

echo "🚀 Starting Railway Integration Tests"

# 1. Check Railway CLI
if ! command -v railway &> /dev/null; then
  echo "❌ Railway CLI not installed"
  exit 1
fi

# 2. Login to Railway
railway login --token "$RAILWAY_TOKEN"

# 3. Link to project
railway link

# 4. Get service URL
SERVICE_URL=$(railway status --json | jq -r '.url')

# 5. Test health endpoint
echo "Testing health endpoint..."
if curl -f "$SERVICE_URL/health"; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  exit 1
fi

# 6. Test video processing
echo "Testing video processing..."
RESPONSE=$(curl -s -X POST "$SERVICE_URL/enhance" \
  -H "Content-Type: application/json" \
  -d @tests/fixtures/test-request.json)

if echo "$RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Video processing test passed"
else
  echo "❌ Video processing test failed"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ All Railway integration tests passed"
```

---

### 3. Environment Promotion Strategy

**Objective**: Define safe deployment progression across environments.

#### Promotion Pipeline:

**Stage 1: Development**
```
Environment: railway-dev
Branch: develop
Auto-deploy: Yes
Tests: Unit + Integration
```

**Stage 2: Staging**
```
Environment: railway-staging
Branch: staging
Auto-deploy: On PR merge
Tests: Unit + Integration + E2E
Performance Tests: Yes
Load Tests: Light (10 concurrent)
```

**Stage 3: Production**
```
Environment: railway-prod
Branch: main
Auto-deploy: No (Manual approval)
Tests: Full suite + Smoke tests
Performance Tests: Yes
Load Tests: Full (50 concurrent)
Rollback Plan: Required
```

#### Promotion Checklist:

**Dev → Staging:**
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Code review approved
- [ ] No critical security issues
- [ ] Database migrations tested

**Staging → Production:**
- [ ] Staging tests pass for 24 hours
- [ ] Performance benchmarks met
- [ ] Load tests successful
- [ ] Security audit complete
- [ ] Rollback plan documented
- [ ] Stakeholder approval obtained
- [ ] Monitoring configured
- [ ] Alerts configured

---

## Test Scenarios

### 1. Successful Deployment Flow

**Scenario**: Normal deployment with no issues.

**Steps:**
1. Code pushed to `main` branch
2. GitHub Actions triggered
3. Docker image built
4. Railway deployment initiated
5. Health check passes
6. Integration tests run
7. Service live in production

**Expected Results:**
- ✅ Deployment completes in < 5 minutes
- ✅ Zero downtime
- ✅ All tests pass
- ✅ Monitoring shows healthy state

---

### 2. Failed Deployment Handling

**Scenario**: Deployment fails due to configuration error.

**Steps:**
1. Deploy version with invalid DATABASE_URL
2. Container fails to start
3. Health check times out
4. Railway marks deployment as failed
5. Rollback triggered automatically
6. Previous version restored

**Expected Results:**
- ✅ Failure detected within 2 minutes
- ✅ Automatic rollback completes
- ✅ Service restored to working state
- ✅ Alert sent to team

---

### 3. Environment Variable Misconfiguration

**Scenario**: Missing or invalid environment variable.

**Test Cases:**

**Test 1: Missing DATABASE_URL**
```typescript
// Simulate missing variable
delete process.env.DATABASE_URL

// Expected: Service fails to start with clear error message
```

**Test 2: Invalid R2_ENDPOINT**
```typescript
// Set invalid endpoint
process.env.R2_ENDPOINT = 'invalid-url'

// Expected: Storage operations fail gracefully
// Service continues for non-storage operations
```

---

### 4. Service Dependency Failures

**Scenario**: External service (database, R2) becomes unavailable.

**Test Cases:**

**Test 1: Database Connection Lost**
```typescript
// During processing, database connection drops
// Expected:
// - Current requests fail gracefully
// - Health check returns degraded status
// - Service attempts reconnection
// - No process crash
```

**Test 2: R2 Storage Unavailable**
```typescript
// R2 endpoint unreachable
// Expected:
// - Upload operations fail with clear error
// - Download operations retry with exponential backoff
// - Service remains responsive
```

---

### 5. Rollback Procedures

**Scenario**: Need to rollback to previous version.

**Manual Rollback:**
```bash
# Step 1: Identify last good deployment
railway deployments list

# Step 2: Rollback
railway rollback --deployment <deployment-id>

# Step 3: Verify
curl -f https://your-service.railway.app/health
railway logs --tail 50
```

**Automated Rollback:**
```yaml
# In GitHub Actions
- name: Rollback on Test Failure
  if: failure()
  run: |
    railway rollback
    echo "Deployment rolled back due to test failure"
```

---

### 6. Zero-Downtime Deployment

**Scenario**: Deploy new version without service interruption.

**Test Procedure:**

**Step 1: Start Continuous Request**
```bash
# Run in background
while true; do
  curl -f https://your-service.railway.app/health
  sleep 1
done
```

**Step 2: Deploy New Version**
```bash
railway up
```

**Step 3: Monitor Requests**
```
Expected: No failed requests during deployment
Railway uses rolling deployment strategy
```

**Verification:**
- ✅ Zero HTTP errors during deployment
- ✅ Maximum latency increase < 100ms
- ✅ No dropped connections

---

## Monitoring & Alerting

### 1. Health Check Endpoint Specifications

**Endpoint**: `GET /health`

**Response Format:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "service": "video-processor",
  "timestamp": "2025-11-08T12:00:00.000Z",
  "checks": {
    "database": "connected" | "disconnected",
    "storage": "connected" | "disconnected",
    "ffmpeg": "available" | "unavailable"
  },
  "metrics": {
    "uptime": 3600,
    "activeJobs": 2,
    "queuedJobs": 5
  }
}
```

**Status Codes:**
- `200 OK` - All systems operational
- `503 Service Unavailable` - Critical dependency down
- `500 Internal Server Error` - Service error

**Railway Health Check Configuration:**
```json
{
  "healthcheckPath": "/health",
  "healthcheckTimeout": 30,
  "healthcheckInterval": 30,
  "restartPolicyType": "ON_FAILURE",
  "restartPolicyMaxRetries": 3
}
```

---

### 2. Monitoring Requirements

**Infrastructure Metrics:**
- CPU usage (alert if > 80% for 5 minutes)
- Memory usage (alert if > 90%)
- Disk usage (alert if > 85%)
- Network I/O

**Application Metrics:**
- Request rate
- Response time (p50, p95, p99)
- Error rate (alert if > 1%)
- Active jobs count
- Queue length

**Business Metrics:**
- Videos processed per hour
- Average processing time
- Success rate
- Platform distribution

---

### 3. Alerting Requirements

**Critical Alerts** (Immediate notification):
- Service down (health check fails 3 times)
- Error rate > 5%
- Database connection lost
- Disk space > 95%

**Warning Alerts** (Notify within 15 minutes):
- Error rate > 1%
- CPU > 80% for 10 minutes
- Memory > 90%
- Average response time > 10 seconds

**Info Alerts** (Daily digest):
- Deployment completed
- Rollback executed
- Configuration changed

---

### 4. Logging Strategy

**Log Levels:**
```typescript
// ERROR - Critical issues requiring immediate attention
logger.error('Database connection failed', { error })

// WARN - Issues that don't prevent operation
logger.warn('R2 upload slow', { duration })

// INFO - Important business events
logger.info('Video processing completed', { videoId, duration })

// DEBUG - Detailed diagnostic information
logger.debug('FFmpeg command', { command, args })
```

**Required Log Fields:**
- `timestamp` - ISO 8601 format
- `level` - error/warn/info/debug
- `message` - Human-readable description
- `service` - "video-processor"
- `requestId` - Unique request identifier
- `videoId` - Video being processed (if applicable)
- `duration` - Operation duration (ms)
- `error` - Error details (if applicable)

**Log Retention:**
- Production: 30 days
- Staging: 14 days
- Development: 7 days

---

## Rollback Procedures

### 1. Automated Rollback Triggers

**Trigger 1: Health Check Failure**
```yaml
# After 3 consecutive health check failures
if: health_check_failures >= 3
action: rollback
notify: team
```

**Trigger 2: Error Rate Spike**
```yaml
# If error rate > 10% for 2 minutes
if: error_rate > 0.10 for 2m
action: rollback
notify: team
```

**Trigger 3: Deployment Timeout**
```yaml
# If deployment doesn't complete in 10 minutes
if: deployment_duration > 10m
action: rollback
notify: team
```

---

### 2. Manual Rollback Procedure

**Step-by-Step Guide:**

**1. Identify Issue**
```bash
# Check service status
railway status

# Review recent logs
railway logs --tail 100

# Test health endpoint
curl -f https://your-service.railway.app/health
```

**2. Find Last Good Deployment**
```bash
# List recent deployments
railway deployments list

# Find deployment before issue
# Note deployment ID
```

**3. Execute Rollback**
```bash
# Rollback to specific deployment
railway rollback --deployment <deployment-id>

# Or rollback to previous deployment
railway rollback
```

**4. Verify Rollback**
```bash
# Test health
curl -f https://your-service.railway.app/health

# Test functionality
curl -X POST https://your-service.railway.app/enhance \
  -H "Content-Type: application/json" \
  -d @test-payload.json

# Monitor logs
railway logs --follow
```

**5. Communicate**
```markdown
## Rollback Notification

**Time**: 2025-11-08 12:00 UTC
**Service**: video-processor
**Action**: Rollback to deployment <ID>
**Reason**: <Brief description>
**Impact**: <User-facing impact>
**Status**: Service restored
```

---

### 3. Rollback Verification Checklist

**After Rollback:**
- [ ] Health endpoint returns 200 OK
- [ ] No errors in logs (last 100 lines)
- [ ] Database queries successful
- [ ] R2 storage accessible
- [ ] Test video processing completes
- [ ] Performance metrics normal
- [ ] All monitoring alerts cleared
- [ ] Team notified
- [ ] Incident logged

---

### 4. Post-Rollback Analysis

**Required Steps:**

1. **Root Cause Analysis**
   - What caused the issue?
   - Why wasn't it caught in testing?
   - What can prevent it in future?

2. **Update Tests**
   - Add test case for the issue
   - Improve test coverage
   - Update validation checks

3. **Documentation**
   - Document the incident
   - Update runbooks
   - Share learnings with team

4. **Prevention**
   - Add monitoring/alerts
   - Improve deployment checks
   - Update review process

---

## Conclusion

This deployment testing and validation strategy ensures reliable, safe deployments of the video-processor service to Railway. By following these procedures, we can:

- ✅ Catch issues before they reach production
- ✅ Deploy with confidence
- ✅ Recover quickly from failures
- ✅ Maintain service reliability
- ✅ Ensure zero-downtime deployments

### Next Steps

1. Implement automated test suite
2. Set up monitoring and alerts
3. Configure CI/CD pipeline
4. Train team on rollback procedures
5. Schedule first production deployment

---

**Document Maintained By**: Tester Agent
**Review Frequency**: After each deployment
**Last Reviewed**: 2025-11-08
