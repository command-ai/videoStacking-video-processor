# Health Check Endpoint Specification
## Video Processor Service

### Version: 1.0.0
### Last Updated: 2025-11-08

---

## Overview

The health check endpoint provides real-time status information about the video-processor service and its dependencies. This endpoint is used by Railway for container orchestration, monitoring systems, and operational verification.

---

## Endpoint Details

### Basic Information

**URL**: `GET /health`

**Authentication**: None required (public endpoint)

**Rate Limiting**: None

**Timeout**: 30 seconds (Railway default)

**Cache**: No caching

---

## Response Specification

### Success Response

**HTTP Status**: `200 OK`

**Content-Type**: `application/json`

**Response Body**:
```json
{
  "status": "healthy",
  "service": "video-processor",
  "timestamp": "2025-11-08T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "connected",
      "responseTime": 45,
      "lastChecked": "2025-11-08T12:00:00.000Z"
    },
    "storage": {
      "status": "connected",
      "bucket": "video-platform",
      "responseTime": 120,
      "lastChecked": "2025-11-08T12:00:00.000Z"
    },
    "ffmpeg": {
      "status": "available",
      "version": "6.0",
      "lastChecked": "2025-11-08T12:00:00.000Z"
    }
  },
  "metrics": {
    "activeJobs": 2,
    "queuedJobs": 5,
    "processedToday": 127,
    "errorRate": 0.02,
    "avgProcessingTime": 8500
  },
  "resources": {
    "memory": {
      "used": 256,
      "total": 512,
      "percentage": 50
    },
    "cpu": {
      "percentage": 35
    },
    "disk": {
      "used": 1024,
      "total": 10240,
      "percentage": 10
    }
  }
}
```

---

### Degraded Response

**HTTP Status**: `200 OK` (still operational but with issues)

**Response Body**:
```json
{
  "status": "degraded",
  "service": "video-processor",
  "timestamp": "2025-11-08T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "connected",
      "responseTime": 45
    },
    "storage": {
      "status": "slow",
      "bucket": "video-platform",
      "responseTime": 5000,
      "warning": "High latency detected"
    },
    "ffmpeg": {
      "status": "available",
      "version": "6.0"
    }
  },
  "warnings": [
    "R2 storage responding slowly (5000ms)",
    "Memory usage above 80%"
  ]
}
```

---

### Unhealthy Response

**HTTP Status**: `503 Service Unavailable`

**Response Body**:
```json
{
  "status": "unhealthy",
  "service": "video-processor",
  "timestamp": "2025-11-08T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "disconnected",
      "error": "Connection timeout after 5000ms",
      "lastChecked": "2025-11-08T12:00:00.000Z"
    },
    "storage": {
      "status": "connected",
      "bucket": "video-platform"
    },
    "ffmpeg": {
      "status": "available",
      "version": "6.0"
    }
  },
  "errors": [
    "Database connection failed",
    "Cannot process new jobs"
  ]
}
```

---

### Error Response

**HTTP Status**: `500 Internal Server Error`

**Response Body**:
```json
{
  "status": "error",
  "service": "video-processor",
  "timestamp": "2025-11-08T12:00:00.000Z",
  "error": "Health check failed to execute",
  "message": "Internal server error during health check"
}
```

---

## Response Fields

### Root Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | Overall health status: `healthy`, `degraded`, `unhealthy`, `error` |
| `service` | string | Yes | Service name: `video-processor` |
| `timestamp` | string | Yes | ISO 8601 timestamp of health check |
| `version` | string | No | Service version number |
| `uptime` | number | No | Service uptime in seconds |

### Checks Object

**database**:
| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `connected`, `disconnected`, `slow` |
| `responseTime` | number | Database query response time (ms) |
| `lastChecked` | string | Last check timestamp |
| `error` | string | Error message if disconnected |

**storage**:
| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `connected`, `disconnected`, `slow` |
| `bucket` | string | R2 bucket name |
| `responseTime` | number | Storage API response time (ms) |
| `lastChecked` | string | Last check timestamp |
| `error` | string | Error message if disconnected |

**ffmpeg**:
| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `available`, `unavailable` |
| `version` | string | FFmpeg version number |
| `lastChecked` | string | Last check timestamp |

### Metrics Object

| Field | Type | Description |
|-------|------|-------------|
| `activeJobs` | number | Currently processing jobs |
| `queuedJobs` | number | Jobs waiting in queue |
| `processedToday` | number | Jobs completed today |
| `errorRate` | number | Error rate (0-1) |
| `avgProcessingTime` | number | Average job duration (ms) |

### Resources Object

| Field | Type | Description |
|-------|------|-------------|
| `memory.used` | number | Memory used (MB) |
| `memory.total` | number | Total memory (MB) |
| `memory.percentage` | number | Memory usage percentage |
| `cpu.percentage` | number | CPU usage percentage |
| `disk.used` | number | Disk used (MB) |
| `disk.total` | number | Total disk (MB) |
| `disk.percentage` | number | Disk usage percentage |

---

## Status Determination Logic

### Healthy
All conditions must be met:
- ✅ Database connected (< 1000ms response)
- ✅ R2 storage accessible (< 3000ms response)
- ✅ FFmpeg available
- ✅ Memory usage < 90%
- ✅ CPU usage < 95%
- ✅ Disk usage < 95%
- ✅ Error rate < 5%

### Degraded
Any warning condition:
- ⚠️ Database slow (1000-3000ms response)
- ⚠️ Storage slow (3000-5000ms response)
- ⚠️ Memory usage 80-90%
- ⚠️ CPU usage 80-95%
- ⚠️ Disk usage 85-95%
- ⚠️ Error rate 1-5%

### Unhealthy
Any critical condition:
- ❌ Database disconnected
- ❌ Storage unavailable
- ❌ FFmpeg missing
- ❌ Memory usage > 95%
- ❌ CPU usage > 95%
- ❌ Disk usage > 95%
- ❌ Error rate > 5%

---

## Implementation Example

### Current Implementation
```typescript
// src/index.ts
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'video-processor',
    timestamp: new Date().toISOString()
  })
})
```

### Enhanced Implementation
```typescript
// src/routes/health.ts
import { Request, Response } from 'express'
import { prisma } from '../database/prisma-client.js'
import { checkStorageHealth } from '../storage/health.js'
import { checkFFmpegHealth } from '../utils/ffmpeg-health.js'
import os from 'os'

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'error'
  service: string
  timestamp: string
  version?: string
  uptime?: number
  checks?: {
    database?: CheckResult
    storage?: CheckResult
    ffmpeg?: CheckResult
  }
  metrics?: ServiceMetrics
  resources?: ResourceMetrics
  warnings?: string[]
  errors?: string[]
}

interface CheckResult {
  status: string
  responseTime?: number
  lastChecked?: string
  error?: string
  [key: string]: any
}

interface ServiceMetrics {
  activeJobs: number
  queuedJobs: number
  processedToday: number
  errorRate: number
  avgProcessingTime: number
}

interface ResourceMetrics {
  memory: {
    used: number
    total: number
    percentage: number
  }
  cpu: {
    percentage: number
  }
  disk?: {
    used: number
    total: number
    percentage: number
  }
}

export async function healthCheck(req: Request, res: Response): Promise<void> {
  const startTime = Date.now()
  const warnings: string[] = []
  const errors: string[] = []

  try {
    // Initialize response
    const health: HealthCheck = {
      status: 'healthy',
      service: 'video-processor',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {},
      metrics: await getServiceMetrics(),
      resources: getResourceMetrics(),
    }

    // Check database
    const dbCheck = await checkDatabase()
    health.checks!.database = dbCheck
    if (dbCheck.status === 'disconnected') {
      errors.push('Database connection failed')
      health.status = 'unhealthy'
    } else if (dbCheck.status === 'slow') {
      warnings.push(`Database slow (${dbCheck.responseTime}ms)`)
      health.status = 'degraded'
    }

    // Check storage
    const storageCheck = await checkStorageHealth()
    health.checks!.storage = storageCheck
    if (storageCheck.status === 'disconnected') {
      errors.push('Storage unavailable')
      health.status = 'unhealthy'
    } else if (storageCheck.status === 'slow') {
      warnings.push(`Storage slow (${storageCheck.responseTime}ms)`)
      if (health.status === 'healthy') health.status = 'degraded'
    }

    // Check FFmpeg
    const ffmpegCheck = await checkFFmpegHealth()
    health.checks!.ffmpeg = ffmpegCheck
    if (ffmpegCheck.status === 'unavailable') {
      errors.push('FFmpeg unavailable')
      health.status = 'unhealthy'
    }

    // Check resource usage
    if (health.resources) {
      if (health.resources.memory.percentage > 95) {
        errors.push('Memory critically high')
        health.status = 'unhealthy'
      } else if (health.resources.memory.percentage > 80) {
        warnings.push(`Memory usage high (${health.resources.memory.percentage}%)`)
        if (health.status === 'healthy') health.status = 'degraded'
      }

      if (health.resources.cpu.percentage > 95) {
        errors.push('CPU critically high')
        health.status = 'unhealthy'
      } else if (health.resources.cpu.percentage > 80) {
        warnings.push(`CPU usage high (${health.resources.cpu.percentage}%)`)
        if (health.status === 'healthy') health.status = 'degraded'
      }
    }

    // Add warnings and errors to response
    if (warnings.length > 0) health.warnings = warnings
    if (errors.length > 0) health.errors = errors

    // Set appropriate HTTP status
    const httpStatus = health.status === 'unhealthy' ? 503 : 200

    res.status(httpStatus).json(health)

  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'video-processor',
      timestamp: new Date().toISOString(),
      error: 'Health check failed to execute',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const startTime = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1`
    const responseTime = Date.now() - startTime

    return {
      status: responseTime < 1000 ? 'connected' : 'slow',
      responseTime,
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    }
  }
}

async function getServiceMetrics(): Promise<ServiceMetrics> {
  // TODO: Implement actual metrics collection
  return {
    activeJobs: 0,
    queuedJobs: 0,
    processedToday: 0,
    errorRate: 0,
    avgProcessingTime: 0,
  }
}

function getResourceMetrics(): ResourceMetrics {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem

  return {
    memory: {
      used: Math.round(usedMem / 1024 / 1024),
      total: Math.round(totalMem / 1024 / 1024),
      percentage: Math.round((usedMem / totalMem) * 100),
    },
    cpu: {
      percentage: Math.round(os.loadavg()[0] * 10), // Rough estimate
    },
  }
}
```

---

## Railway Configuration

### railway.json
```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "healthcheckInterval": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Dockerfile HEALTHCHECK
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

---

## Monitoring Integration

### Uptime Monitoring
```bash
# Cron job for external monitoring
*/5 * * * * curl -f https://video-processor.railway.app/health || echo "Health check failed"
```

### Prometheus Metrics
```
# HELP video_processor_health_status Service health status (1=healthy, 0.5=degraded, 0=unhealthy)
# TYPE video_processor_health_status gauge
video_processor_health_status 1

# HELP video_processor_database_response_time Database query response time in milliseconds
# TYPE video_processor_database_response_time gauge
video_processor_database_response_time 45

# HELP video_processor_active_jobs Number of currently processing jobs
# TYPE video_processor_active_jobs gauge
video_processor_active_jobs 2
```

---

## Testing the Health Endpoint

### Basic Test
```bash
curl -i https://video-processor.railway.app/health
```

### Detailed Test
```bash
curl -s https://video-processor.railway.app/health | jq '.'
```

### Status Check
```bash
STATUS=$(curl -s https://video-processor.railway.app/health | jq -r '.status')
if [ "$STATUS" = "healthy" ]; then
  echo "✅ Service is healthy"
else
  echo "❌ Service status: $STATUS"
fi
```

### Response Time Test
```bash
time curl -s https://video-processor.railway.app/health > /dev/null
```

---

## Best Practices

1. **Keep it Fast**: Health checks should complete in < 2 seconds
2. **Include Dependencies**: Check all critical external services
3. **Use Caching**: Cache check results for 10-30 seconds
4. **Fail Fast**: Timeout dependency checks after 5 seconds
5. **Return Detailed Info**: Help debugging with detailed status
6. **Version the Response**: Include API version for compatibility
7. **Log Sparingly**: Don't log every health check (too noisy)
8. **Handle Errors**: Never let health check crash the service

---

## Troubleshooting

### Health Check Always Returns Unhealthy
- Check database connectivity
- Verify R2 credentials
- Ensure FFmpeg is installed
- Review resource limits

### Health Check Times Out
- Optimize dependency checks
- Add timeouts to external calls
- Consider caching check results
- Review network connectivity

### False Positives
- Adjust thresholds for degraded state
- Add hysteresis to prevent flapping
- Increase check intervals
- Review metric calculation

---

**Maintained By**: Tester Agent
**Review Frequency**: Monthly
**Last Reviewed**: 2025-11-08
