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
   * Get video duration
   */
  async getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(metadata.format.duration);
      });
    });
  }

  /**
   * Build FFmpeg command - MEMORY-EFFICIENT TWO-PASS for many images
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

    // Adjust transition duration based on image count to reduce memory usage
    // More images = shorter transitions to avoid "Resource temporarily unavailable" errors
    const adjustedTransition = { ...transition };
    if (images.length > 8) {
      adjustedTransition.duration = 0.25; // Very short transitions for 9-10 images
    } else if (images.length > 5) {
      adjustedTransition.duration = 0.4; // Shorter transitions for 6-8 images
    } else {
      adjustedTransition.duration = 0.6; // Longer, smoother transitions for few images
    }

    // xfade filter has PROVEN runaway memory issues with >6 images
    // Use batch rendering for any video with transitions and >6 images
    // Research shows memory exhaustion at ~50 images even on 2GB RAM
    const BATCH_THRESHOLD = 6;

    if (images.length > BATCH_THRESHOLD) {
      console.log(`🎬 Using batch rendering for ${images.length} images (xfade memory limit: ${BATCH_THRESHOLD})`);
      return this.buildCommandChunked(options);
    }

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
      transition: adjustedTransition // Use adjusted transition duration
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
   * Build command using CHUNKED RENDERING for unlimited images with transitions
   * Splits images into chunks of 10, renders each with transitions, then concatenates
   * Maintains quality, transitions, and music looping while staying within memory limits
   */
  async buildCommandChunked(options) {
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
      transition = { type: 'fade', duration: 0.5 }
    } = options;

    // CRITICAL: xfade has runaway memory with many images in one filter graph
    // Solution: Render mini-batches of 2-3 images with transitions
    // Research: https://advancedweb.hu/generating-a-crossfaded-slideshow-video-from-images-with-ffmpeg-and-melt/
    const CHUNK_SIZE = 3; // Small batches to keep xfade filter graph manageable
    const OVERLAP = 1; // Overlap last image of chunk N with first image of chunk N+1 for seamless transitions
    const tempDir = path.dirname(outputPath);
    const chunkPaths = [];
    const chunkDurations = [];

    // Calculate chunks with overlap
    const chunks = [];
    let idx = 0;
    while (idx < images.length) {
      const chunkImages = [];
      const isFirstChunk = chunks.length === 0;

      // For non-first chunks, include overlap image from previous chunk
      if (!isFirstChunk && idx > 0) {
        chunkImages.push(images[idx - OVERLAP]);
      }

      // Add CHUNK_SIZE images (or remaining images)
      const remaining = images.length - idx;
      const count = Math.min(CHUNK_SIZE, remaining);
      for (let i = 0; i < count; i++) {
        chunkImages.push(images[idx + i]);
      }

      chunks.push({
        images: chunkImages,
        startIdx: idx,
        hasOverlap: !isFirstChunk
      });

      idx += count;
    }

    const numChunks = chunks.length;
    console.log(`📦 Batch rendering: ${images.length} images → ${numChunks} mini-segments with overlap (prevents xfade memory explosion)`);

    // Step 1: Render each chunk with transitions
    for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const chunkImages = chunk.images;
      const chunkDuration = (duration * chunkImages.length) / images.length;

      console.log(`  🎬 Rendering chunk ${chunkIndex + 1}/${numChunks} (${chunkImages.length} images${chunk.hasOverlap ? ', 1 overlap' : ''})`);

      const chunkPath = path.join(tempDir, `chunk_${chunkIndex}.mp4`);
      chunkPaths.push(chunkPath);
      chunkDurations.push(chunkDuration);

      // Render this chunk with transitions using existing logic
      await this.renderChunk({
        images: chunkImages,
        outputPath: chunkPath,
        videoWidth,
        videoHeight,
        duration: chunkDuration,
        preset,
        quality,
        imageMode,
        transition
      });
    }

    // Step 2: Concatenate chunks with crossfade transitions
    console.log(`🔗 Concatenating ${numChunks} chunks with crossfade transitions...`);
    await this.concatenateChunksWithTransitions({
      chunkPaths,
      chunkDurations,
      chunks, // Pass chunk structure for accurate overlap calculation
      outputPath,
      voiceOver,
      backgroundMusic,
      logo,
      reviewImage,
      logoSize,
      reviewCardSize,
      duration,
      videoWidth,
      videoHeight,
      preset,
      quality,
      transition
    });

    // Cleanup chunk files
    for (const chunkPath of chunkPaths) {
      try {
        await fs.unlink(chunkPath);
      } catch (err) {
        console.warn(`Failed to delete chunk file ${chunkPath}:`, err.message);
      }
    }

    console.log(`✅ Chunked rendering complete: ${images.length} images → ${outputPath}`);

    // Return a dummy command since we've already generated the file
    return ffmpeg().input(outputPath).output('/dev/null').outputOptions(['-f', 'null']);
  }

  /**
   * Render a single chunk of images with transitions
   */
  async renderChunk(options) {
    const {
      images,
      outputPath,
      videoWidth,
      videoHeight,
      duration,
      preset,
      quality,
      imageMode,
      transition
    } = options;

    const command = ffmpeg();

    // Add all image inputs
    images.forEach(img => command.input(img));

    const filters = await this.buildFilterComplex({
      images,
      videoWidth,
      videoHeight,
      duration,
      imageMode,
      transition,
      fps: 30
    });

    command.complexFilter(filters);

    command.outputOptions([
      '-map', '[final_video]',
      '-map', '[audio]', // buildFilterComplex creates [audio], not [final_audio]
      '-c:v', 'libx264',
      '-preset', 'ultrafast', // Fast encoding for mini-batches, re-encode in final pass
      '-crf', '18', // Higher quality for intermediate files (re-encoded later)
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-threads', '1', // Prevent threading-related "Resource temporarily unavailable"
      '-t', duration.toString()
    ])
    .output(outputPath);

    return new Promise((resolve, reject) => {
      let ffmpegStderr = [];

      command
        .on('start', (commandLine) => {
          console.log(`    ▶️  CHUNK RENDER COMMAND:`);
          console.log(`    ${commandLine}`);
        })
        .on('stderr', (stderrLine) => {
          // Capture all stderr for debugging
          ffmpegStderr.push(stderrLine);
          // Log important lines
          if (stderrLine.includes('error') || stderrLine.includes('Error') ||
              stderrLine.includes('failed') || stderrLine.includes('Invalid')) {
            console.error(`    🔴 FFmpeg: ${stderrLine}`);
          }
        })
        .on('end', () => {
          console.log(`    ✅ Chunk rendered: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`    ❌ CHUNK RENDER FAILED`);
          console.error(`    Error message: ${err.message}`);
          console.error(`    Exit code: ${err.code || 'unknown'}`);
          if (stdout) console.error(`    STDOUT: ${stdout}`);
          if (stderr) console.error(`    STDERR: ${stderr}`);
          console.error(`    Last 10 FFmpeg stderr lines:`);
          ffmpegStderr.slice(-10).forEach(line => console.error(`      ${line}`));
          reject(err);
        })
        .run();
    });
  }

  /**
   * Concatenate chunks with crossfade transitions between segments
   */
  async concatenateChunksWithTransitions(options) {
    const {
      chunkPaths,
      chunkDurations,
      chunks,
      outputPath,
      voiceOver,
      backgroundMusic,
      logo,
      reviewImage,
      logoSize,
      reviewCardSize,
      duration,
      videoWidth,
      videoHeight,
      preset,
      quality,
      transition
    } = options;

    const tempDir = path.dirname(outputPath);
    const transitionDuration = transition?.duration || 0.5;

    // If only one chunk, just add audio/overlays and return
    if (chunkPaths.length === 1) {
      return this.addAudioAndOverlays({
        inputPath: chunkPaths[0],
        outputPath,
        voiceOver,
        backgroundMusic,
        logo,
        reviewImage,
        logoSize,
        reviewCardSize,
        duration,
        videoWidth,
        videoHeight,
        preset,
        quality
      });
    }

    // Concatenate chunks with xfade transitions at overlap points
    console.log(`  🔗 Concatenating ${chunkPaths.length} chunks with xfade...`);

    // Verify all chunks exist before concat
    for (let i = 0; i < chunkPaths.length; i++) {
      try {
        const stats = await fs.stat(chunkPaths[i]);
        console.log(`    ✓ Chunk ${i} exists: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      } catch (err) {
        throw new Error(`Chunk ${i} missing: ${chunkPaths[i]} - ${err.message}`);
      }
    }

    // Use unique temp filename based on output file to prevent collisions between concurrent requests
    const outputBasename = path.basename(outputPath, path.extname(outputPath));
    const tempConcatenated = path.join(tempDir, `concatenated_${outputBasename}.mp4`);

    // Build xfade filter chain for seamless transitions between chunks
    // Each chunk overlaps by 1 image, so we apply xfade at the overlap point
    const filterParts = [];

    // Track actual output duration as we build the xfade chain
    let outputDuration = chunkDurations[0];

    console.log(`  📐 Starting concatenation: ${chunkPaths.length} chunks`);
    console.log(`  📊 Chunk 0: ${chunks[0].images.length} images, ${chunkDurations[0].toFixed(3)}s → output: ${outputDuration.toFixed(3)}s`);

    // Build xfade chain: [0:v][1:v]xfade[v1]; [v1][2:v]xfade[v2]; etc.
    for (let i = 1; i < chunkPaths.length; i++) {
      const inputLabel1 = i === 1 ? '[0:v]' : `[v${i-1}]`;
      const inputLabel2 = `[${i}:v]`;
      const outputLabel = `[v${i}]`;

      // Calculate overlap duration from PREVIOUS chunk (chunk i-1)
      // Overlap = duration of last image in previous chunk
      const prevChunk = chunks[i - 1];
      const overlapDuration = chunkDurations[i - 1] / prevChunk.images.length;

      // xfade offset should be at the overlapping image position
      // This is: end of current output - overlap duration - transition duration
      const offset = outputDuration - overlapDuration - transitionDuration;

      console.log(`  🔗 Chunk ${i-1}→${i}: ${prevChunk.images.length} images, overlap=${overlapDuration.toFixed(3)}s, offset=${offset.toFixed(3)}s`);

      filterParts.push(`${inputLabel1}${inputLabel2}xfade=transition=fade:duration=${transitionDuration}:offset=${offset}${outputLabel}`);

      // Update output duration for next iteration
      // xfade output = previous output + new chunk - transition duration
      outputDuration = outputDuration + chunkDurations[i] - transitionDuration;

      console.log(`  📊 Chunk ${i}: ${chunks[i].images.length} images, ${chunkDurations[i].toFixed(3)}s → cumulative output: ${outputDuration.toFixed(3)}s`);
    }

    const filterComplex = filterParts.join(';');
    const finalOutput = chunkPaths.length > 1 ? `[v${chunkPaths.length - 1}]` : '[0:v]';

    console.log(`  🔗 Building xfade chain for ${chunkPaths.length} chunks`);

    // Use xfade filter chain to concatenate with transitions
    await new Promise((resolve, reject) => {
      let ffmpegStderr = [];
      const command = ffmpeg();

      // Add all chunks as inputs
      chunkPaths.forEach(chunkPath => {
        command.input(chunkPath);
      });

      command
        .complexFilter([
          `${filterComplex};${finalOutput}null[final_video]`,
          '[0:a]anull[final_audio]' // Just pass through audio from first chunk
        ])
        .outputOptions([
          '-map', '[final_video]',
          '-map', '[final_audio]',
          '-c:v', 'libx264',
          '-preset', preset,
          '-crf', quality,
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-threads', '1'
        ])
        .output(tempConcatenated)
        .on('start', (commandLine) => {
          console.log(`  ▶️  XFADE CONCAT COMMAND:`);
          console.log(`  ${commandLine}`);
        })
        .on('stderr', (stderrLine) => {
          ffmpegStderr.push(stderrLine);
          if (stderrLine.includes('error') || stderrLine.includes('Error') ||
              stderrLine.includes('failed') || stderrLine.includes('Invalid')) {
            console.error(`  🔴 FFmpeg: ${stderrLine}`);
          }
        })
        .on('end', () => {
          console.log(`  ✅ Concatenated ${chunkPaths.length} segments with xfade successfully`);
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`  ❌ XFADE CONCATENATION FAILED`);
          console.error(`  Error message: ${err.message}`);
          console.error(`  Exit code: ${err.code || 'unknown'}`);
          if (stdout) console.error(`  STDOUT: ${stdout}`);
          if (stderr) console.error(`  STDERR: ${stderr}`);
          console.error(`  Last 10 FFmpeg stderr lines:`);
          ffmpegStderr.slice(-10).forEach(line => console.error(`    ${line}`));
          reject(err);
        })
        .run();
    });

    const currentPath = tempConcatenated;

    // Add audio and overlays to final concatenated video
    await this.addAudioAndOverlays({
      inputPath: currentPath,
      outputPath,
      voiceOver,
      backgroundMusic,
      logo,
      reviewImage,
      logoSize,
      reviewCardSize,
      duration,
      videoWidth,
      videoHeight,
      preset,
      quality
    });

    // Clean up final temp file
    if (currentPath !== chunkPaths[0]) {
      await fs.unlink(currentPath).catch(() => {});
    }
  }

  /**
   * Add audio and overlays to a rendered video
   */
  async addAudioAndOverlays(options) {
    const {
      inputPath,
      outputPath,
      voiceOver,
      backgroundMusic,
      logo,
      reviewImage,
      logoSize,
      reviewCardSize,
      duration,
      videoWidth,
      videoHeight,
      preset,
      quality
    } = options;

    const command = ffmpeg()
      .input(inputPath);

    const filters = [];
    let videoLabel = '0:v';
    let audioInputs = ['[0:a]'];  // Use brackets for filter graph syntax
    let inputIndex = 1;

    // Add voiceover
    if (voiceOver) {
      command.input(voiceOver);
      audioInputs.push(`[${inputIndex}:a]`);  // Use brackets for filter graph
      inputIndex++;
    }

    // Add background music (loop if necessary)
    if (backgroundMusic) {
      command.input(backgroundMusic).inputOptions(['-stream_loop', '-1']); // Loop music
      const musicDuration = await this.getAudioDuration(backgroundMusic);
      filters.push(`[${inputIndex}:a]afade=t=out:st=${duration - 1.5}:d=1.5,volume=0.15[music]`);
      audioInputs.push('[music]');
      inputIndex++;
    }

    // Mix audio
    if (audioInputs.length > 1) {
      filters.push(`${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=first[final_audio]`);
    } else {
      // Use anull (audio passthrough) instead of invalid 'acopy' filter
      filters.push(`${audioInputs[0]}anull[final_audio]`);
    }

    // Add logo overlay
    if (logo && logoSize) {
      command.input(logo);
      filters.push(`[${inputIndex}:v]scale=${logoSize.width}:${logoSize.height}[logo_scaled]`);
      filters.push(`[${videoLabel}][logo_scaled]overlay=${logoSize.x}:${logoSize.y}[with_logo]`);
      videoLabel = 'with_logo';
      inputIndex++;
    }

    // Add review card overlay
    if (reviewImage && reviewCardSize) {
      command.input(reviewImage);
      const reviewStart = 5;
      const reviewEnd = Math.min(20, duration * 0.3);
      filters.push(`[${inputIndex}:v]scale=${reviewCardSize.width}:${reviewCardSize.height}[review_scaled]`);
      filters.push(`[${videoLabel}][review_scaled]overlay=${reviewCardSize.x}:${reviewCardSize.y}:enable='between(t,${reviewStart},${reviewEnd})'[final_video]`);
      videoLabel = 'final_video';
    } else {
      // Use null (video passthrough) instead of invalid 'copy' filter
      filters.push(`[${videoLabel}]null[final_video]`);
    }

    console.log(`  🔍 Audio/Overlay filters: ${filters.join('; ')}`);

    if (filters.length > 0) {
      command.complexFilter(filters);
    }

    command.outputOptions([
      '-map', `[${videoLabel === 'final_video' ? videoLabel : 'final_video'}]`,
      '-map', '[final_audio]',
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', quality,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-threads', '1', // Prevent threading issues
      '-t', duration.toString()
    ])
    .output(outputPath);

    return new Promise((resolve, reject) => {
      command
        .on('start', (commandLine) => {
          console.log(`  ▶️  Audio/Overlay command: ${commandLine}`);
        })
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  /**
   * Build command using two-pass approach for many images (memory-efficient)
   * Pass 1: Convert each image to video segment
   * Pass 2: Concatenate segments (simpler than complex filter graph)
   */
  async buildCommandTwoPass(options) {
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
      imageMode = this.defaultImageMode
    } = options;

    console.log(`🔄 Using two-pass approach for ${images.length} images (memory-efficient)`);

    const segmentDuration = duration / images.length;
    const tempDir = path.dirname(outputPath);
    const segments = [];

    // Pass 1: Create video segment for each image
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const segmentPath = path.join(tempDir, `segment_${i}.mp4`);
      segments.push(segmentPath);

      // Get image dimensions for proper mode selection
      const imgDimensions = await this.getImageDimensions(img);

      // Build proper filter based on image mode
      let videoFilter;
      if (imageMode === this.IMAGE_MODES.CROP_FILL) {
        // Crop to fill - scale up and crop
        videoFilter = `scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight}`;
      } else if (imageMode === this.IMAGE_MODES.BLUR_BACKGROUND) {
        // Blur background mode - preserve full image with blurred background
        const blurStrength = 30;
        videoFilter = `split[bg][fg];[bg]scale=${videoWidth*1.2}:${videoHeight*1.2}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight},boxblur=${blurStrength}:${blurStrength}[blurred];[fg]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=decrease[img];[blurred][img]overlay=(W-w)/2:(H-h)/2`;
      } else {
        // Letterbox (default) - full image with bars
        const videoAspectRatio = videoWidth / videoHeight;
        const imageAspectRatio = imgDimensions.width / imgDimensions.height;
        const aspectRatioSimilarity = Math.abs(videoAspectRatio - imageAspectRatio) / videoAspectRatio;

        if (aspectRatioSimilarity < 0.15) {
          // Similar aspect ratios - fill frame
          videoFilter = `scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight}`;
        } else {
          // Different aspect ratios - letterbox with bars
          videoFilter = `scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${videoWidth}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black`;
        }
      }

      await new Promise((resolve, reject) => {
        ffmpeg(img)
          .inputOptions(['-loop', '1', '-t', segmentDuration.toString()])
          .outputOptions([
            '-vf', videoFilter,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',  // Fast encoding for segments
            '-pix_fmt', 'yuv420p',
            '-r', '30'
          ])
          .output(segmentPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    }

    // Pass 2: Concatenate segments with audio/overlays
    const concatListPath = path.join(tempDir, 'concat_list.txt');
    await fs.writeFile(concatListPath, segments.map(s => `file '${s}'`).join('\n'));

    const command = ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0']);

    // Add audio inputs
    if (voiceOver) {
      command.input(voiceOver);
    }
    if (backgroundMusic) {
      command.input(backgroundMusic);
    }

    // Add overlay inputs
    if (logo) {
      command.input(logo);
    }
    if (reviewImage) {
      command.input(reviewImage);
    }

    // Build simpler filter for overlays and audio
    const filters = [];
    let currentVideoLabel = '0:v'; // Input stream, not filter label
    let hasVideoFilters = false;
    let filterIndex = 0;

    // Add logo overlay if present
    if (logo && logoSize) {
      const logoInput = 1 + (voiceOver ? 1 : 0) + (backgroundMusic ? 1 : 0);
      filters.push(`[${currentVideoLabel}][${logoInput}:v]overlay=${logoSize.position.x}:${logoSize.position.y}[v${filterIndex}]`);
      currentVideoLabel = `v${filterIndex}`;
      hasVideoFilters = true;
      filterIndex++;
    }

    // Add review card if present
    if (reviewImage && reviewCardSize) {
      const reviewInput = 1 + (voiceOver ? 1 : 0) + (backgroundMusic ? 1 : 0) + (logo ? 1 : 0);
      filters.push(`[${currentVideoLabel}][${reviewInput}:v]overlay=${reviewCardSize.position.x}:${reviewCardSize.position.y}[v${filterIndex}]`);
      currentVideoLabel = `v${filterIndex}`;
      hasVideoFilters = true;
      filterIndex++;
    }

    // Audio mixing
    const audioInputs = [];
    if (voiceOver) audioInputs.push('[1:a]');
    if (backgroundMusic) {
      const musicIdx = 1 + (voiceOver ? 1 : 0);
      audioInputs.push(`[${musicIdx}:a]`);
    }

    if (audioInputs.length > 0) {
      filters.push(`${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=first[audio]`);
    } else {
      filters.push(`anullsrc=r=44100:cl=stereo[audio]`);
    }

    if (filters.length > 0) {
      command.complexFilter(filters);

      // Map video: use filter label if we applied filters, otherwise use input stream
      if (hasVideoFilters) {
        command.outputOptions(['-map', `[${currentVideoLabel}]`]);
      } else {
        command.outputOptions(['-map', currentVideoLabel]); // No brackets - it's an input stream
      }

      command.outputOptions(['-map', '[audio]']);
    }

    command.outputOptions([
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', quality,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-t', duration.toString()
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

    // Use 1:1 image mapping (no cycling)
    const numSegments = images.length;

    // CRITICAL: Account for xfade transition overlap
    // Each xfade transition overlaps by transition.duration, reducing total output
    // To hit target duration, we must compensate: adjustedDuration = target + (transitions × duration)
    const transitionDuration = transition.duration || 0.5;
    const transitionCount = Math.max(0, numSegments - 1);
    const totalTransitionTime = transitionCount * transitionDuration;
    const adjustedDuration = duration + totalTransitionTime;
    const actualImageDuration = adjustedDuration / numSegments;

    console.log(`  ⏱️  Duration compensation: ${numSegments} images, ${transitionCount} transitions × ${transitionDuration}s = ${totalTransitionTime}s overlap`);
    console.log(`  📊 Adjusted: ${duration}s target + ${totalTransitionTime}s = ${adjustedDuration}s total → ${actualImageDuration.toFixed(3)}s per image`);
    
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
      // Single image - no transitions needed, use null (passthrough)
      const inputLabel = imageInputs[0].replace(/[\[\]]/g, '');
      filters.push(`[${inputLabel}]null[base_video]`);
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