import { prisma } from '../database/prisma-client.js'
import { uploadToR2 } from '../storage/r2-client.js'
import { logger } from '../utils/logger.js'
import { config } from '../config/environment.js'
import path from 'path'
import fs from 'fs/promises'
import { execSync } from 'child_process'

interface VideoProcessingOptions {
  onProgress?: (progress: { percent: number; stage: string }) => void
  adaptiveGraphics?: boolean
  keepTemp?: boolean
  preset?: string
  quality?: number
}

interface VideoContext {
  platform?: string
  settings?: any
  targetDuration?: number
}

export async function processVideo(videoId: string, context?: VideoContext) {
  const startTime = Date.now()
  
  try {
    // Debug: Check database connection and list videos
    logger.info('Database URL:', process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@'))
    const videoCount = await prisma.video.count()
    logger.info(`Total videos in database: ${videoCount}`)
    
    // 1. Get video details from database
    const video = await prisma.video.findUnique({
      where: { id: videoId }
    })
    
    if (!video) {
      throw new Error(`Video ${videoId} not found`)
    }
    
    // 2. Update status to processing
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'processing',
        startedAt: new Date()
      }
    })
    
    logger.info(`Starting video generation for video ${videoId}`, {
      projectId: video.projectId,
      platform: video.platform,
      mediaIds: video.mediaIds
    })
    
    // 3. Get media files based on mediaIds
    const media = []
    if (video.mediaIds && video.mediaIds.length > 0) {
      const mediaRecords = await prisma.videoMedia.findMany({
        where: { id: { in: video.mediaIds } }
      })

      // Sort media records to match the order in video.mediaIds
      // Prisma findMany doesn't preserve the order of the input array
      const mediaMap = new Map(mediaRecords.map(m => [m.id, m]))
      const sortedMedia = video.mediaIds
        .map(id => mediaMap.get(id))
        .filter((m): m is NonNullable<typeof m> => m !== undefined)

      media.push(...sortedMedia)

      logger.info('Media order preserved in video processor:', {
        videoId: video.id,
        requestedOrder: video.mediaIds,
        resultOrder: sortedMedia.map(m => m.id),
        sortedFilenames: sortedMedia.map(m => m.filename)
      })
    }
    
    // 3. Prepare assets
    const assets = await prepareAssets(media)
    
    // Note: If voice-over audio is generated in the future, add it to assets as:
    // assets.voiceOver = pathToGeneratedAudioFile
    // The VideoGenerator will use it if present, otherwise creates silent track
    
    // 4. Import VideoGenerator through ES module wrapper
    const { default: VideoGenerator } = await import('../core/VideoGeneratorWrapper.js')
    
    // 5. Initialize video generator with core FFMPEG code
    const generator = new VideoGenerator({
      ffmpegPath: config.FFMPEG_PATH || 'ffmpeg',
      ffprobePath: config.FFPROBE_PATH || 'ffprobe',
      tempDir: config.TEMP_DIR || './temp',
      outputDir: path.join(config.TEMP_DIR || './temp', 'output')
    })
    
    // 6. Generate video using platform template with context
    const videoSettings = (video.settings as any) || {}
    const contextSettings = (context?.settings as any) || {}
    const combinedSettings: any = {
      ...videoSettings,
      ...contextSettings,
      targetDuration: context?.targetDuration || video.targetDuration,
      layoutMode: context?.settings?.layoutMode || 'letterbox'  // Default to letterbox
    }
    
    logger.info(`Generating video with settings:`, {
      platform: context?.platform || video.platform,
      targetDuration: combinedSettings.targetDuration,
      layoutMode: combinedSettings.layoutMode,
      preset: combinedSettings.preset || 'fast'
    })
    
    const outputPath = await generator.generateVideo(
      context?.platform || video.platform,
      assets,
      {
        settings: combinedSettings,
        imageMode: combinedSettings.layoutMode || 'letterbox', // Map layoutMode to imageMode
        preset: combinedSettings.preset || 'fast', // Dynamic: ultrafast|veryfast|fast|medium
        quality: combinedSettings.crf || 23,
        adaptiveGraphics: true,
        onProgress: (progress) => {
          logger.info(`Video ${videoId} progress: ${progress.percent}%`)
          // Could update progress in database or send websocket update
        }
      } as VideoProcessingOptions
    )
    
    // 7. Get video metadata
    const stats = await fs.stat(outputPath)
    const metadata = await getVideoMetadata(outputPath)
    
    // 8. Upload to R2/S3
    const s3Key = `videos/${video.projectId}/${video.id}.mp4`
    const videoUrl = await uploadToR2(outputPath, s3Key, 'video/mp4')

    // 9. Generate thumbnail
    const thumbnailPath = await generateThumbnail(outputPath)
    const thumbnailS3Key = `videos/${video.projectId}/${video.id}_thumb.jpg`
    const thumbnailUrl = await uploadToR2(thumbnailPath, thumbnailS3Key, 'image/jpeg')
    
    // 10. Update database with results
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'completed',
        s3Key,
        thumbnailS3Key,
        duration: metadata.duration,
        fileSize: BigInt(stats.size),
        metadata: {
          resolution: metadata.resolution,
          codec: metadata.codec,
          bitrate: metadata.bitrate,
          fps: metadata.fps
        },
        processingTime: Math.floor((Date.now() - startTime) / 1000),
        completedAt: new Date()
      }
    })
    
    // 11. Cleanup temp files
    await fs.unlink(outputPath).catch(() => {})
    await fs.unlink(thumbnailPath).catch(() => {})
    
    logger.info(`Video generation completed for video ${videoId}`, {
      duration: metadata.duration,
      fileSize: stats.size,
      processingTime: Date.now() - startTime
    })
    
    return {
      success: true,
      videoUrl,
      thumbnailUrl,
      metadata
    }
    
  } catch (error) {
    logger.error(`Video generation failed for video ${videoId}:`, error)
    
    // Update job as failed
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      }
    })
    
    throw error
  }
}

async function prepareAssets(media: any[]): Promise<any> {
  // Download media from S3 to temp directory
  // Return paths for video generator
  const assets: any = {
    images: [],
    logo: null,
    backgroundImage: null,
    backgroundVideo: null,
    reviewImage: null
  }
  
  // Create temp directory for assets
  const tempAssetsDir = path.join(config.TEMP_DIR || './temp', 'assets', Date.now().toString())
  await fs.mkdir(tempAssetsDir, { recursive: true })
  
  for (const item of media) {
    const tempPath = path.join(tempAssetsDir, item.filename)
    
    // Handle different storage scenarios
    if (item.s3Key && item.s3Key.startsWith('http')) {
      // If s3Key is a full URL, download it
      logger.info(`Downloading from URL: ${item.s3Key}`)
      try {
        execSync(`curl -L "${item.s3Key}" -o "${tempPath}"`)
      } catch (error) {
        logger.error('Failed to download image:', error)
      }
    } else if (item.s3Key) {
      // Download from R2 using the R2 client
      logger.info(`Downloading from R2: ${item.s3Key}`)
      try {
        const { downloadFromR2 } = await import('../storage/r2-client.js')
        await downloadFromR2(item.s3Key, tempPath)
      } catch (error) {
        logger.error('Failed to download from R2:', error)
        // Fallback to placeholder
        const colors = ['red', 'blue', 'green', 'yellow', 'purple']
        const color = colors[Math.floor(Math.random() * colors.length)]
        try {
          execSync(`ffmpeg -f lavfi -i color=${color}:s=1920x1080:d=1 -frames:v 1 "${tempPath}" -y`)
        } catch (ffmpegError) {
          logger.error('Failed to create placeholder image:', ffmpegError)
        }
      }
    } else {
      // Create a placeholder for testing
      logger.warn(`No asset found, creating placeholder: ${item.filename}`)
      const colors = ['red', 'blue', 'green', 'yellow', 'purple']
      const color = colors[Math.floor(Math.random() * colors.length)]
      try {
        execSync(`ffmpeg -f lavfi -i color=${color}:s=1920x1080:d=1 -frames:v 1 "${tempPath}" -y`)
      } catch (ffmpegError) {
        logger.error('Failed to create placeholder image:', ffmpegError)
      }
    }
    
    if (item.mimeType.startsWith('image/')) {
      if (item.filename.toLowerCase().includes('logo')) {
        assets.logo = tempPath
      } else if (item.metadata?.type === 'review') {
        assets.reviewImage = tempPath
      } else if (item.metadata?.type === 'background') {
        assets.backgroundImage = tempPath
      } else {
        // Regular project images
        assets.images.push(tempPath)
      }
    } else if (item.mimeType.startsWith('video/')) {
      assets.backgroundVideo = tempPath
    }
  }
  
  // Ensure we have at least some images
  if (assets.images.length === 0 && !assets.backgroundVideo) {
    throw new Error('No images or video found for project')
  }
  
  return assets
}

async function getVideoMetadata(videoPath: string): Promise<any> {
  try {
    const ffprobeCmd = `ffprobe -v quiet -print_format json -show_streams -show_format "${videoPath}"`
    const output = execSync(ffprobeCmd).toString()
    const data = JSON.parse(output)
    
    const videoStream = data.streams.find((s: any) => s.codec_type === 'video')
    
    return {
      duration: parseFloat(data.format.duration),
      resolution: `${videoStream.width}x${videoStream.height}`,
      codec: videoStream.codec_name,
      bitrate: parseInt(data.format.bit_rate),
      fps: eval(videoStream.r_frame_rate) // Evaluates fraction like "30/1"
    }
  } catch (error) {
    logger.error('Failed to get video metadata:', error)
    return {
      duration: 0,
      resolution: 'unknown',
      codec: 'unknown',
      bitrate: 0,
      fps: 0
    }
  }
}

async function generateThumbnail(videoPath: string, _generator?: any): Promise<string> {
  const thumbnailPath = videoPath.replace('.mp4', '_thumb.jpg')
  
  try {
    // Extract frame at 1 second
    const ffmpegCmd = `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -f image2 "${thumbnailPath}" -y`
    execSync(ffmpegCmd)
    
    return thumbnailPath
  } catch (error) {
    logger.error('Failed to generate thumbnail:', error)
    // Return a default thumbnail path or generate a placeholder
    throw error
  }
}