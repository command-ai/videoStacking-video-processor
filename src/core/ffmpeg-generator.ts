import ffmpeg from 'fluent-ffmpeg'
import { config } from '../config/environment.js'
import { logger } from '../utils/logger.js'

// Set FFmpeg path
ffmpeg.setFfmpegPath(config.FFMPEG_PATH)
ffmpeg.setFfprobePath(config.FFPROBE_PATH)

interface VideoConfig {
  duration: number
  width: number
  height: number
  fps: number
  bitrate: string
  audioCodec: string
  videoCodec: string
}

interface GenerateVideoOptions {
  config: VideoConfig
  assets: Record<string, string>
  outputPath: string
  platform: string
}

export async function generateVideo(options: GenerateVideoOptions): Promise<void> {
  const { config, assets, outputPath } = options
  
  return new Promise((resolve, reject) => {
    const command = ffmpeg()
    
    // Add inputs
    if (assets.image) {
      command.input(assets.image)
    }
    if (assets.audio) {
      command.input(assets.audio)
    }
    
    // Configure output
    command
      .outputOptions([
        '-c:v', config.videoCodec || 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', config.audioCodec || 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p'
      ])
      .size(`${config.width}x${config.height}`)
      .fps(config.fps)
      .duration(config.duration)
      .output(outputPath)
    
    // Event handlers
    command
      .on('start', (commandLine) => {
        logger.info('FFmpeg command:', commandLine)
      })
      .on('progress', (progress) => {
        logger.info(`Processing: ${progress.percent?.toFixed(2)}% done`)
      })
      .on('error', (err) => {
        logger.error('FFmpeg error:', err)
        reject(err)
      })
      .on('end', () => {
        logger.info('Video processing completed')
        resolve()
      })
    
    // Run the command
    command.run()
  })
}

export async function getVideoInfo(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err)
      } else {
        resolve(metadata)
      }
    })
  })
}