/**
 * FFmpeg Renderer - Based on working viewport-adaptive-generator-patched.js
 * This is the PROVEN WORKING implementation with correct logo sizing
 */

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import ImageHandlingModes from './ImageHandlingModes.js';
import MathematicalSizing from './MathematicalSizing.js';

class FFmpegRenderer {
  constructor(options = {}) {
    this.ffmpegPath = options.ffmpegPath || 'ffmpeg';
    this.ffprobePath = options.ffprobePath || 'ffprobe';
    
    if (this.ffmpegPath) ffmpeg.setFfmpegPath(this.ffmpegPath);
    if (this.ffprobePath) ffmpeg.setFfprobePath(this.ffprobePath);
    
    // Initialize image handling modes and mathematical sizing
    this.imageHandlingModes = new ImageHandlingModes();
    this.sizing = new MathematicalSizing();
    
    // Image handling modes constants
    this.IMAGE_MODES = {
      CROP_FILL: 'crop_fill',
      LETTERBOX: 'letterbox',
      BLUR_BACKGROUND: 'blur_background',
      AUTO: 'auto'
    };
    
    // Default image mode
    this.defaultImageMode = options.defaultImageMode || this.IMAGE_MODES.CROP_FILL;
  }

  /**
   * Get image dimensions using ffprobe
   */
  async getImageDimensions(imagePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(imagePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        const stream = metadata.streams.find(s => s.codec_type === 'video');
        resolve({
          width: stream.width,
          height: stream.height,
          aspectRatio: stream.width / stream.height
        });
      });
    });
  }

  /**
   * Get audio duration
   */
  async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(metadata.format.duration);
      });
    });
  }

  /**
   * Build FFmpeg command - WORKING IMPLEMENTATION from patched version
   */
  async buildCommand(options) {
    const {
      images,
      voiceOver,
      backgroundMusic,
      logo,
      reviewImage,
      outputPath,
      videoWidth,
      videoHeight,
      duration,
      logoSize,
      reviewCardSize,
      preset = 'medium',
      quality = 23,
      imageMode = this.defaultImageMode,
      transition = { type: 'fade', duration: 0.5 } // Default fade transition
    } = options;

    const command = ffmpeg();
    
    // Add all image inputs
    images.forEach(img => command.input(img));
    
    // Add audio inputs
    let voiceIndex, musicIndex;
    if (voiceOver) {
      voiceIndex = images.length;
      command.input(voiceOver);
    }
    if (backgroundMusic) {
      musicIndex = images.length + (voiceOver ? 1 : 0);
      command.input(backgroundMusic);
    }
    
    // Add overlay inputs
    let logoIndex, reviewIndex;
    if (logo) {
      logoIndex = images.length + (voiceOver ? 1 : 0) + (backgroundMusic ? 1 : 0);
      command.input(logo);
    }
    if (reviewImage) {
      reviewIndex = images.length + (voiceOver ? 1 : 0) + (backgroundMusic ? 1 : 0) + (logo ? 1 : 0);
      command.input(reviewImage);
    }

    // Build filter complex
    const filterComplex = await this.buildFilterComplex({
      images,
      voiceOver,
      backgroundMusic,
      logo,
      reviewImage,
      videoWidth,
      videoHeight,
      duration,
      logoSize,
      reviewCardSize,
      voiceIndex,
      musicIndex,
      logoIndex,
      reviewIndex,
      imageMode,
      transition
    });

    // Apply filter and output options
    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[final_video]',
        '-map', '[audio]',
        '-c:v', 'libx264',
        '-preset', preset,
        '-crf', quality,
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        `-t`, duration.toString()
      ])
      .output(outputPath);

    return command;
  }

  /**
   * Build filter complex - WORKING IMPLEMENTATION WITH TRANSITIONS
   */
  async buildFilterComplex(options) {
    const {
      images,
      videoWidth,
      videoHeight,
      duration,
      logoSize,
      reviewCardSize,
      voiceIndex,
      musicIndex,
      logoIndex,
      reviewIndex,
      imageMode = this.defaultImageMode,
      transition = { type: 'fade', duration: 0.5 } // Default fade transition
    } = options;

    const filters = [];
    const fps = 30;
    
    // Use 1:1 image mapping (no cycling) - duration per image calculated in VideoGenerator
    const numSegments = images.length;
    const actualImageDuration = duration / numSegments;
    
    // Use images directly (1:1 mapping, no cycling)
    const imageSequence = images;
    const uniqueImages = images;
    const imageMap = {};
    
    // Pre-process unique images ONCE (more efficient)
    for (const img of uniqueImages) {
      const inputIndex = images.indexOf(img);
      imageMap[img] = inputIndex;
      
      // Get image dimensions for smart mode selection
      let imageDims = null;
      try {
        imageDims = await this.getImageDimensions(img);
      } catch (err) {
        console.warn(`Warning: Could not get dimensions for ${img}, using crop fill mode`);
      }
      
      // Build filter based on selected mode
      let filter;
      if (imageMode === this.IMAGE_MODES.LETTERBOX && imageDims) {
        filter = this.imageHandlingModes.buildLetterboxFilter({
          inputIndex,
          videoWidth,
          videoHeight,
          imageWidth: imageDims.width,
          imageHeight: imageDims.height,
          backgroundColor: '#2a2a2a'
        });
        filters.push(filter.replace('[letterboxed]', `[processed${inputIndex}]`));
      } else if (imageMode === this.IMAGE_MODES.BLUR_BACKGROUND) {
        filter = this.imageHandlingModes.buildBlurBackgroundFilter({
          inputIndex,
          videoWidth,
          videoHeight,
          blurStrength: 30
        });
        filters.push(filter.replace('[composed]', `[processed${inputIndex}]`));
      } else {
        // Default to crop fill mode (no scaling needed)
        filter = this.imageHandlingModes.buildCropFillFilter({
          inputIndex,
          videoWidth,
          videoHeight,
          scale: 1 // Use native resolution
        });
        filters.push(filter + `[processed${inputIndex}]`);
      }
    }
    
    // Create Ken Burns effect for each image in sequence
    let imageInputs = [];
    imageSequence.forEach((img, idx) => {
      const sourceIdx = imageMap[img];
      const outputLabel = `v${idx}`;
      const framesForSegment = Math.ceil(actualImageDuration * fps);
      
      // Disable Ken Burns zoom for all modes - use static transitions
      const needsKenBurns = false;
      
      if (needsKenBurns) {
        const zoomAmount = 0.3; // From original config
        // Ken Burns zoom effect using processed image
        filters.push(`[processed${sourceIdx}]zoompan=z='1+(on/${framesForSegment}*${zoomAmount})':x='(iw-ow)/2':y='(ih-oh)/2':d=${framesForSegment}:s=${videoWidth}x${videoHeight}:fps=${fps}[${outputLabel}]`);
      } else {
        // FIXED: For letterbox/blur modes, use proper frame generation
        filters.push(`[processed${sourceIdx}]loop=loop=${framesForSegment}:size=1:start=0,fps=${fps},trim=duration=${actualImageDuration}[${outputLabel}]`);
      }
      imageInputs.push(`[${outputLabel}]`);
    });

    // Apply transitions between image segments using xfade
    if (imageInputs.length === 1) {
      // Single image - no transitions needed, just copy
      const inputLabel = imageInputs[0].replace(/[\[\]]/g, '');
      filters.push(`[${inputLabel}]copy[base_video]`);
    } else {
      // Multiple images - build xfade chain for smooth transitions
      const transitionType = transition.type || 'fade';
      const transitionDuration = transition.duration || 0.5;

      let currentLabel = imageInputs[0].replace(/[\[\]]/g, '');

      for (let i = 1; i < imageInputs.length; i++) {
        const nextLabel = imageInputs[i].replace(/[\[\]]/g, '');
        const outputLabel = i === imageInputs.length - 1 ? 'base_video' : `xfade${i}`;

        // Calculate transition offset
        // offset = start_of_current_clip + duration_of_clip - transition_duration
        const offset = (i * actualImageDuration) - transitionDuration;

        filters.push(
          `[${currentLabel}][${nextLabel}]xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset}[${outputLabel}]`
        );

        currentLabel = outputLabel;
      }
    }
    
    // Trim to exact duration
    filters.push(`[base_video]trim=0:${duration}[trimmed]`);
    
    // Add logo overlay if provided
    let currentOutput = 'trimmed';
    if (logoSize && logoIndex !== undefined) {
      filters.push(`[${logoIndex}:v]scale=${logoSize.width}:${logoSize.height}[logo_scaled]`);
      filters.push(`[${currentOutput}][logo_scaled]overlay=${logoSize.x}:${logoSize.y}[with_logo]`);
      currentOutput = 'with_logo';
    }
    
    // Add review overlay if provided
    if (reviewCardSize && reviewIndex !== undefined) {
      const reviewStart = 5; // Start at 5 seconds (after intro)
      const reviewEnd = Math.min(20, duration * 0.3); // Show for 15 seconds or 30% of video
      
      filters.push(`[${reviewIndex}:v]scale=${reviewCardSize.width}:${reviewCardSize.height}[review_scaled]`);
      filters.push(`[${currentOutput}][review_scaled]overlay=${reviewCardSize.x}:${reviewCardSize.y}:enable='between(t,${reviewStart},${reviewEnd})'[with_review]`);
      currentOutput = 'with_review';
    }
    
    // Final video output
    filters.push(`[${currentOutput}]format=yuv420p[final_video]`);
    
    // Audio processing
    if (voiceIndex !== undefined && musicIndex !== undefined) {
      // Both voice and music
      filters.push(`[${voiceIndex}:a]adelay=1500|1500[delayed_voice]`);
      filters.push(`[${musicIndex}:a]afade=t=in:st=0:d=1.5,afade=t=out:st=${duration - 1.5}:d=1.5,volume=0.15[music_faded]`);
      filters.push(`[delayed_voice][music_faded]amix=inputs=2:duration=longest[audio]`);
    } else if (voiceIndex !== undefined) {
      // Voice only
      filters.push(`[${voiceIndex}:a]adelay=1500|1500[audio]`);
    } else if (musicIndex !== undefined) {
      // Music only
      filters.push(`[${musicIndex}:a]afade=t=in:st=0:d=1.5,afade=t=out:st=${duration - 1.5}:d=1.5,volume=0.3[audio]`);
    } else {
      // No audio - create silent track
      filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000:duration=${duration}[audio]`);
    }
    
    return filters.join(';');
  }

  /**
   * Generate video - main entry point
   */
  async generateVideo(options) {
    const { outputPath, onProgress } = options;
    
    // Build FFmpeg command
    const command = await this.buildCommand(options);
    
    // Return promise that resolves when video is complete
    return new Promise((resolve, reject) => {
      command
        .on('start', (cmd) => {
          if (options.debug) {
            console.log('FFmpeg command:', cmd);
          }
        })
        .on('progress', (progress) => {
          if (onProgress) {
            onProgress({
              percent: progress.percent || 0,
              time: progress.timemark
            });
          }
        })
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        })
        .run();
    });
  }
}

export default FFmpegRenderer;