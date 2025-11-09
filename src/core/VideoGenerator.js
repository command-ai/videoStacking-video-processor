/**
 * Main Video Generator - CLEAN VERSION
 * Uses working FFmpeg renderer with mathematical sizing and platform templates
 */

import path from 'path';
import fs from 'fs/promises';
import MathematicalSizing from './MathematicalSizing.js';
import PlatformTemplates from '../templates/PlatformTemplates.js';
import FFmpegRenderer from './FFmpegRenderer.js';

class VideoGenerator {
  constructor(config = {}) {
    this.sizing = new MathematicalSizing();
    this.templates = new PlatformTemplates();
    this.renderer = new FFmpegRenderer({
      ffmpegPath: config.ffmpegPath,
      ffprobePath: config.ffprobePath,
      defaultImageMode: config.defaultImageMode
    });
    
    // Configuration
    this.tempDir = config.tempDir || './temp';
    this.outputDir = config.outputDir || './output';
  }

  /**
   * Generate video for a specific platform
   * @param {string} platform - Platform identifier
   * @param {Object} assets - Media assets
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Output video path
   */
  async generateVideo(platform, assets, options = {}) {
    console.log(`🎬 Starting video generation for ${platform}`);
    
    // Validate inputs
    const validation = this.templates.validateAssets(platform, assets);
    if (!validation.valid) {
      throw new Error(`Asset validation failed: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Warnings:', validation.warnings.join(', '));
    }
    
    // Get dimensions for overlays if they exist
    const dimensions = {
      logo: assets.logo ? await this.renderer.getImageDimensions(assets.logo) : null,
      reviewCard: assets.reviewImage ? await this.renderer.getImageDimensions(assets.reviewImage) : null
    };
    
    // Get platform template with calculated sizes
    const template = this.templates.getTemplate(platform, dimensions, {
      adaptiveGraphics: options.adaptiveGraphics !== false // Default to true
    });
    
    // Create working directory
    const sessionId = Date.now().toString();
    const workDir = path.join(this.tempDir, sessionId);
    await fs.mkdir(workDir, { recursive: true });
    
    try {
      // Generate the video
      const outputPath = await this.renderVideo(template, assets, workDir, options);
      
      console.log(`✅ Video generated successfully: ${outputPath}`);
      return outputPath;
      
    } finally {
      // Cleanup temp files
      if (!options.keepTemp) {
        await fs.rm(workDir, { recursive: true, force: true }).catch(console.warn);
      }
    }
  }

  /**
   * Render video using working FFmpeg renderer
   * @private
   */
  async renderVideo(template, assets, workDir, options) {
    const { resolution, calculatedSizes } = template;
    const outputFilename = `${template.platform}_${Date.now()}.mp4`;
    const outputPath = path.join(this.outputDir, outputFilename);
    
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Calculate duration based on available images (1:1 mapping, no cycling)
    const imageCount = assets.images.length;
    let duration;
    
    // Check if targetDuration is provided in options.settings
    if (options.settings && options.settings.targetDuration) {
      duration = options.settings.targetDuration;
      console.log(`📊 Using platform-specific target duration: ${duration}s`);
    } else if (assets.voiceOver) {
      try {
        const audioDuration = await this.renderer.getAudioDuration(assets.voiceOver);
        // Use voice duration + padding, but ensure minimum time per image
        const minDurationForImages = imageCount * 3; // 3 seconds minimum per image
        duration = Math.max(audioDuration + 3, minDurationForImages);
      } catch (err) {
        console.warn('Could not determine audio duration, using image-based duration:', err.message);
        duration = imageCount * 5; // 5 seconds per image fallback
      }
    } else {
      // No voice over - use image-based duration
      duration = imageCount * 5; // 5 seconds per image
    }
    
    console.log(`📊 Duration calculation: ${imageCount} images, ${duration}s total (${(duration/imageCount).toFixed(1)}s per image)`);
    
    // Generate video using working FFmpeg renderer
    return this.renderer.generateVideo({
      images: assets.images,
      voiceOver: assets.voiceOver,
      backgroundMusic: assets.backgroundMusic,
      logo: assets.logo,
      reviewImage: assets.reviewImage,
      outputPath,
      videoWidth: resolution.width,
      videoHeight: resolution.height,
      duration,
      logoSize: calculatedSizes.logo,
      reviewCardSize: calculatedSizes.reviewCard,
      preset: options.preset || 'medium',
      quality: options.quality || 23,
      imageMode: options.imageMode,
      debug: options.debug,
      onProgress: options.onProgress
    });
  }

  /**
   * Generate videos for multiple platforms
   * @param {Array<string>} platforms - Platform identifiers
   * @param {Object} assets - Media assets
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Results by platform
   */
  async generateMultiplePlatforms(platforms, assets, options = {}) {
    const results = {};
    
    for (const platform of platforms) {
      try {
        console.log(`\n📱 Processing ${platform}...`);
        const outputPath = await this.generateVideo(platform, assets, {
          ...options,
          imageMode: options.imageMode,
          onProgress: (progress) => {
            if (options.onProgress) {
              options.onProgress({
                ...progress,
                platform,
                currentPlatform: platforms.indexOf(platform) + 1,
                totalPlatforms: platforms.length
              });
            }
          }
        });
        
        results[platform] = {
          success: true,
          path: outputPath
        };
      } catch (error) {
        console.error(`❌ Failed to generate ${platform}:`, error.message);
        results[platform] = {
          success: false,
          error: error.message
        };
      }
    }
    
    return results;
  }
}

export default VideoGenerator;