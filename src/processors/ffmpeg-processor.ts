import { execSync } from 'child_process'
import { logger } from '../utils/logger.js'
// import path from 'path'
// import fs from 'fs/promises'

export interface FFmpegProgress {
  percent: number
  time?: string
  speed?: string
  fps?: number
  stage: string
}

export interface VideoMetadata {
  duration: number
  resolution: string
  codec: string
  bitrate: number
  fps: number
  width: number
  height: number
}

export class FFmpegProcessor {
  private ffmpegPath: string
  private ffprobePath: string
  
  constructor(config?: { ffmpegPath?: string; ffprobePath?: string }) {
    this.ffmpegPath = config?.ffmpegPath || 'ffmpeg'
    this.ffprobePath = config?.ffprobePath || 'ffprobe'
  }
  
  /**
   * Execute FFmpeg command with progress tracking
   */
  async executeCommand(
    command: string,
    options?: {
      onProgress?: (progress: FFmpegProgress) => void
      workingDir?: string
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Executing FFmpeg command', { command })
        
        // For now, using execSync - in production, should use spawn for progress tracking
        execSync(command, {
          cwd: options?.workingDir,
          stdio: 'inherit'
        })
        
        resolve()
      } catch (error) {
        logger.error('FFmpeg command failed', { error, command })
        reject(error)
      }
    })
  }
  
  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    try {
      const command = `${this.ffprobePath} -v quiet -print_format json -show_streams -show_format "${videoPath}"`
      const output = execSync(command).toString()
      const data = JSON.parse(output)
      
      const videoStream = data.streams.find((s: any) => s.codec_type === 'video')
      
      if (!videoStream) {
        throw new Error('No video stream found')
      }
      
      return {
        duration: parseFloat(data.format.duration || '0'),
        resolution: `${videoStream.width}x${videoStream.height}`,
        codec: videoStream.codec_name,
        bitrate: parseInt(data.format.bit_rate || '0'),
        fps: this.parseFps(videoStream.r_frame_rate),
        width: parseInt(videoStream.width),
        height: parseInt(videoStream.height)
      }
    } catch (error) {
      logger.error('Failed to get video metadata:', error)
      throw new Error(`Failed to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  /**
   * Get audio duration
   */
  async getAudioDuration(audioPath: string): Promise<number> {
    try {
      const command = `${this.ffprobePath} -v quiet -print_format json -show_streams -show_format "${audioPath}"`
      const output = execSync(command).toString()
      const data = JSON.parse(output)
      
      return parseFloat(data.format.duration || '0')
    } catch (error) {
      logger.error('Failed to get audio duration:', error)
      return 0
    }
  }
  
  /**
   * Get image dimensions
   */
  async getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
    try {
      const command = `${this.ffprobePath} -v error -select_streams v:0 -show_entries stream=width,height -of json "${imagePath}"`
      const output = execSync(command).toString()
      const data = JSON.parse(output)
      
      if (!data.streams || !data.streams[0]) {
        throw new Error('No video stream found in image')
      }
      
      return {
        width: parseInt(data.streams[0].width),
        height: parseInt(data.streams[0].height)
      }
    } catch (error) {
      logger.error('Failed to get image dimensions:', error)
      // Return default dimensions
      return { width: 1920, height: 1080 }
    }
  }
  
  /**
   * Generate video thumbnail
   */
  async generateThumbnail(
    videoPath: string,
    outputPath: string,
    options?: {
      time?: number // Time in seconds
      size?: string // e.g., '320x180'
    }
  ): Promise<void> {
    const time = options?.time || 1
    const size = options?.size || '640x360'
    
    const command = `${this.ffmpegPath} -i "${videoPath}" -ss ${time} -vframes 1 -vf scale=${size} -f image2 "${outputPath}" -y`
    
    try {
      execSync(command)
      logger.info('Thumbnail generated successfully', { outputPath })
    } catch (error) {
      logger.error('Failed to generate thumbnail:', error)
      throw new Error('Thumbnail generation failed')
    }
  }
  
  /**
   * Parse FPS from fraction string (e.g., "30/1")
   */
  private parseFps(fpsString: string): number {
    try {
      if (fpsString.includes('/')) {
        const [numerator, denominator] = fpsString.split('/')
        return parseInt(numerator) / parseInt(denominator)
      }
      return parseFloat(fpsString)
    } catch {
      return 30 // Default FPS
    }
  }
  
  /**
   * Check if FFmpeg is available
   */
  async checkFFmpeg(): Promise<boolean> {
    try {
      execSync(`${this.ffmpegPath} -version`, { stdio: 'ignore' })
      execSync(`${this.ffprobePath} -version`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
}