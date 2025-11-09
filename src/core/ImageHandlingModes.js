/**
 * Image Handling Modes for Different Aspect Ratios
 */

class ImageHandlingModes {
  constructor() {
    this.modes = {
      CROP_FILL: 'crop_fill',        // Current approach - crop to fill frame
      LETTERBOX: 'letterbox',        // Full image with color bars
      BLUR_BACKGROUND: 'blur_bg',    // Full image with blurred background
      SMART_CROP: 'smart_crop'       // AI-assisted crop (future)
    };
  }

  /**
   * Build FFmpeg filter for letterbox mode with smart scaling
   * @param {Object} params - Filter parameters
   * @returns {string} FFmpeg filter string
   */
  buildLetterboxFilter(params) {
    const { 
      inputIndex, 
      videoWidth, 
      videoHeight, 
      imageWidth,
      imageHeight,
      backgroundColor = '#2a2a2a'
    } = params;
    
    // Calculate aspect ratios
    const videoAspectRatio = videoWidth / videoHeight;
    const imageAspectRatio = imageWidth / imageHeight;
    
    // Determine orientations
    const videoIsVertical = videoAspectRatio < 1;
    const imageIsVertical = imageAspectRatio < 1;
    
    // Check if orientations match and aspect ratios are similar
    const orientationsMatch = videoIsVertical === imageIsVertical;
    const aspectRatioSimilarity = Math.abs(videoAspectRatio - imageAspectRatio) / videoAspectRatio;
    const aspectRatiosAreSimilar = aspectRatioSimilarity < 0.15; // Within 15% difference
    
    if (orientationsMatch && aspectRatiosAreSimilar) {
      // Fill the frame when orientations match and aspect ratios are similar
      return [
        `[${inputIndex}:v]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight}[letterboxed]`
      ].join(';');
    } else {
      // Use letterbox with bars when needed
      return [
        `color=c=${backgroundColor}:s=${videoWidth}x${videoHeight}[bg${inputIndex}]`,
        `[${inputIndex}:v]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=decrease[img${inputIndex}]`,
        `[bg${inputIndex}][img${inputIndex}]overlay=(W-w)/2:(H-h)/2[letterboxed]`
      ].join(';');
    }
  }

  /**
   * Build FFmpeg filter for blur background mode
   * @param {Object} params - Filter parameters
   * @returns {string} FFmpeg filter string
   */
  buildBlurBackgroundFilter(params) {
    const {
      inputIndex,
      videoWidth,
      videoHeight,
      blurStrength = 30
    } = params;
    
    // Static blur background only - preserve aspect ratio, show full image
    return [
      `[${inputIndex}:v]scale=${videoWidth*1.2}:${videoHeight*1.2}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight},boxblur=${blurStrength}:${blurStrength}[blurred_bg${inputIndex}]`,
      `[${inputIndex}:v]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=decrease[img${inputIndex}]`,
      `[blurred_bg${inputIndex}][img${inputIndex}]overlay=(W-w)/2:(H-h)/2[composed]`
    ].join(';');
  }

  /**
   * Build FFmpeg filter for crop fill mode (current approach)
   * @param {Object} params - Filter parameters
   * @returns {string} FFmpeg filter string
   */
  buildCropFillFilter(params) {
    const {
      inputIndex,
      videoWidth,
      videoHeight,
      scale = 1 // No scaling needed without Ken Burns
    } = params;
    
    const scaledWidth = Math.round(videoWidth * scale);
    const scaledHeight = Math.round(videoHeight * scale);
    
    // Center the crop instead of using top-left
    return `[${inputIndex}:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,crop=${scaledWidth}:${scaledHeight}:(iw-ow)/2:(ih-oh)/2,setsar=1`;
  }

  /**
   * Detect best mode based on aspect ratio mismatch
   * @param {number} imageAspect - Image aspect ratio
   * @param {number} videoAspect - Video aspect ratio
   * @returns {string} Recommended mode
   */
  recommendMode(imageAspect, videoAspect) {
    const mismatchRatio = Math.abs(imageAspect - videoAspect) / videoAspect;
    
    if (mismatchRatio < 0.2) {
      // Similar aspect ratios - crop is fine
      return this.modes.CROP_FILL;
    } else if (mismatchRatio < 0.5) {
      // Moderate mismatch - blur background works well
      return this.modes.BLUR_BACKGROUND;
    } else {
      // Severe mismatch - letterbox to preserve content
      return this.modes.LETTERBOX;
    }
  }

  /**
   * Extract dominant color from image for background
   * @param {string} imagePath - Path to image
   * @returns {Promise<string>} Hex color
   */
  async extractDominantColor(imagePath) {
    // Simple implementation - could be enhanced with proper color extraction
    // For now, return a complementary dark color
    return '#1a1a1a';
  }
}

export default ImageHandlingModes;