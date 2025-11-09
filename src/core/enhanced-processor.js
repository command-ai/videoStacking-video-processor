/**
 * Enhanced Video Processor
 * Applies enhancements (logo, music, intro/outro, frame assets) to videos using FFmpeg
 */

import path from 'path'
import fs from 'fs/promises'
import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '../utils/logger.js'
import MathematicalSizing from './MathematicalSizing.js'

const execAsync = promisify(exec)

export class EnhancedVideoProcessor {
  constructor(config = {}) {
    this.ffmpegPath = config.ffmpegPath || 'ffmpeg'
    this.ffprobePath = config.ffprobePath || 'ffprobe'
    this.tempDir = config.tempDir || './temp/enhanced'
    this.outputDir = config.outputDir || './output/enhanced'
    this.mathSizing = new MathematicalSizing()
  }

  /**
   * Process video with enhancements
   * @param {Object} params - Processing parameters
   * @returns {Promise<string>} Path to enhanced video
   */
  async processVideoWithEnhancements(params) {
    const {
      videoId,
      platform,
      media,
      enhancements,
      settings,
      onProgress
    } = params

    const sessionId = `${videoId}_${Date.now()}`
    const workDir = path.join(this.tempDir, sessionId)
    await fs.mkdir(workDir, { recursive: true })

    logger.info('Starting enhancement processing', {
      sessionId,
      workDir,
      platform,
      enhancementTypes: Object.keys(enhancements || {})
    })

    try {
      // Get original video path
      logger.info('Step 1: Getting original video')
      const originalVideoPath = await this.getOriginalVideo(media, workDir)
      logger.info('Original video retrieved', { originalVideoPath })
      
      // Get video info
      logger.info('Step 2: Getting video info')
      const videoInfo = await this.getVideoInfo(originalVideoPath)
      logger.info('Video info retrieved', { videoInfo })
      
      // Initialize current video path
      let currentVideoPath = originalVideoPath
      
      // Handle dynamic video duration if duration info is provided
      if (enhancements.duration && enhancements.duration.targetVideoDuration) {
        const targetDuration = enhancements.duration.targetVideoDuration
        const loopCount = enhancements.duration.loopCount || 1
        
        logger.info('Dynamic video duration detected', {
          originalDuration: videoInfo.duration,
          targetDuration,
          loopCount,
          voiceoverDuration: enhancements.duration.voiceoverDuration
        })
        
        // If we need to loop the video for longer duration
        if (loopCount > 1 && targetDuration > videoInfo.duration) {
          const loopedVideoPath = path.join(workDir, 'looped_video.mp4')
          const loopCmd = [
            this.ffmpegPath,
            '-stream_loop', loopCount - 1,
            '-i', originalVideoPath,
            '-t', targetDuration,
            '-c', 'copy',
            loopedVideoPath
          ].join(' ')
          
          logger.info('Creating looped video for target duration', { loopCmd })
          await execAsync(loopCmd)
          currentVideoPath = loopedVideoPath
        } else if (targetDuration < videoInfo.duration) {
          // Trim video if target is shorter
          const trimmedVideoPath = path.join(workDir, 'trimmed_video.mp4')
          const trimCmd = [
            this.ffmpegPath,
            '-i', originalVideoPath,
            '-t', targetDuration,
            '-c', 'copy',
            trimmedVideoPath
          ].join(' ')
          
          logger.info('Trimming video to target duration', { trimCmd })
          await execAsync(trimCmd)
          currentVideoPath = trimmedVideoPath
        } else {
          currentVideoPath = originalVideoPath
        }
      } else {
        // Apply enhancements in sequence
        currentVideoPath = originalVideoPath
      }
      
      // 1. Apply logo overlay if present
      logger.info('Checking for logo enhancement:', { hasLogo: !!enhancements.logo, logo: enhancements.logo })
      if (enhancements.logo) {
        logger.info('Applying logo overlay...')
        onProgress?.({ percent: 10, stage: 'Applying logo overlay' })
        currentVideoPath = await this.applyLogoOverlay(
          currentVideoPath,
          { ...enhancements.logo, platform },
          videoInfo,
          workDir
        )
        logger.info('Logo overlay complete, new path:', currentVideoPath)
      }

      // 2. Apply frame assets (borders, badges) if present
      if (enhancements.frameAssets) {
        onProgress?.({ percent: 25, stage: 'Applying frame assets' })
        currentVideoPath = await this.applyFrameAssets(
          currentVideoPath,
          enhancements.frameAssets,
          videoInfo,
          workDir
        )
      }

      // 3. Apply intro if present
      if (enhancements.intro) {
        onProgress?.({ percent: 40, stage: 'Adding intro sequence' })
        currentVideoPath = await this.applyIntro(
          currentVideoPath,
          enhancements.intro,
          videoInfo,
          workDir
        )
      }

      // 4. Apply outro if present
      if (enhancements.outro) {
        onProgress?.({ percent: 55, stage: 'Adding outro sequence' })
        currentVideoPath = await this.applyOutro(
          currentVideoPath,
          enhancements.outro,
          videoInfo,
          workDir
        )
      }

      // 5. Apply music/voiceover if present
      if (enhancements.music || enhancements.voiceover) {
        onProgress?.({ percent: 70, stage: 'Mixing audio tracks' })
        logger.info('Starting audio mixing', { 
          hasMusic: !!enhancements.music,
          hasVoiceover: !!enhancements.voiceover
        })
        currentVideoPath = await this.applyAudio(
          currentVideoPath,
          enhancements,
          videoInfo,
          workDir
        )
        logger.info('Audio mixing complete')
        onProgress?.({ percent: 80, stage: 'Audio mixing complete' })
      }

      // 6. Final encoding with platform-specific settings
      logger.info('STEP 6: Starting final encoding', { currentVideoPath, videoId, platform })
      onProgress?.({ percent: 85, stage: 'Final encoding' })
      const outputPath = path.join(this.outputDir, `${videoId}_enhanced_${platform}.mp4`)
      logger.info('Creating output directory:', path.dirname(outputPath))
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      
      logger.info('Calling finalEncode...')
      await this.finalEncode(currentVideoPath, outputPath, platform, settings)
      logger.info('Final encoding completed successfully')
      
      // Verify the output file exists
      try {
        const stats = await fs.stat(outputPath)
        logger.info('Enhanced video created successfully', {
          outputPath,
          size: stats.size,
          sizeMB: (stats.size / 1024 / 1024).toFixed(2)
        })
      } catch (error) {
        logger.error('Output file not found after encoding!', { outputPath, error })
        throw new Error('Enhanced video file was not created')
      }
      
      onProgress?.({ percent: 100, stage: 'Complete' })
      
      return outputPath

    } catch (error) {
      logger.error('Enhanced video processing failed', { error, videoId })
      throw error
    } finally {
      // Cleanup temp files
      if (!settings?.keepTemp) {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  /**
   * Get original video from media array
   */
  async getOriginalVideo(media, workDir) {
    // Find the video file in media array
    const videoMedia = media.find(m => m.mimeType?.startsWith('video/'))
    
    if (!videoMedia) {
      throw new Error('No video file found in media')
    }

    // Download/copy video to work directory
    const videoPath = path.join(workDir, 'original.mp4')
    
    if (videoMedia.s3Key?.startsWith('http')) {
      logger.info(`Downloading video from URL: ${videoMedia.s3Key}`)
      try {
        // Use curl with better error handling
        execSync(`curl -L "${videoMedia.s3Key}" -o "${videoPath}" --fail`, { 
          stdio: ['pipe', 'pipe', 'pipe'] 
        })
        
        // Verify the downloaded file
        const stats = await fs.stat(videoPath)
        logger.info(`Downloaded video file size: ${stats.size} bytes`)
        
        if (stats.size < 1000) { // Less than 1KB suggests an error page
          const content = await fs.readFile(videoPath, 'utf8')
          logger.error('Downloaded file content (first 500 chars):', content.substring(0, 500))
          throw new Error('Downloaded file is too small - might be an error page')
        }
      } catch (error) {
        logger.error('Failed to download video:', error)
        throw new Error(`Failed to download video from ${videoMedia.s3Key}: ${error.message}`)
      }
    } else if (videoMedia.localPath) {
      await fs.copyFile(videoMedia.localPath, videoPath)
    } else {
      throw new Error('No valid video source found')
    }

    return videoPath
  }

  /**
   * Get video information using ffprobe
   */
  async getVideoInfo(videoPath) {
    logger.info('Getting video info for:', videoPath)
    
    // First check if file exists and has content
    try {
      const stats = await fs.stat(videoPath)
      logger.info('Video file stats:', { size: stats.size, path: videoPath })
      
      if (stats.size === 0) {
        throw new Error('Video file is empty')
      }
    } catch (error) {
      logger.error('Error checking video file:', error)
      throw new Error(`Video file not accessible: ${error.message}`)
    }
    
    const cmd = `${this.ffprobePath} -v error -print_format json -show_streams -show_format "${videoPath}"`
    logger.info('Running ffprobe command:', cmd)
    
    try {
      const output = execSync(cmd, { encoding: 'utf8' })
      logger.info('FFprobe output length:', output.length)
      
      if (!output || output.trim() === '{}' || output.trim() === '{\n\n}') {
        // Try alternative ffprobe command
        const altCmd = `${this.ffprobePath} -i "${videoPath}" -v quiet -print_format json -show_format -show_streams`
        logger.info('Trying alternative ffprobe command:', altCmd)
        const altOutput = execSync(altCmd, { encoding: 'utf8' })
        
        if (!altOutput || altOutput.trim() === '{}') {
          throw new Error('FFprobe returned empty output - video file may be corrupted')
        }
        output = altOutput
      }
      
      const data = JSON.parse(output)
      
      if (!data.streams || data.streams.length === 0) {
        throw new Error('No streams found in video file')
      }
      
      const videoStream = data.streams.find(s => s.codec_type === 'video')
      const audioStream = data.streams.find(s => s.codec_type === 'audio')
      
      if (!videoStream) {
        throw new Error('No video stream found in file')
      }
      
      return {
        width: videoStream.width,
        height: videoStream.height,
        duration: parseFloat(data.format.duration),
        fps: eval(videoStream.r_frame_rate),
        hasAudio: !!audioStream,
        audioCodec: audioStream?.codec_name,
        videoCodec: videoStream.codec_name
      }
    } catch (error) {
      logger.error('FFprobe failed:', { error: error.message, videoPath })
      throw new Error(`Failed to get video info: ${error.message}`)
    }
  }

  /**
   * Apply logo overlay to video
   */
  async applyLogoOverlay(inputPath, logoConfig, videoInfo, workDir) {
    const outputPath = path.join(workDir, 'logo_overlay.mp4')
    
    // Download/prepare logo image
    const logoPath = path.join(workDir, 'logo.png')
    
    if (logoConfig.s3Key) {
      // Download logo from R2 using authenticated client
      logger.info(`Downloading logo from R2: ${logoConfig.s3Key}`)
      try {
        const { downloadFromR2 } = await import('../storage/r2-client.js')
        await downloadFromR2(logoConfig.s3Key, logoPath)
      } catch (error) {
        throw new Error(`Failed to download logo from R2 ${logoConfig.s3Key}: ${error.message}`)
      }
    } else if (logoConfig.url) {
      // Download logo from URL (fallback for backward compatibility)
      logger.info(`Downloading logo from URL: ${logoConfig.url}`)
      try {
        execSync(`curl -L "${logoConfig.url}" -o "${logoPath}"`)
      } catch (error) {
        throw new Error(`Failed to download logo from ${logoConfig.url}: ${error.message}`)
      }
    } else if (logoConfig.file) {
      // Direct file buffer
      await fs.writeFile(logoPath, logoConfig.file)
    } else if (logoConfig.preview?.startsWith('data:')) {
      // Convert base64 to file (fallback)
      const base64Data = logoConfig.preview.split(',')[1]
      await fs.writeFile(logoPath, Buffer.from(base64Data, 'base64'))
    } else {
      throw new Error('No valid logo source (url, file, or preview)')
    }

    // Get logo dimensions using ffprobe
    let logoInfo
    try {
      const logoProbeCmd = `${this.ffprobePath} -v quiet -print_format json -show_streams "${logoPath}"`
      const logoProbeOutput = execSync(logoProbeCmd, { encoding: 'utf8' })
      const logoData = JSON.parse(logoProbeOutput)
      const logoStream = logoData.streams.find(s => s.codec_type === 'video')
      logoInfo = {
        width: logoStream.width,
        height: logoStream.height
      }
    } catch (error) {
      logger.warn('Failed to get logo dimensions, using defaults', error)
      logoInfo = { width: 300, height: 150 } // Default fallback
    }
    
    // Map platform names for MathematicalSizing
    const platformMap = {
      'youtube': 'youtube',
      'youtube_shorts': 'youtube_shorts',
      'instagram': 'instagram',
      'instagram_reels': 'instagram_reel',
      'facebook': 'facebook',
      'facebook_reels': 'facebook_reels',
      'tiktok': 'tiktok',
      'linkedin': 'linkedin'
    }
    
    const platform = logoConfig.platform || 'youtube'
    const mappedPlatform = platformMap[platform] || 'youtube'
    
    // Use MathematicalSizing to calculate logo dimensions
    const sizingResult = this.mathSizing.calculateLogoSize(
      mappedPlatform,
      videoInfo.width,
      videoInfo.height,
      logoInfo.width,
      logoInfo.height
    )

    // Apply user's size preference (small=0.8, medium=1.0, large=1.2)
    let sizeMultiplier = logoConfig.size !== undefined ? logoConfig.size : 1.0

    // If size is > 2, it's likely in 0-100 format (80, 100, 120), convert to 0-1
    if (sizeMultiplier > 2) {
      sizeMultiplier = sizeMultiplier / 100
      logger.info(`Converting logo size from percentage format (${logoConfig.size}) to multiplier format (${sizeMultiplier})`)
    }

    const finalWidth = Math.round(sizingResult.width * sizeMultiplier)
    const finalHeight = Math.round(sizingResult.height * sizeMultiplier)

    // Calculate clear space (5% of width as defined in MathematicalSizing)
    const clearSpace = Math.round(videoInfo.width * 0.05)

    logger.info('Logo sizing calculation:', {
      platform,
      mappedPlatform,
      videoSize: `${videoInfo.width}x${videoInfo.height}`,
      logoOriginalSize: `${logoInfo.width}x${logoInfo.height}`,
      calculatedBaseSize: `${sizingResult.width}x${sizingResult.height}`,
      sizeMultiplier,
      finalSize: `${finalWidth}x${finalHeight}`,
      clearSpace
    })
    
    // Normalize opacity: handle both 0-100 (old format) and 0-1 (new format)
    let opacity = logoConfig.opacity !== undefined ? Number(logoConfig.opacity) : 100

    // Convert to 0-1 range if needed (handle both 0-100 percentage and 0-1 decimal)
    if (opacity > 1) {
      opacity = opacity / 100
      logger.info(`Converting logo opacity from percentage (${logoConfig.opacity}) to decimal (${opacity})`)
    }

    // Ensure opacity is within valid range for FFmpeg colorchannelmixer aa parameter (-2 to 2)
    // But for alpha transparency, we want 0-1 range
    opacity = Math.max(0, Math.min(1, opacity))
    
    // Get position from MathematicalSizing or use FFmpeg expressions
    const positionMap = {
      'top-left': { x: clearSpace, y: clearSpace },
      'top-center': { x: '(main_w-overlay_w)/2', y: clearSpace },
      'top-right': { x: `main_w-overlay_w-${clearSpace}`, y: clearSpace },
      'center-left': { x: clearSpace, y: '(main_h-overlay_h)/2' },
      'center': { x: '(main_w-overlay_w)/2', y: '(main_h-overlay_h)/2' },
      'center-right': { x: `main_w-overlay_w-${clearSpace}`, y: '(main_h-overlay_h)/2' },
      'bottom-left': { x: clearSpace, y: `main_h-overlay_h-${clearSpace}` },
      'bottom-center': { x: '(main_w-overlay_w)/2', y: `main_h-overlay_h-${clearSpace}` },
      'bottom-right': { x: `main_w-overlay_w-${clearSpace}`, y: `main_h-overlay_h-${clearSpace}` },
      'golden-top-left': { x: sizingResult.x || clearSpace, y: sizingResult.y || clearSpace },
      'golden-bottom-right': { x: sizingResult.x || `main_w-overlay_w-${clearSpace}`, y: sizingResult.y || `main_h-overlay_h-${clearSpace}` }
    }
    
    const selectedPosition = logoConfig.position || 'bottom-right'
    const position = positionMap[selectedPosition] || positionMap['bottom-right']
    
    // Build FFmpeg command with properly sized logo
    const filterComplex = [
      `[1:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=${opacity}[logo]`,
      `[0:v][logo]overlay=${position.x}:${position.y}`
    ].join(';')

    const cmd = [
      this.ffmpegPath,
      '-i', inputPath,
      '-i', logoPath,
      '-filter_complex', `"${filterComplex}"`,
      '-c:a', 'copy',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      outputPath
    ].join(' ')

    logger.info('Executing FFmpeg logo overlay command:', { cmd })

    try {
      const { stdout, stderr } = await execAsync(cmd)
      if (stdout) logger.info('FFmpeg stdout:', stdout)
      if (stderr) logger.info('FFmpeg stderr:', stderr)
    } catch (error) {
      logger.error('FFmpeg logo overlay failed:', { error: error.message, cmd })
      throw error
    }
    
    return outputPath
  }

  /**
   * Apply frame assets (borders, badges, overlays)
   */
  async applyFrameAssets(inputPath, frameAssets, videoInfo, workDir) {
    let currentPath = inputPath
    
    // Apply border if present
    if (frameAssets.border?.id) {
      const borderPath = path.join(workDir, 'border.mp4')
      // Implementation for border overlay
      // For now, just copy the input
      await fs.copyFile(currentPath, borderPath)
      currentPath = borderPath
    }

    // Apply badge if present
    if (frameAssets.badge?.id) {
      const badgePath = path.join(workDir, 'badge.mp4')
      // Implementation for badge overlay at specified position
      // For now, just copy the input
      await fs.copyFile(currentPath, badgePath)
      currentPath = badgePath
    }

    // Apply overlay if present
    if (frameAssets.overlay?.id) {
      const overlayPath = path.join(workDir, 'overlay.mp4')
      // Implementation for overlay effect
      // For now, just copy the input
      await fs.copyFile(currentPath, overlayPath)
      currentPath = overlayPath
    }

    return currentPath
  }

  /**
   * Apply intro sequence
   */
  async applyIntro(inputPath, introConfig, videoInfo, workDir) {
    const outputPath = path.join(workDir, 'with_intro.mp4')
    
    // Generate intro video based on template
    const introPath = await this.generateIntro(introConfig, videoInfo, workDir)
    
    // Concatenate intro with main video
    const listPath = path.join(workDir, 'concat_intro.txt')
    await fs.writeFile(listPath, `file '${introPath}'\nfile '${inputPath}'`)
    
    const cmd = [
      this.ffmpegPath,
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      outputPath
    ].join(' ')
    
    await execAsync(cmd)
    
    return outputPath
  }

  /**
   * Generate intro video
   */
  async generateIntro(introConfig, videoInfo, workDir) {
    const introPath = path.join(workDir, 'intro.mp4')
    const duration = introConfig.duration || 5
    
    // Create intro with text overlay
    // This is a simplified version - in production, use template-specific rendering
    const filterComplex = [
      `color=c=${introConfig.colorScheme || 'black'}:s=${videoInfo.width}x${videoInfo.height}:d=${duration}`,
      `drawtext=text='${introConfig.text.primary}':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2-50`,
      `drawtext=text='${introConfig.text.secondary}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2+50`
    ].join(',')
    
    const cmd = [
      this.ffmpegPath,
      '-f', 'lavfi',
      '-i', `"${filterComplex}"`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-t', duration,
      introPath
    ].join(' ')
    
    await execAsync(cmd)
    
    return introPath
  }

  /**
   * Apply outro sequence
   */
  async applyOutro(inputPath, outroConfig, videoInfo, workDir) {
    const outputPath = path.join(workDir, 'with_outro.mp4')
    
    // Generate outro video based on template
    const outroPath = await this.generateOutro(outroConfig, videoInfo, workDir)
    
    // Concatenate main video with outro
    const listPath = path.join(workDir, 'concat_outro.txt')
    await fs.writeFile(listPath, `file '${inputPath}'\nfile '${outroPath}'`)
    
    const cmd = [
      this.ffmpegPath,
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      outputPath
    ].join(' ')
    
    await execAsync(cmd)
    
    return outputPath
  }

  /**
   * Generate outro video
   */
  async generateOutro(outroConfig, videoInfo, workDir) {
    const outroPath = path.join(workDir, 'outro.mp4')
    const duration = outroConfig.duration || 5
    
    // Build contact info text
    const contactLines = []
    if (outroConfig.contactInfo.phone) contactLines.push(`Phone: ${outroConfig.contactInfo.phone}`)
    if (outroConfig.contactInfo.email) contactLines.push(`Email: ${outroConfig.contactInfo.email}`)
    if (outroConfig.contactInfo.website) contactLines.push(`Web: ${outroConfig.contactInfo.website}`)
    
    // Create outro with CTA and contact info
    const filterComplex = [
      `color=c=black:s=${videoInfo.width}x${videoInfo.height}:d=${duration}`,
      `drawtext=text='${outroConfig.cta}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=(h-text_h)/2-100`,
      ...contactLines.map((line, i) => 
        `drawtext=text='${line}':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2+${i * 40}`
      )
    ].join(',')
    
    const cmd = [
      this.ffmpegPath,
      '-f', 'lavfi',
      '-i', `"${filterComplex}"`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-t', duration,
      outroPath
    ].join(' ')
    
    await execAsync(cmd)
    
    return outroPath
  }

  /**
   * Apply audio tracks (music and/or voiceover)
   */
  async applyAudio(inputPath, enhancements, videoInfo, workDir) {
    const outputPath = path.join(workDir, 'with_audio.mp4')
    const inputs = ['-i', inputPath]
    const filterParts = []
    let audioInputIndex = 1

    // Extract duration information if provided
    const durationInfo = enhancements.duration || {}
    const voiceoverStartDelay = durationInfo.voiceoverStartDelay || 0.5
    const voiceoverEndDelay = durationInfo.voiceoverEndDelay || 1.0
    let targetVideoDuration = durationInfo.targetVideoDuration || videoInfo.duration
    let loopCount = durationInfo.loopCount || 1

    logger.info('Starting audio mixing process', {
      inputPath,
      outputPath,
      hasMusic: !!enhancements.music,
      hasVoiceover: !!enhancements.voiceover,
      videoHasAudio: videoInfo.hasAudio,
      musicData: enhancements.music ? JSON.stringify(enhancements.music) : 'none',
      voiceoverData: enhancements.voiceover ? JSON.stringify(enhancements.voiceover) : 'none',
      durationInfo,
      voiceoverStartDelay,
      voiceoverEndDelay,
      initialTargetDuration: targetVideoDuration
    })

    // STEP 1: Check voiceover FIRST to determine final video duration
    let hasVoiceoverFile = false
    let voiceoverDuration = 0
    if (enhancements.voiceover) {
      const voiceoverPath = path.join(workDir, 'voiceover.mp3')
      logger.info('Voiceover enhancement detected', {
        hasAudioUrl: !!enhancements.voiceover.audioUrl,
        hasUrl: !!enhancements.voiceover.url,
        hasS3Key: !!enhancements.voiceover.s3Key,
        voiceoverPath,
        workDir,
        enhancementData: JSON.stringify(enhancements.voiceover)
      })

      // Download voiceover file from URL or S3
      if (enhancements.voiceover.audioUrl || enhancements.voiceover.url) {
        const voiceoverUrl = enhancements.voiceover.audioUrl || enhancements.voiceover.url
        logger.info(`Downloading voiceover from URL: ${voiceoverUrl}`)
        try {
          logger.info('Executing curl command for voiceover download')
          execSync(`curl -L "${voiceoverUrl}" -o "${voiceoverPath}" --fail`)

          // Verify the voiceover file was downloaded
          const fs = await import('fs')
          const stats = fs.statSync(voiceoverPath)
          logger.info(`Voiceover downloaded successfully to ${voiceoverPath}, size: ${stats.size} bytes`)

          if (stats.size < 1000) {
            throw new Error('Downloaded voiceover file is too small, may be corrupted')
          }
          hasVoiceoverFile = true
          logger.info('Voiceover file ready for use')
        } catch (error) {
          logger.error('Failed to download voiceover from URL:', error)
          logger.warn('Continuing without voiceover due to download failure')
        }
      } else if (enhancements.voiceover.s3Key) {
        // Download from R2 using S3 key
        logger.info(`Downloading voiceover from R2: ${enhancements.voiceover.s3Key}`)
        try {
          const { downloadFromR2 } = await import('../storage/r2-client.js')
          await downloadFromR2(enhancements.voiceover.s3Key, voiceoverPath)
          logger.info(`Voiceover downloaded successfully from R2 to ${voiceoverPath}`)
          hasVoiceoverFile = true
          logger.info('Voiceover file ready for use')
        } catch (error) {
          logger.error('Failed to download voiceover from R2:', error)
          logger.warn('Continuing without voiceover due to R2 download failure')
        }
      } else {
        logger.error('Voiceover enhancement missing audioUrl, url, or s3Key', { voiceover: enhancements.voiceover })
        logger.warn('Continuing without voiceover due to missing download URL')
      }

      // Detect voiceover duration and extend video if needed BEFORE creating music filter
      if (hasVoiceoverFile) {
        try {
          const probeVoiceoverCmd = `${this.ffprobePath} -v quiet -print_format json -show_format "${voiceoverPath}"`
          const probeVoiceoverOutput = execSync(probeVoiceoverCmd, { encoding: 'utf8' })
          const voiceoverData = JSON.parse(probeVoiceoverOutput)
          voiceoverDuration = parseFloat(voiceoverData.format.duration)

          // Calculate total time needed for voiceover with delays
          const totalVoiceoverTime = voiceoverStartDelay + voiceoverDuration + voiceoverEndDelay

          logger.info('Voiceover duration analysis:', {
            voiceoverDuration,
            startDelay: voiceoverStartDelay,
            endDelay: voiceoverEndDelay,
            totalVoiceoverTime,
            currentTargetDuration: targetVideoDuration,
            videoOriginalDuration: videoInfo.duration
          })

          // If voiceover needs more time than target duration, extend the video
          if (totalVoiceoverTime > targetVideoDuration) {
            logger.info(`Extending video duration to accommodate voiceover: ${targetVideoDuration}s -> ${Math.ceil(totalVoiceoverTime)}s`)
            targetVideoDuration = Math.ceil(totalVoiceoverTime)

            // Recalculate loop count needed
            loopCount = Math.ceil(targetVideoDuration / videoInfo.duration)
            logger.info(`Recalculated loop count: ${loopCount}`)
          }
        } catch (error) {
          logger.warn('Failed to detect voiceover duration, using default target duration:', error.message)
        }
      }
    }

    // STEP 2: Now create music filter with the FINAL targetVideoDuration
    if (enhancements.music) {
      const musicPath = path.join(workDir, 'music.mp3')

      // DEBUG: Log exact music object received
      console.log('=== MUSIC ENHANCEMENT DEBUG ===')
      console.log('Full music object:', JSON.stringify(enhancements.music, null, 2))
      console.log('Has url?', !!enhancements.music.url, 'Value:', enhancements.music.url)
      console.log('Has s3Key?', !!enhancements.music.s3Key, 'Value:', enhancements.music.s3Key)
      console.log('s3Key type:', typeof enhancements.music.s3Key)
      console.log('s3Key length:', enhancements.music.s3Key?.length)
      console.log('================================')

      // Download music file from URL or S3
      if (enhancements.music.url) {
        // Download from URL
        logger.info(`Downloading music from URL: ${enhancements.music.url}`)
        try {
          execSync(`curl -L "${enhancements.music.url}" -o "${musicPath}" --fail`)

          // Verify the music file was downloaded
          const fs = await import('fs')
          const stats = fs.statSync(musicPath)
          logger.info(`Music downloaded successfully to ${musicPath}, size: ${stats.size} bytes`)

          if (stats.size < 1000) {
            throw new Error('Downloaded music file is too small, may be corrupted')
          }
        } catch (error) {
          logger.error('Failed to download music from URL:', error)
          throw new Error(`Failed to download music: ${error.message}`)
        }
      } else if (enhancements.music.s3Key) {
        // Download from R2 using S3 key
        console.log(`Downloading music from R2: ${enhancements.music.s3Key}`)
        try {
          const { downloadFromR2 } = await import('../storage/r2-client.js')
          await downloadFromR2(enhancements.music.s3Key, musicPath)
          console.log(`Music downloaded successfully from R2 to ${musicPath}`)
        } catch (error) {
          console.error('Failed to download music from R2:', error)
          throw new Error(`Failed to download music from R2: ${error.message}`)
        }
      } else {
        throw new Error('Music enhancement requires either url or s3Key')
      }

      inputs.push('-i', musicPath)

      // Get actual music duration, sample rate, and channels using ffprobe
      let musicDuration = 0
      let musicSampleRate = 44100
      let musicChannels = 2
      try {
        const probeMusicCmd = `${this.ffprobePath} -v quiet -print_format json -show_format -show_streams -select_streams a:0 "${musicPath}"`
        const probeMusicOutput = execSync(probeMusicCmd, { encoding: 'utf8' })
        const musicData = JSON.parse(probeMusicOutput)
        musicDuration = parseFloat(musicData.format.duration)

        // Get audio stream info
        if (musicData.streams && musicData.streams[0]) {
          musicSampleRate = parseInt(musicData.streams[0].sample_rate) || 44100
          musicChannels = parseInt(musicData.streams[0].channels) || 2
        }

        logger.info(`Music track info: duration=${musicDuration}s, sampleRate=${musicSampleRate}Hz, channels=${musicChannels}, FINAL Video duration=${targetVideoDuration}s`)
      } catch (error) {
        logger.warn('Failed to get music duration, assuming it needs looping', error)
        musicDuration = 0 // Will trigger looping as fallback
      }

      const volume = enhancements.music.volume || 0.15
      const fadeIn = enhancements.music.fadeIn || 1.5
      const fadeOut = enhancements.music.fadeOut || 1.5

      // Calculate fade out start based on FINAL video duration (after voiceover extension)
      const fadeOutStart = Math.max(0, targetVideoDuration - fadeOut)

      // Apply music with proper fades and looping ONLY if music is shorter than video
      let musicFilter = `[${audioInputIndex}:a]`

      // Only loop if music is shorter than FINAL video duration
      const needsLooping = musicDuration < targetVideoDuration && enhancements.music.loop !== false
      if (needsLooping) {
        // Calculate correct loop size: sample_rate * duration (size counts frames, not individual channel samples)
        const loopSize = Math.floor(musicSampleRate * musicDuration)
        logger.info(`Music is shorter than video (${musicDuration}s < ${targetVideoDuration}s), enabling loop with size=${loopSize}`)
        musicFilter += `aloop=loop=-1:size=${loopSize},`
      } else {
        logger.info(`Music is longer than video or looping disabled, will trim without loop`)
      }

      // Use FINAL targetVideoDuration for atrim (after voiceover extension)
      musicFilter += `volume=${volume},afade=t=in:d=${fadeIn},afade=t=out:d=${fadeOut}:st=${fadeOutStart},atrim=0:${targetVideoDuration}[music]`

      filterParts.push(musicFilter)
      audioInputIndex++
    }

    // STEP 3: Add voiceover filter (voiceover was already downloaded and duration checked in STEP 1)
    if (hasVoiceoverFile) {
      const voiceoverPath = path.join(workDir, 'voiceover.mp3')

      inputs.push('-i', voiceoverPath)

      // Apply voiceover with start delay using adelay filter
      // adelay expects milliseconds, so convert seconds to milliseconds
      const startDelayMs = Math.round(voiceoverStartDelay * 1000)

      // Add voiceover with delay
      filterParts.push(`[${audioInputIndex}:a]adelay=${startDelayMs}|${startDelayMs},volume=1.0[voice]`)
      audioInputIndex++

      logger.info('Voiceover added to FFmpeg inputs with delay', {
        startDelay: voiceoverStartDelay,
        startDelayMs,
        voiceoverDuration,
        extendedTargetDuration: targetVideoDuration
      })
    }
    
    // Mix audio streams
    if (filterParts.length > 0) {
      const mixInputs = []
      if (videoInfo.hasAudio) mixInputs.push('[0:a]')
      if (enhancements.music) mixInputs.push('[music]')
      if (hasVoiceoverFile) mixInputs.push('[voice]')
      
      filterParts.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest[aout]`)
      
      // Build FFmpeg command with duration handling
      const cmdParts = [
        this.ffmpegPath
      ]
      
      // Add loop for video if needed
      if (loopCount > 1 && targetVideoDuration > videoInfo.duration) {
        cmdParts.push('-stream_loop', loopCount - 1)
      }
      
      cmdParts.push(
        ...inputs,
        '-filter_complex', `"${filterParts.join(';')}"`,
        '-map', '0:v',
        '-map', '[aout]'
      )
      
      // Set exact duration if we have dynamic duration info
      if (targetVideoDuration) {
        cmdParts.push('-t', targetVideoDuration)
      }
      
      cmdParts.push(
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath
      )
      
      const cmd = cmdParts.join(' ')
      
      logger.info('Executing FFmpeg audio mixing command', { 
        cmd,
        inputCount: inputs.length,
        filterComplex: filterParts.join(';'),
        mixInputs: mixInputs.length
      })
      
      try {
        const { stdout, stderr } = await execAsync(cmd)
        if (stdout) logger.info('FFmpeg audio stdout:', stdout)
        if (stderr) logger.info('FFmpeg audio stderr:', stderr)
        
        // Verify output file exists
        const fs = await import('fs')
        const stats = await fs.promises.stat(outputPath)
        logger.info('Audio mixing complete', {
          outputPath,
          outputSize: stats.size,
          success: true
        })
      } catch (error) {
        logger.error('FFmpeg audio mixing failed', { 
          error: error.message,
          cmd,
          stderr: error.stderr
        })
        throw new Error(`Audio mixing failed: ${error.message}`)
      }
      
      return outputPath
    }
    
    return inputPath
  }

  /**
   * Final encoding with platform-specific settings
   */
  async finalEncode(inputPath, outputPath, platform, settings) {
    // Get platform-specific encoding settings
    const platformSettings = this.getPlatformSettings(platform)
    
    logger.info('FINAL ENCODE: Starting final encode', {
      inputPath,
      outputPath,
      platform,
      platformSettings
    })
    
    // Verify input file exists
    try {
      const inputStats = await fs.stat(inputPath)
      logger.info('FINAL ENCODE: Input file verified', {
        path: inputPath,
        size: inputStats.size,
        sizeMB: (inputStats.size / 1024 / 1024).toFixed(2)
      })
    } catch (error) {
      logger.error('FINAL ENCODE: Input file not found!', { inputPath, error })
      throw new Error(`Input file not found: ${inputPath}`)
    }
    
    const cmd = [
      this.ffmpegPath,
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', platformSettings.preset,
      '-crf', platformSettings.crf,
      '-maxrate', platformSettings.maxBitrate,
      '-bufsize', platformSettings.bufferSize,
      '-profile:v', platformSettings.profile,
      '-level', platformSettings.level,
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '192k',
      outputPath
    ].join(' ')
    
    logger.info('FINAL ENCODE: Executing FFmpeg command', { cmd })
    
    try {
      const startTime = Date.now()
      const { stdout, stderr } = await execAsync(cmd)
      const duration = Date.now() - startTime
      
      logger.info('FINAL ENCODE: FFmpeg completed', { 
        duration: `${duration}ms`,
        durationSeconds: (duration / 1000).toFixed(2)
      })
      
      if (stdout) logger.info('FINAL ENCODE: FFmpeg stdout:', stdout)
      if (stderr) logger.info('FINAL ENCODE: FFmpeg stderr:', stderr)
      
      // Verify output file
      const fs = await import('fs')
      const stats = await fs.promises.stat(outputPath)
      logger.info('Final encode complete', {
        outputPath,
        outputSize: stats.size,
        outputSizeMB: (stats.size / 1024 / 1024).toFixed(2)
      })
    } catch (error) {
      logger.error('Final encode failed', {
        error: error.message,
        cmd,
        stderr: error.stderr
      })
      throw new Error(`Final encode failed: ${error.message}`)
    }
  }

  /**
   * Get platform-specific encoding settings
   */
  getPlatformSettings(platform) {
    const settings = {
      youtube: {
        preset: 'medium',
        crf: 21,
        maxBitrate: '8M',
        bufferSize: '16M',
        profile: 'high',
        level: '4.1'
      },
      youtube_shorts: {
        preset: 'fast',
        crf: 23,
        maxBitrate: '5M',
        bufferSize: '10M',
        profile: 'main',
        level: '4.0'
      },
      tiktok: {
        preset: 'fast',
        crf: 23,
        maxBitrate: '4M',
        bufferSize: '8M',
        profile: 'main',
        level: '4.0'
      },
      instagram: {
        preset: 'fast',
        crf: 23,
        maxBitrate: '5M',
        bufferSize: '10M',
        profile: 'main',
        level: '4.0'
      },
      // Add more platforms as needed
    }
    
    return settings[platform] || settings.youtube
  }
}

/**
 * Export function for use by enhancement service
 */
export async function processVideoWithEnhancements(params) {
  const processor = new EnhancedVideoProcessor({
    tempDir: params.tempDir,
    outputDir: params.outputDir
  })
  
  return processor.processVideoWithEnhancements(params)
}