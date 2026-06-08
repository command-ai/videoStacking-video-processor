import express from 'express'
import { config } from './config/environment.js'
import { logger } from './utils/logger.js'
import { processVideo } from './processors/video-processor.js'
import { prisma } from './database/prisma-client.js'
import { z } from 'zod'

const app = express()
app.use(express.json())

// ── Concurrency gate ─────────────────────────────────────────────────────────
const MAX_CONCURRENT = config.MAX_CONCURRENT_JOBS || 2
let activeJobs = 0

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'video-processor',
    activeJobs,
    maxConcurrent: MAX_CONCURRENT,
    availableSlots: MAX_CONCURRENT - activeJobs,
    timestamp: new Date().toISOString()
  })
})

// Per-frame FFmpeg filter parameters (Item 4 of VIDEO_STUDIO_TODO).
const ffmpegFrameFiltersSchema = z.object({
  brightness: z.number().min(-1).max(1).optional(),
  contrast:   z.number().min(0).max(2).optional(),
  saturation: z.number().min(0).max(3).optional(),
  blur:       z.number().min(0).max(10).optional()
}).strict()

// Per-frame override. Either `mediaId` keys the entry to a specific
// VideoMedia id or the entry is positional (aligned to the video's
// mediaIds array by index).
const frameOverrideSchema = z.object({
  mediaId: z.string().optional(),
  duration: z.number().positive().max(600).optional(),
  ffmpegFilters: ffmpegFrameFiltersSchema.optional()
}).passthrough()

// Process video job endpoint. settings carries the bulk of the payload —
// `.passthrough()` retains all the existing fields (layoutMode, preset,
// captions, music, etc.) so older payloads keep working unchanged. Items
// 4/5/6 from VIDEO_STUDIO_TODO surface through settings.frames[] and
// settings.targetDurationOverride.
const processSchema = z.object({
  videoId: z.string().cuid(),
  jobId: z.union([z.string(), z.number()]).optional(),
  platform: z.string().optional(),
  settings: z.object({
    targetDurationOverride: z.number().positive().max(600).optional(),
    frames: z.array(frameOverrideSchema).optional()
  }).passthrough().optional(),
  mediaIds: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  organizationId: z.string().optional(),
  targetDuration: z.number().optional()
})

// Enhancement processing endpoint
const enhanceSchema = z.object({
  videoId: z.string().cuid(),
  platform: z.string(),
  mediaIds: z.array(z.string()),
  enhancements: z.object({
    logo: z.any().optional(),
    music: z.any().optional(),
    voiceover: z.any().optional(),
    intro: z.any().optional(),
    outro: z.any().optional(),
    frameAssets: z.any().optional()
  }),
  settings: z.any().default({}),
  organizationId: z.string()
})

app.post('/enhance', async (req, res) => {
  try {
    const data = enhanceSchema.parse(req.body)

    // Reject if at capacity so LB routes to another replica
    if (activeJobs >= MAX_CONCURRENT) {
      logger.warn(`At capacity (${activeJobs}/${MAX_CONCURRENT}), rejecting enhance`, { videoId: data.videoId })
      res.status(503).json({ error: 'at_capacity', activeJobs, maxConcurrent: MAX_CONCURRENT })
      return
    }

    activeJobs++
    logger.info(`Received enhancement job (${activeJobs}/${MAX_CONCURRENT}): ${data.videoId}`)
    logger.info('Enhancement request details:', {
      videoId: data.videoId,
      platform: data.platform,
      hasLogo: !!data.enhancements?.logo,
      hasMusic: !!data.enhancements?.music,
      hasVoiceover: !!data.enhancements?.voiceover,
      voiceoverData: data.enhancements?.voiceover
    })

    // Set a longer timeout for the response (5 minutes)
    res.setTimeout(5 * 60 * 1000, () => {
      logger.error('Enhancement request timed out after 5 minutes', { videoId: data.videoId })
      res.status(504).json({ error: 'Request timeout - processing taking too long' })
    })

    try {
      // Import the enhanced processor
      const { processEnhancedVideo } = await import('./processors/enhanced-processor.js')

      // Process immediately and return result
      const result = await processEnhancedVideo(data)

      logger.info('Enhancement completed successfully', { videoId: data.videoId, result })
      res.json(result)
    } finally {
      activeJobs--
      logger.info(`Enhancement finished (${activeJobs}/${MAX_CONCURRENT})`, { videoId: data.videoId })
    }

  } catch (error) {
    logger.error('Enhancement processing failed:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      videoId: req.body?.videoId
    })
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.post('/process', async (req, res) => {
  try {
    const data = processSchema.parse(req.body)

    // Reject if at capacity so LB routes to another replica
    if (activeJobs >= MAX_CONCURRENT) {
      logger.warn(`At capacity (${activeJobs}/${MAX_CONCURRENT}), rejecting process`, { videoId: data.videoId })
      res.status(503).json({ error: 'at_capacity', activeJobs, maxConcurrent: MAX_CONCURRENT })
      return
    }

    activeJobs++
    logger.info(`Received video processing job (${activeJobs}/${MAX_CONCURRENT}): ${data.videoId}`, {
      platform: data.platform,
      targetDuration: data.targetDuration,
      layoutMode: data.settings?.layoutMode
    })

    // Acknowledge quickly to prevent timeout
    res.json({
      received: true,
      videoId: data.videoId,
      message: 'Video processing started'
    })

    // Process video in background with additional context (fire and forget)
    processVideo(data.videoId, {
      platform: data.platform,
      settings: data.settings,
      targetDuration: data.targetDuration
    }).catch(error => {
      logger.error('Video processing failed:', error)
    }).finally(() => {
      activeJobs--
      logger.info(`Video processing finished (${activeJobs}/${MAX_CONCURRENT})`, { videoId: data.videoId })
    })

  } catch (error) {
    logger.error('Invalid request:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Graceful shutdown — wait for active FFmpeg jobs before exiting
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, waiting for active jobs to complete...', { activeJobs })

  // Wait up to 5 min for active jobs to finish
  const deadline = Date.now() + 5 * 60 * 1000
  while (activeJobs > 0 && Date.now() < deadline) {
    logger.info(`Waiting for ${activeJobs} active jobs to finish...`)
    await new Promise(r => setTimeout(r, 2000))
  }

  if (activeJobs > 0) {
    logger.warn(`Shutting down with ${activeJobs} jobs still active (deadline exceeded)`)
  }

  await prisma.$disconnect()
  process.exit(0)
})

// On boot, any video still marked "processing" is an orphan: the render that
// owned it died when this container last stopped/crashed (renders run in-process
// and are not resumable). Without this, those rows stay "processing" forever —
// the "every video failed / stuck" symptom after a restart or redeploy.
async function reconcileOrphanedRenders() {
  const STALE_MS = Number(process.env.ORPHAN_STALE_MS) || 5 * 60 * 1000
  const cutoff = new Date(Date.now() - STALE_MS)
  try {
    const result = await prisma.video.updateMany({
      where: {
        status: 'processing',
        OR: [{ startedAt: { lt: cutoff } }, { startedAt: null }],
      },
      data: {
        status: 'failed',
        error: 'Render interrupted by a service restart — please retry',
        completedAt: new Date(),
      },
    })
    if (result.count > 0) {
      logger.warn(`Reconciled ${result.count} orphaned "processing" render(s) → failed on boot`)
    } else {
      logger.info('No orphaned renders to reconcile on boot')
    }
  } catch (e) {
    logger.error('Failed to reconcile orphaned renders on boot:', e)
  }
}

const PORT = config.PORT
app.listen(PORT, () => {
  logger.info(`Video processor listening on port ${PORT}`)
  logger.info('Environment:', config.NODE_ENV)
  logger.info('Database connected:', config.DATABASE_URL ? 'Yes' : 'No')
  logger.info('FFmpeg path:', config.FFMPEG_PATH)
  void reconcileOrphanedRenders()
})