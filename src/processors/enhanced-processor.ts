import { prisma } from '../database/prisma-client.js'
import { logger } from '../utils/logger.js'
import { EnhancedVideoProcessor } from '../core/enhanced-processor.js'
import { uploadToR2 } from '../storage/r2-client.js'
import { config } from '../config/environment.js'
import path from 'path'
import fs from 'fs/promises'
import { execSync } from 'child_process'

interface EnhancementData {
  videoId: string
  platform: string
  mediaIds: string[]
  enhancements: {
    logo?: any
    music?: any
    voiceover?: any
    intro?: any
    outro?: any
    frameAssets?: any
  }
  settings: any
  organizationId: string
}

export async function processEnhancedVideo(data: EnhancementData) {
  const { videoId, platform, mediaIds, enhancements, settings, organizationId } = data
  
  logger.info(`Processing enhanced video ${videoId} for platform ${platform}`, {
    enhancementTypes: Object.keys(enhancements || {}),
    hasLogo: !!enhancements?.logo,
    hasMusic: !!enhancements?.music,
    musicDetails: enhancements?.music,
    hasVoiceover: !!enhancements?.voiceover,
    voiceoverDetails: enhancements?.voiceover
  })
  
  try {
    // Fetch video and media records from database
    const video = await prisma.video.findUnique({
      where: { id: videoId }
    })
    
    if (!video) {
      throw new Error(`Video ${videoId} not found`)
    }
    
    // Fetch media records
    const mediaRecords = await prisma.videoMedia.findMany({
      where: { id: { in: mediaIds } }
    })
    
    // Create temp directory for processing
    const tempDir = path.join(config.TEMP_DIR, `enhance-${videoId}`)
    await fs.mkdir(tempDir, { recursive: true })
    
    try {
      // Get the original video ID from settings
      const originalVideoId = settings?.originalVideoId
      if (!originalVideoId) {
        throw new Error('No original video ID found in settings')
      }
      
      // Fetch the original video record
      const originalVideo = await prisma.video.findUnique({
        where: { id: originalVideoId },
        select: { s3Key: true, platform: true }
      })
      
      if (!originalVideo || !originalVideo.s3Key) {
        throw new Error(`Original video ${originalVideoId} not found or has no S3 key`)
      }
      
      // Prepare media records with the original video included
      const mediaWithVideo = [...mediaRecords]
      
      // Add the original video to the media array
      // Don't use public URL - use the S3 key so it can be downloaded via R2 client
      mediaWithVideo.push({
        id: `video-${originalVideoId}`,
        filename: `original-${platform}.mp4`,
        mimeType: 'video/mp4',
        s3Key: originalVideo.s3Key, // Keep original S3 key
        size: BigInt(0), // Will be determined during download
        projectId: video.projectId,
        uploadedBy: video.createdBy || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        localPath: null // Will be set during download
      } as any)
      
      // Prepare assets including the original video
      await prepareAssets(mediaWithVideo, tempDir)
      
      // Initialize enhanced processor
      const enhancedProcessor = new EnhancedVideoProcessor({
        tempDir,
        outputDir: tempDir
      })
      
      // Apply enhancements to the original video
      logger.info('STEP A: Starting video enhancement processing')
      const enhancedVideoPath = await enhancedProcessor.processVideoWithEnhancements({
        videoId,
        platform,
        media: mediaWithVideo, // Pass media array with original video included
        enhancements,
        settings,
        onProgress: (progress: any) => {
          logger.info(`Enhancement progress: ${progress.percent}% - ${progress.stage}`)
        }
      })
      logger.info('STEP B: Enhancement processing completed', { enhancedVideoPath })
      
      // Verify the enhanced video exists
      try {
        const enhancedStats = await fs.stat(enhancedVideoPath)
        logger.info('STEP C: Enhanced video file verified', {
          path: enhancedVideoPath,
          size: enhancedStats.size,
          sizeMB: (enhancedStats.size / 1024 / 1024).toFixed(2)
        })
      } catch (error) {
        logger.error('STEP C ERROR: Enhanced video file not found!', { enhancedVideoPath, error })
        throw new Error('Enhanced video was not created')
      }
      
      // Upload to R2/S3
      logger.info('STEP D: Starting upload to R2/S3')
      const s3Key = `enhanced-videos/${organizationId}/${videoId}-${platform}.mp4`

      await uploadToR2(enhancedVideoPath, s3Key, 'video/mp4')
      logger.info('STEP E: Upload to R2 completed', { s3Key })
      
      const videoUrl = `https://your-r2-domain.com/${s3Key}` // Will be replaced with signed URL
      
      // Get video metadata
      const metadata = await getVideoMetadata(enhancedVideoPath)
      
      // Update video record
      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'completed',
          s3Key,
          thumbnailS3Key: `${s3Key}.thumb.jpg`,
          duration: metadata.duration,
          fileSize: metadata.fileSize,
          metadata: metadata as any,
          completedAt: new Date()
        }
      })
      
      logger.info(`Enhanced video ${videoId} completed successfully`)
      
      return {
        s3Key,
        videoUrl,
        metadata
      }
      
    } finally {
      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true })
    }
    
  } catch (error) {
    logger.error(`Failed to process enhanced video ${videoId}:`, error)
    
    // Update video status to failed
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
    
    throw error
  }
}


async function prepareAssets(media: any[], tempDir: string): Promise<any> {
  const assets: any = {
    images: [],
    logo: null,
    backgroundImage: null,
    backgroundVideo: null,
    reviewImage: null
  }
  
  // Create temp directory for assets
  const tempAssetsDir = path.join(tempDir, 'assets')
  await fs.mkdir(tempAssetsDir, { recursive: true })
  
  for (const item of media) {
    const tempPath = path.join(tempAssetsDir, item.filename)
    
    // Handle different storage scenarios
    if (item.s3Key && item.s3Key.startsWith('http')) {
      // If s3Key is a full URL, it should be publicly accessible
      logger.info(`Downloading from public URL: ${item.s3Key}`)
      try {
        // Test if it's actually accessible
        const testCmd = execSync(`curl -I "${item.s3Key}" -o /dev/null -w '%{http_code}' -s`)
        const statusCode = testCmd.toString().trim()
        
        if (statusCode === '401' || statusCode === '403') {
          logger.warn(`URL is not publicly accessible (${statusCode}), will try R2 client`)
          // Extract the S3 key from the URL and download via R2 client
          const urlParts = new URL(item.s3Key)
          const s3Key = urlParts.pathname.substring(1) // Remove leading slash
          const { downloadFromR2 } = await import('../storage/r2-client.js')
          await downloadFromR2(s3Key, tempPath)
        } else {
          // Download normally
          execSync(`curl -L "${item.s3Key}" -o "${tempPath}" --fail`)
        }
        // Update the media item with local path for EnhancedVideoProcessor
        item.localPath = tempPath
      } catch (error) {
        logger.error('Failed to download from URL:', error)
        throw error
      }
    } else if (item.s3Key) {
      // Download from R2 using the R2 client
      logger.info(`Downloading from R2: ${item.s3Key}`)
      try {
        const { downloadFromR2 } = await import('../storage/r2-client.js')
        await downloadFromR2(item.s3Key, tempPath)
        // Update the media item with local path for EnhancedVideoProcessor
        item.localPath = tempPath
      } catch (error) {
        logger.error('Failed to download from R2:', error)
        // Fallback to placeholder
        const colors = ['red', 'blue', 'green', 'yellow', 'purple']
        const color = colors[Math.floor(Math.random() * colors.length)]
        try {
          execSync(`ffmpeg -f lavfi -i color=${color}:s=1920x1080:d=1 -frames:v 1 "${tempPath}" -y`)
          item.localPath = tempPath
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
        item.localPath = tempPath
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
      // Still download the video but don't add to assets
      // EnhancedVideoProcessor will find it in the media array
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
      fps: eval(videoStream.r_frame_rate), // Evaluates fraction like "30/1"
      fileSize: parseInt(data.format.size)
    }
  } catch (error) {
    logger.error('Failed to get video metadata:', error)
    return {
      duration: 0,
      resolution: 'unknown',
      codec: 'unknown',
      bitrate: 0,
      fps: 0,
      fileSize: 0
    }
  }
}