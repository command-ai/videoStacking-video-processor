import express from 'express'
import { config } from './config/environment.js'
import { logger } from './utils/logger.js'
import { processVideo } from './processors/video-processor.js'
import { prisma } from './database/prisma-client.js'
import { z } from 'zod'

const app = express()
app.use(express.json())

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'video-processor',
    timestamp: new Date().toISOString()
  })
})

// Process video job endpoint
const processSchema = z.object({
  videoId: z.string().cuid(),
  jobId: z.union([z.string(), z.number()]).optional(),
  platform: z.string().optional(),
  settings: z.any().optional(),
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
    
    logger.info(`Received enhancement job for video: ${data.videoId}`)
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
    
    // Import the enhanced processor
    const { processEnhancedVideo } = await import('./processors/enhanced-processor.js')
    
    // Process immediately and return result
    const result = await processEnhancedVideo(data)
    
    logger.info('Enhancement completed successfully', { videoId: data.videoId, result })
    res.json(result)
    
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
    
    logger.info(`Received video processing job: ${data.videoId}`, {
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
    })
    
  } catch (error) {
    logger.error('Invalid request:', error)
    res.status(400).json({ error: 'Invalid request' })
  }
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

const PORT = config.PORT
app.listen(PORT, () => {
  logger.info(`Video processor listening on port ${PORT}`)
  logger.info('Environment:', config.NODE_ENV)
  logger.info('Database connected:', config.DATABASE_URL ? 'Yes' : 'No')
  logger.info('FFmpeg path:', config.FFMPEG_PATH)
})