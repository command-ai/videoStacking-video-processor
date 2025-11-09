/**
 * Mathematical Sizing Engine for Video Elements
 * Based on design-math principles: Golden Ratio, 25% Rule, Visual Weight
 */

class MathematicalSizing {
  constructor() {
    // Mathematical constants
    this.PHI = 1.618033988749895; // Golden ratio
    this.PHI_INVERSE = 0.618033988749895; // 1/φ
    
    // Design constraints from design-math documentation
    this.MAX_LOGO_HEIGHT_RATIO = 0.25; // Logo should not exceed 25% of container height
    this.CONTENT_TO_WHITESPACE_RATIO = 0.4; // 40% content, 60% whitespace
    this.MIN_CLEAR_SPACE_RATIO = 0.05; // 5% minimum clear space around elements
    
    // Platform-specific overrides (validated through testing)
    this.PLATFORM_CONFIGS = {
      'youtube': {
        aspectRatio: 16/9,
        logoHeightPercent: 0.0833, // 8.33% of height (90px on 1080p)
        reference: 'height',
        minSize: 80,
        maxSize: 200
      },
      'instagram_reel': {
        aspectRatio: 9/16,
        logoHeightPercent: 0.10, // 10% of width (108px on 1080 width)
        reference: 'width',
        minSize: 100,
        maxSize: 200
      },
      'tiktok': {
        aspectRatio: 9/16,
        logoHeightPercent: 0.10, // 10% of width
        reference: 'width',
        minSize: 100,
        maxSize: 200
      },
      'instagram_feed': {
        aspectRatio: 1/1,
        logoHeightPercent: 0.125, // 12.5% of width (135px on 1080p)
        reference: 'width',
        minSize: 100,
        maxSize: 250
      },
      'facebook': {
        aspectRatio: 16/9,
        logoHeightPercent: 0.0833,
        reference: 'height',
        minSize: 80,
        maxSize: 200
      },
      'linkedin': {
        aspectRatio: 16/9,
        logoHeightPercent: 0.0625, // 6.25% of height (smaller for professional context)
        reference: 'height',
        minSize: 70,
        maxSize: 180,
        maxWidthPercent: 0.25 // Cap at 25% of video width for wide logos
      },
      'youtube_shorts': {
        aspectRatio: 9/16,
        logoHeightPercent: 0.10,
        reference: 'width',
        minSize: 100,
        maxSize: 200
      },
      'facebook_reels': {
        aspectRatio: 9/16,
        logoHeightPercent: 0.10,
        reference: 'width',
        minSize: 100,
        maxSize: 200
      },
      'instagram': {
        aspectRatio: 9/16,
        logoHeightPercent: 0.10,
        reference: 'width',
        minSize: 100,
        maxSize: 200
      }
    };
  }

  /**
   * Calculate logo size using mathematical principles
   * @param {string} platform - Platform identifier
   * @param {number} videoWidth - Video width in pixels
   * @param {number} videoHeight - Video height in pixels
   * @param {number} originalLogoWidth - Original logo width
   * @param {number} originalLogoHeight - Original logo height
   * @returns {Object} Calculated dimensions and position
   */
  calculateLogoSize(platform, videoWidth, videoHeight, originalLogoWidth, originalLogoHeight) {
    const config = this.PLATFORM_CONFIGS[platform] || this.PLATFORM_CONFIGS['youtube'];
    
    // Step 1: Determine reference dimension based on aspect ratio
    const aspectRatio = videoWidth / videoHeight;
    let referenceDimension;
    
    if (config.reference === 'width' || aspectRatio < 0.7) {
      // Vertical videos use width as reference
      referenceDimension = videoWidth;
    } else {
      // Horizontal videos use height as reference
      referenceDimension = videoHeight;
    }
    
    // Step 2: Calculate target size using platform percentage
    const targetSize = referenceDimension * config.logoHeightPercent;
    
    // Step 3: Apply golden ratio for proportional scaling
    const logoAspectRatio = originalLogoWidth / originalLogoHeight;
    let scaledHeight, scaledWidth;
    
    if (logoAspectRatio > 1) {
      // Landscape logo
      scaledHeight = targetSize;
      scaledWidth = targetSize * logoAspectRatio;

      // Check if width exceeds golden ratio proportion
      let maxWidth = videoWidth * this.PHI_INVERSE * 0.5; // Half of golden section

      // Apply platform-specific max width percentage if defined (more restrictive)
      if (config.maxWidthPercent && (videoWidth * config.maxWidthPercent) < maxWidth) {
        maxWidth = videoWidth * config.maxWidthPercent;
      }

      if (scaledWidth > maxWidth) {
        scaledWidth = maxWidth;
        scaledHeight = scaledWidth / logoAspectRatio;
      }
    } else {
      // Portrait or square logo
      scaledHeight = targetSize;
      scaledWidth = targetSize * logoAspectRatio;
    }
    
    // Step 4: Apply min/max constraints
    const scale = Math.min(
      scaledHeight / originalLogoHeight,
      config.maxSize / originalLogoHeight,
      config.maxSize / originalLogoWidth * logoAspectRatio
    );
    
    const finalHeight = Math.max(
      Math.min(originalLogoHeight * scale, config.maxSize),
      config.minSize
    );
    const finalWidth = finalHeight * logoAspectRatio;
    
    // Step 5: Calculate position using golden ratio points
    const position = this.calculateGoldenPosition(
      videoWidth, 
      videoHeight, 
      finalWidth, 
      finalHeight,
      'bottom-right' // Default position
    );
    
    return {
      width: Math.round(finalWidth),
      height: Math.round(finalHeight),
      x: Math.round(position.x),
      y: Math.round(position.y),
      scale: scale,
      reference: config.reference,
      targetPercentage: config.logoHeightPercent * 100
    };
  }

  /**
   * Calculate position using golden ratio points
   * @param {number} containerWidth - Container width
   * @param {number} containerHeight - Container height
   * @param {number} elementWidth - Element width
   * @param {number} elementHeight - Element height
   * @param {string} position - Position descriptor
   * @returns {Object} x, y coordinates
   */
  calculateGoldenPosition(containerWidth, containerHeight, elementWidth, elementHeight, position) {
    // Calculate margins using golden ratio
    const marginX = containerWidth * this.MIN_CLEAR_SPACE_RATIO;
    const marginY = containerHeight * this.MIN_CLEAR_SPACE_RATIO;
    
    // Golden ratio divisions
    const goldenX = containerWidth * this.PHI_INVERSE;
    const goldenY = containerHeight * this.PHI_INVERSE;
    
    const positions = {
      'top-left': { 
        x: marginX, 
        y: marginY 
      },
      'top-center': { 
        x: (containerWidth - elementWidth) / 2, 
        y: marginY 
      },
      'top-right': { 
        x: containerWidth - elementWidth - marginX, 
        y: marginY 
      },
      'center': { 
        x: (containerWidth - elementWidth) / 2, 
        y: (containerHeight - elementHeight) / 2 
      },
      'bottom-left': { 
        x: marginX, 
        y: containerHeight - elementHeight - marginY 
      },
      'bottom-center': { 
        x: (containerWidth - elementWidth) / 2, 
        y: containerHeight - elementHeight - marginY 
      },
      'bottom-right': { 
        x: containerWidth - elementWidth - marginX, 
        y: containerHeight - elementHeight - marginY 
      },
      'golden-top-left': { 
        x: goldenX - elementWidth / 2, 
        y: marginY 
      },
      'golden-bottom-right': { 
        x: containerWidth - goldenX - elementWidth / 2, 
        y: containerHeight - goldenY - elementHeight / 2 
      }
    };
    
    return positions[position] || positions['bottom-right'];
  }

  /**
   * Calculate adaptive size for graphics preserving aspect ratio
   * @param {string} platform - Platform identifier
   * @param {number} videoWidth - Video width
   * @param {number} videoHeight - Video height
   * @param {number} originalWidth - Original graphic width
   * @param {number} originalHeight - Original graphic height
   * @param {Object} options - Additional options
   * @returns {Object} Calculated dimensions and position
   */
  calculateAdaptiveGraphicSize(platform, videoWidth, videoHeight, originalWidth, originalHeight, options = {}) {
    const aspectRatio = videoWidth / videoHeight;
    const graphicAspectRatio = originalWidth / originalHeight;
    
    // Define maximum coverage based on golden ratio
    const maxCoverageRatio = options.maxCoverage || 0.45; // 45% max coverage
    const minCoverageRatio = options.minCoverage || 0.25; // 25% min coverage
    
    // Calculate available space with golden ratio margins
    const margin = videoWidth * this.MIN_CLEAR_SPACE_RATIO; // 5% margins
    const availableWidth = Math.min(videoWidth * maxCoverageRatio, videoWidth - (2 * margin));
    const availableHeight = videoHeight * maxCoverageRatio;
    
    let targetWidth, targetHeight;
    
    // Fit within available space while preserving aspect ratio
    if (graphicAspectRatio > (availableWidth / availableHeight)) {
      // Graphic is wider than available space ratio
      targetWidth = availableWidth;
      targetHeight = targetWidth / graphicAspectRatio;
    } else {
      // Graphic is taller than available space ratio
      targetHeight = availableHeight;
      targetWidth = targetHeight * graphicAspectRatio;
    }
    
    // Ensure the graphic never exceeds video dimensions
    if (targetWidth > videoWidth - (2 * margin)) {
      targetWidth = videoWidth - (2 * margin);
      targetHeight = targetWidth / graphicAspectRatio;
    }
    
    // Ensure minimum size for visibility but respect viewport bounds
    const maxAllowedWidth = videoWidth - (2 * margin);
    const minWidth = Math.min(videoWidth * minCoverageRatio, maxAllowedWidth);
    const minHeight = videoHeight * minCoverageRatio;
    
    if (targetWidth < minWidth || targetHeight < minHeight) {
      const scaleFactorW = minWidth / targetWidth;
      const scaleFactorH = minHeight / targetHeight;
      const scaleFactor = Math.max(scaleFactorW, scaleFactorH);
      
      targetWidth *= scaleFactor;
      targetHeight *= scaleFactor;
      
      // If scaling made it too wide, constrain to viewport
      if (targetWidth > maxAllowedWidth) {
        targetWidth = maxAllowedWidth;
        targetHeight = targetWidth / graphicAspectRatio;
      }
    }
    
    // Round to even numbers for video encoding
    targetWidth = Math.round(targetWidth / 2) * 2;
    targetHeight = Math.round(targetHeight / 2) * 2;
    
    // Calculate position using golden ratio
    const position = this.calculateGoldenPosition(
      videoWidth, 
      videoHeight, 
      targetWidth, 
      targetHeight, 
      options.position || 'center'
    );
    
    return {
      width: targetWidth,
      height: targetHeight,
      x: position.x,
      y: position.y,
      scale: targetWidth / originalWidth,
      aspectRatioPreserved: true,
      coverage: (targetWidth * targetHeight) / (videoWidth * videoHeight)
    };
  }

  /**
   * Calculate text size based on viewing distance and container
   * @param {string} textType - 'title', 'subtitle', 'body'
   * @param {number} containerHeight - Container height in pixels
   * @param {string} platform - Platform identifier
   * @returns {number} Font size in pixels
   */
  calculateTextSize(textType, containerHeight, platform) {
    // Base ratios from design-math typography scale
    const textRatios = {
      'title': 0.05,      // 5% of height
      'subtitle': 0.03,   // 3% of height
      'body': 0.025,      // 2.5% of height
      'caption': 0.02     // 2% of height
    };
    
    const ratio = textRatios[textType] || textRatios['body'];
    let fontSize = containerHeight * ratio;
    
    // Platform-specific adjustments for readability
    if (platform === 'tiktok' || platform === 'instagram_reel') {
      // Vertical videos need slightly larger text
      fontSize *= 1.2;
    }
    
    // Apply min/max constraints
    const constraints = {
      'title': { min: 36, max: 72 },
      'subtitle': { min: 24, max: 48 },
      'body': { min: 18, max: 36 },
      'caption': { min: 14, max: 24 }
    };
    
    const { min, max } = constraints[textType] || constraints['body'];
    return Math.round(Math.max(min, Math.min(fontSize, max)));
  }

  /**
   * Calculate review card dimensions using golden ratio
   * @param {string} platform - Platform identifier
   * @param {number} videoWidth - Video width
   * @param {number} videoHeight - Video height
   * @returns {Object} Review card dimensions
   */
  calculateReviewCardSize(platform, videoWidth, videoHeight) {
    const aspectRatio = videoWidth / videoHeight;
    let cardWidth, cardHeight;
    
    if (aspectRatio < 0.7) {
      // Vertical (9:16)
      cardWidth = videoWidth * 0.9; // 90% of width
      cardHeight = cardWidth * this.PHI_INVERSE; // Golden ratio height
    } else if (aspectRatio > 1.5) {
      // Horizontal (16:9)
      cardWidth = videoWidth * 0.45; // 45% of width
      cardHeight = cardWidth * this.PHI_INVERSE;
    } else {
      // Square (1:1)
      cardWidth = videoWidth * 0.7; // 70% of width
      cardHeight = cardWidth * this.PHI_INVERSE;
    }
    
    // Ensure card doesn't exceed height constraints
    const maxHeight = videoHeight * 0.6; // 60% max height
    if (cardHeight > maxHeight) {
      cardHeight = maxHeight;
      cardWidth = cardHeight / this.PHI_INVERSE;
    }
    
    // Center the card
    const x = (videoWidth - cardWidth) / 2;
    const y = (videoHeight - cardHeight) / 2;
    
    return {
      width: Math.round(cardWidth),
      height: Math.round(cardHeight),
      x: Math.round(x),
      y: Math.round(y),
      padding: Math.round(cardWidth * 0.05) // 5% padding
    };
  }

  /**
   * Calculate safe zones for text and important elements
   * @param {number} width - Video width
   * @param {number} height - Video height
   * @param {string} platform - Platform identifier
   * @returns {Object} Safe zone boundaries
   */
  calculateSafeZones(width, height, platform) {
    // Different platforms have different safe zones
    const safeZoneRatios = {
      'youtube': 0.05,        // 5% margins
      'tiktok': 0.1,          // 10% margins (UI elements)
      'instagram_reel': 0.12, // 12% margins (UI heavy)
      'instagram_feed': 0.05, // 5% margins
      'facebook': 0.05        // 5% margins
    };
    
    const ratio = safeZoneRatios[platform] || 0.05;
    const marginX = width * ratio;
    const marginY = height * ratio;
    
    return {
      left: marginX,
      top: marginY,
      right: width - marginX,
      bottom: height - marginY,
      width: width - (2 * marginX),
      height: height - (2 * marginY),
      centerX: width / 2,
      centerY: height / 2
    };
  }

  /**
   * Get all element sizes for a platform
   * @param {string} platform - Platform identifier
   * @param {number} videoWidth - Video width
   * @param {number} videoHeight - Video height
   * @param {Object} assets - Original asset dimensions
   * @returns {Object} All calculated sizes
   */
  calculateAllSizes(platform, videoWidth, videoHeight, assets = {}, options = {}) {
    const result = {
      video: { width: videoWidth, height: videoHeight },
      platform: platform,
      aspectRatio: videoWidth / videoHeight
    };
    
    // Logo sizing
    if (assets.logo) {
      result.logo = this.calculateLogoSize(
        platform, 
        videoWidth, 
        videoHeight,
        assets.logo.width,
        assets.logo.height
      );
    }
    
    // Text sizes
    result.text = {
      title: this.calculateTextSize('title', videoHeight, platform),
      subtitle: this.calculateTextSize('subtitle', videoHeight, platform),
      body: this.calculateTextSize('body', videoHeight, platform),
      caption: this.calculateTextSize('caption', videoHeight, platform)
    };
    
    // Review card
    if (assets.reviewCard && assets.reviewCard.width && assets.reviewCard.height && options.adaptiveGraphics !== false) {
      // Use adaptive sizing if dimensions are provided and adaptive is enabled
      result.reviewCard = this.calculateAdaptiveGraphicSize(
        platform,
        videoWidth,
        videoHeight,
        assets.reviewCard.width,
        assets.reviewCard.height,
        {
          maxCoverage: 0.45,
          minCoverage: 0.25,
          position: 'center'
        }
      );
    } else {
      // Fall back to default sizing (forced golden ratio)
      result.reviewCard = this.calculateReviewCardSize(platform, videoWidth, videoHeight);
    }
    
    // Safe zones
    result.safeZones = this.calculateSafeZones(videoWidth, videoHeight, platform);
    
    return result;
  }
}

export default MathematicalSizing;