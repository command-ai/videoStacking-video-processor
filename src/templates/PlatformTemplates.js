/**
 * Platform-Specific Video Templates
 * Each template uses mathematical sizing for perfect element placement
 */

import MathematicalSizing from '../core/MathematicalSizing.js';

class PlatformTemplates {
  constructor() {
    this.sizing = new MathematicalSizing();
    
    // Define base templates for each platform
    this.templates = {
      youtube: this.createYouTubeTemplate(),
      youtube_shorts: this.createYouTubeShortsTemplate(),
      instagram_reel: this.createInstagramReelTemplate(),
      instagram_feed: this.createInstagramFeedTemplate(),
      instagram_portrait: this.createInstagramPortraitTemplate(),
      instagram: this.createInstagramFeedTemplate(), // Default Instagram to feed
      tiktok: this.createTikTokTemplate(),
      facebook: this.createFacebookTemplate(),
      facebook_reels: this.createFacebookReelsTemplate(),
      linkedin: this.createLinkedInTemplate(),
      twitter_landscape: this.createTwitterLandscapeTemplate(),
      twitter_portrait: this.createTwitterPortraitTemplate(),
      twitter_square: this.createTwitterSquareTemplate()
    };
  }

  /**
   * YouTube Template - 16:9 Landscape
   */
  createYouTubeTemplate() {
    return {
      name: 'YouTube Standard',
      platform: 'youtube',
      aspectRatio: '16:9',
      resolution: {
        width: 1920,
        height: 1080
      },
      fps: 30,
      duration: {
        min: 15,
        max: 43200, // 12 hours for verified accounts
        default: 35
      },
      scenes: [
        {
          type: 'intro',
          duration: 3,
          elements: [
            {
              type: 'background',
              effect: 'ken_burns',
              intensity: 0.15
            },
            {
              type: 'logo',
              position: 'bottom-right',
              fadeIn: 0.5,
              persist: true
            },
            {
              type: 'text',
              style: 'title',
              position: 'center',
              animation: 'fade_up',
              duration: 2.5
            }
          ]
        },
        {
          type: 'showcase',
          duration: 29,
          elements: [
            {
              type: 'image_sequence',
              transition: 'cross_fade',
              imageDuration: 4.8, // Adjusted for 29-second showcase
              kenBurns: {
                enabled: true,
                scale: 1.2,
                duration: 4.8
              }
            },
            {
              type: 'logo',
              persist: true
            }
          ]
        },
        {
          type: 'outro',
          duration: 3,
          elements: [
            {
              type: 'review_card',
              position: 'center',
              animation: 'scale_in'
            },
            {
              type: 'text',
              style: 'subtitle',
              content: 'Call Now: (555) 123-4567',
              position: 'bottom-center',
              offset: { y: -150 }
            }
          ]
        }
      ],
      audio: {
        voiceOver: {
          enabled: true,
          delay: 1.5,
          volume: 1.0
        },
        backgroundMusic: {
          enabled: true,
          volume: 0.15,
          fadeIn: 1.5,
          fadeOut: 1.5
        }
      },
      transitions: {
        default: 'cross_fade',
        duration: 0.5
      }
    };
  }

  /**
   * YouTube Shorts Template - 9:16 Vertical (Max 60 seconds)
   */
  createYouTubeShortsTemplate() {
    return {
      name: 'YouTube Shorts',
      platform: 'youtube_shorts',
      aspectRatio: '9:16',
      resolution: {
        width: 1080,
        height: 1920
      },
      fps: 30,
      duration: {
        min: 5,
        max: 60, // YouTube Shorts strict 60 second limit
        default: 30
      },
      scenes: [
        {
          type: 'hook',
          duration: 2,
          elements: [
            {
              type: 'background',
              effect: 'zoom_in',
              intensity: 0.2
            },
            {
              type: 'text',
              style: 'bold_title',
              position: 'center',
              animation: 'pop_in',
              duration: 1.5
            },
            {
              type: 'logo',
              position: 'top-left',
              offset: { x: 20, y: 20 },
              scale: 0.8
            }
          ]
        },
        {
          type: 'showcase',
          duration: 25, // Adjusted for 60 second limit
          elements: [
            {
              type: 'image_sequence',
              transition: 'quick_fade',
              imageDuration: 3, // Faster pace for Shorts
              kenBurns: {
                enabled: true,
                scale: 1.15,
                duration: 3
              }
            },
            {
              type: 'logo',
              persist: true
            }
          ]
        },
        {
          type: 'cta',
          duration: 3,
          elements: [
            {
              type: 'fullscreen_text',
              style: 'title',
              content: 'SUBSCRIBE FOR MORE',
              position: 'center',
              animation: 'slide_up'
            },
            {
              type: 'logo',
              position: 'bottom-center',
              offset: { y: -100 }
            }
          ]
        }
      ],
      audio: {
        voiceOver: {
          enabled: true,
          delay: 0.5,
          volume: 1.0
        },
        backgroundMusic: {
          enabled: true,
          volume: 0.2, // Slightly louder for mobile viewing
          fadeIn: 0.5,
          fadeOut: 0.5,
          style: 'upbeat'
        }
      },
      transitions: {
        default: 'quick_cut',
        duration: 0.2 // Fast transitions for Shorts
      },
      captions: {
        enabled: true, // Essential for Shorts
        style: 'bold_center',
        fontSize: 'large'
      }
    };
  }

  /**
   * Instagram Reel Template - 9:16 Vertical
   */
  createInstagramReelTemplate() {
    return {
      name: 'Instagram Reel',
      platform: 'instagram_reel',
      aspectRatio: '9:16',
      resolution: {
        width: 1080,
        height: 1920
      },
      fps: 30,
      duration: {
        min: 15,
        max: 90,
        default: 30
      },
      scenes: [
        {
          type: 'hook',
          duration: 2,
          elements: [
            {
              type: 'background',
              effect: 'zoom_in',
              intensity: 0.2
            },
            {
              type: 'text',
              style: 'title',
              position: 'top-center',
              offset: { y: 200 }, // Account for UI elements
              animation: 'slide_down',
              duration: 1.5
            },
            {
              type: 'logo',
              position: 'top-center',
              offset: { y: 100 },
              scale: 0.8 // Slightly smaller for vertical
            }
          ]
        },
        {
          type: 'showcase',
          duration: 25,
          elements: [
            {
              type: 'image_sequence',
              transition: 'vertical_slide',
              imageDuration: 3.5,
              kenBurns: {
                enabled: true,
                scale: 1.15,
                duration: 3.5
              }
            },
            {
              type: 'logo',
              position: 'top-center',
              persist: true,
              opacity: 0.9
            }
          ]
        },
        {
          type: 'cta',
          duration: 3,
          elements: [
            {
              type: 'review_card',
              position: 'center',
              animation: 'slide_up',
              style: 'vertical' // Special vertical layout
            },
            {
              type: 'text',
              style: 'caption',
              content: 'Link in bio',
              position: 'bottom-center',
              offset: { y: -200 } // Above UI elements
            }
          ]
        }
      ],
      audio: {
        voiceOver: {
          enabled: true,
          delay: 1.0,
          volume: 1.0
        },
        backgroundMusic: {
          enabled: true,
          volume: 0.2, // Slightly louder for mobile
          fadeIn: 1.0,
          fadeOut: 1.0
        }
      },
      transitions: {
        default: 'vertical_slide',
        duration: 0.3 // Faster for mobile
      }
    };
  }

  /**
   * Instagram Feed Template - 1:1 Square
   */
  createInstagramFeedTemplate() {
    return {
      name: 'Instagram Feed',
      platform: 'instagram_feed',
      aspectRatio: '1:1',
      resolution: {
        width: 1080,
        height: 1080
      },
      fps: 30,
      duration: {
        min: 3,
        max: 60,
        default: 15
      },
      scenes: [
        {
          type: 'intro',
          duration: 2,
          elements: [
            {
              type: 'background',
              effect: 'subtle_zoom',
              intensity: 0.1
            },
            {
              type: 'logo',
              position: 'bottom-right',
              fadeIn: 0.3
            },
            {
              type: 'text',
              style: 'title',
              position: 'center',
              animation: 'fade',
              maxWidth: '80%' // Keep text centered in square
            }
          ]
        },
        {
          type: 'showcase',
          duration: 11,
          elements: [
            {
              type: 'image_grid',
              layout: '2x2', // 4 images at once
              transition: 'fade',
              duration: 2.75
            },
            {
              type: 'logo',
              persist: true
            }
          ]
        },
        {
          type: 'outro',
          duration: 2,
          elements: [
            {
              type: 'review_card',
              position: 'center',
              style: 'square',
              scale: 0.8
            }
          ]
        }
      ],
      audio: {
        voiceOver: {
          enabled: true,
          delay: 0.5,
          volume: 1.0
        },
        backgroundMusic: {
          enabled: true,
          volume: 0.15,
          fadeIn: 0.5,
          fadeOut: 0.5
        }
      },
      transitions: {
        default: 'fade',
        duration: 0.3
      }
    };
  }

  /**
   * TikTok Template - 9:16 Vertical
   */
  createTikTokTemplate() {
    return {
      name: 'TikTok',
      platform: 'tiktok',
      aspectRatio: '9:16',
      resolution: {
        width: 1080,
        height: 1920
      },
      fps: 30,
      duration: {
        min: 5,
        max: 600, // TikTok now allows up to 10 minutes
        default: 30
      },
      scenes: [
        {
          type: 'hook',
          duration: 1.5,
          elements: [
            {
              type: 'background',
              effect: 'quick_zoom',
              intensity: 0.25
            },
            {
              type: 'text',
              style: 'title',
              content: 'BEFORE & AFTER',
              position: 'center',
              animation: 'pop_in',
              duration: 1.0
            }
          ]
        },
        {
          type: 'before_after',
          duration: 26,
          elements: [
            {
              type: 'split_screen',
              orientation: 'horizontal',
              transition: 'wipe',
              imageDuration: 3
            },
            {
              type: 'logo',
              position: 'top-center',
              offset: { y: 60 },
              persist: true
            },
            {
              type: 'text',
              style: 'caption',
              labels: ['BEFORE', 'AFTER'],
              position: 'split_labels'
            }
          ]
        },
        {
          type: 'cta',
          duration: 2.5,
          elements: [
            {
              type: 'fullscreen_text',
              style: 'title',
              content: 'SWIPE UP',
              position: 'center',
              animation: 'pulse'
            },
            {
              type: 'logo',
              position: 'bottom-center',
              offset: { y: -100 }
            }
          ]
        }
      ],
      audio: {
        voiceOver: {
          enabled: true,
          delay: 0.5,
          volume: 1.0
        },
        backgroundMusic: {
          enabled: true,
          volume: 0.25, // Louder for TikTok
          fadeIn: 0.5,
          fadeOut: 0.5,
          style: 'upbeat' // More energetic
        }
      },
      transitions: {
        default: 'quick_cut',
        duration: 0.15 // Very fast for TikTok
      }
    };
  }

  /**
   * Facebook Template - 16:9 Landscape
   */
  createFacebookTemplate() {
    return {
      name: 'Facebook',
      platform: 'facebook',
      aspectRatio: '16:9',
      resolution: {
        width: 1920,
        height: 1080
      },
      fps: 30,
      duration: {
        min: 15,
        max: 14400, // Facebook allows up to 240 minutes (4 hours)
        default: 60
      },
      scenes: [
        {
          type: 'intro',
          duration: 3,
          elements: [
            {
              type: 'background',
              effect: 'parallax',
              intensity: 0.15
            },
            {
              type: 'logo',
              position: 'bottom-right',
              fadeIn: 0.5
            },
            {
              type: 'text',
              style: 'title',
              position: 'center-left',
              offset: { x: 100 },
              animation: 'slide_right'
            }
          ]
        },
        {
          type: 'showcase',
          duration: 24,
          elements: [
            {
              type: 'image_sequence',
              transition: 'smooth_slide',
              imageDuration: 4,
              kenBurns: {
                enabled: true,
                scale: 1.15,
                duration: 4
              }
            },
            {
              type: 'logo',
              persist: true
            },
            {
              type: 'progress_bar',
              position: 'bottom',
              height: 4,
              color: '#1877f2' // Facebook blue
            }
          ]
        },
        {
          type: 'outro',
          duration: 3,
          elements: [
            {
              type: 'review_card',
              position: 'center',
              animation: 'fade_scale'
            },
            {
              type: 'social_icons',
              position: 'bottom-center',
              offset: { y: -100 }
            }
          ]
        }
      ],
      audio: {
        voiceOver: {
          enabled: true,
          delay: 1.5,
          volume: 1.0
        },
        backgroundMusic: {
          enabled: true,
          volume: 0.12, // Quieter for Facebook
          fadeIn: 1.5,
          fadeOut: 1.5
        }
      },
      transitions: {
        default: 'smooth_fade',
        duration: 0.5
      },
      captions: {
        enabled: true, // Facebook auto-plays muted
        style: 'bottom_bar',
        fontSize: 'auto'
      }
    };
  }

  /**
   * Facebook Reels Template - 9:16 Vertical (Max 90 seconds)
   */
  createFacebookReelsTemplate() {
    return {
      name: 'Facebook Reels',
      platform: 'facebook_reels',
      aspectRatio: '9:16',
      resolution: {
        width: 1080,
        height: 1920
      },
      fps: 30,
      duration: {
        min: 5,
        max: 90, // Facebook Reels max 90 seconds
        default: 30
      },
      scenes: [
        {
          type: 'hook',
          duration: 2,
          elements: [
            {
              type: 'background',
              effect: 'smooth_zoom',
              intensity: 0.15
            },
            {
              type: 'text',
              style: 'title',
              position: 'center',
              animation: 'fade_up',
              duration: 1.5
            },
            {
              type: 'logo',
              position: 'top-right',
              offset: { x: -20, y: 20 },
              fadeIn: 0.5
            }
          ]
        },
        {
          type: 'showcase',
          duration: 25,
          elements: [
            {
              type: 'image_sequence',
              transition: 'smooth_fade',
              imageDuration: 3.5,
              kenBurns: {
                enabled: true,
                scale: 1.15,
                duration: 3.5
              }
            },
            {
              type: 'logo',
              persist: true
            }
          ]
        },
        {
          type: 'cta',
          duration: 3,
          elements: [
            {
              type: 'review_card',
              position: 'center',
              animation: 'scale_in'
            },
            {
              type: 'text',
              style: 'subtitle',
              content: 'Follow for more!',
              position: 'bottom-center',
              offset: { y: -50 }
            }
          ]
        }
      ],
      audio: {
        voiceOver: {
          enabled: true,
          delay: 0.5,
          volume: 1.0
        },
        backgroundMusic: {
          enabled: true,
          volume: 0.15,
          fadeIn: 0.5,
          fadeOut: 0.5,
          style: 'trendy'
        }
      },
      transitions: {
        default: 'smooth_cut',
        duration: 0.3
      },
      captions: {
        enabled: true, // Facebook auto-plays muted
        style: 'clean_bottom',
        fontSize: 'medium'
      }
    };
  }

  /**
   * LinkedIn Template - 16:9 Landscape (Professional)
   */
  createLinkedInTemplate() {
    return {
      name: 'LinkedIn',
      platform: 'linkedin',
      aspectRatio: '16:9',
      resolution: {
        width: 1920,
        height: 1080
      },
      fps: 30,
      duration: {
        min: 10,
        max: 600, // LinkedIn allows up to 10 minutes
        default: 30
      },
      scenes: [
        {
          type: 'intro',
          duration: 3,
          elements: [
            {
              type: 'background',
              effect: 'subtle_zoom',
              intensity: 0.1 // Very subtle for professional
            },
            {
              type: 'logo',
              position: 'bottom-left',
              fadeIn: 0.5
            },
            {
              type: 'text',
              style: 'professional_title',
              position: 'center',
              animation: 'fade_in'
            }
          ]
        },
        {
          type: 'showcase',
          duration: 24,
          elements: [
            {
              type: 'image_sequence',
              transition: 'professional_slide',
              imageDuration: 4,
              kenBurns: {
                enabled: true,
                scale: 1.1, // Subtle zoom
                duration: 4
              }
            },
            {
              type: 'logo',
              persist: true
            }
          ]
        },
        {
          type: 'outro',
          duration: 3,
          elements: [
            {
              type: 'review_card',
              position: 'center',
              animation: 'fade_in',
              style: 'professional'
            },
            {
              type: 'text',
              style: 'subtitle',
              content: 'Connect with us on LinkedIn',
              position: 'bottom-center',
              offset: { y: -50 }
            }
          ]
        }
      ],
      audio: {
        voiceOver: {
          enabled: true,
          delay: 0.5,
          volume: 1.0
        },
        backgroundMusic: {
          enabled: true,
          volume: 0.08, // Very quiet for professional context
          fadeIn: 2,
          fadeOut: 2,
          style: 'corporate' // Professional music
        }
      },
      transitions: {
        default: 'professional_fade',
        duration: 0.7
      },
      captions: {
        enabled: true, // LinkedIn often auto-plays muted
        style: 'clean_subtitles',
        fontSize: 'medium'
      }
    };
  }

  /**
   * Get template with calculated sizes
   * @param {string} platform - Platform identifier
   * @param {Object} assets - Asset dimensions
   * @returns {Object} Template with calculated sizes
   */
  getTemplate(platform, assets = {}, options = {}) {
    const template = this.templates[platform];
    if (!template) {
      throw new Error(`Unknown platform: ${platform}`);
    }
    
    // Calculate all sizes for this template using actual render dimensions
    const renderWidth = options.actualDimensions?.width || template.resolution.width;
    const renderHeight = options.actualDimensions?.height || template.resolution.height;
    
    const sizes = this.sizing.calculateAllSizes(
      platform,
      renderWidth,
      renderHeight,
      assets,
      options
    );
    
    // Return template with calculated sizes
    return {
      ...template,
      calculatedSizes: sizes
    };
  }

  /**
   * Get all available platforms
   * @returns {Array} Platform identifiers
   */
  getAvailablePlatforms() {
    return Object.keys(this.templates);
  }

  /**
   * Validate assets for a platform
   * @param {string} platform - Platform identifier
   * @param {Object} assets - Assets to validate
   * @returns {Object} Validation result
   */
  validateAssets(platform, assets) {
    const template = this.templates[platform];
    if (!template) {
      return {
        valid: false,
        errors: [`No template found for platform: ${platform}`],
        warnings: []
      };
    }
    
    const errors = [];
    const warnings = [];
    
    // Check minimum images
    const minImages = 3;
    if (!assets.images || assets.images.length < minImages) {
      errors.push(`Minimum ${minImages} images required`);
    }
    
    // Check logo
    if (!assets.logo) {
      warnings.push('No logo provided - video will not have branding');
    }
    
    // Check audio
    if (!assets.voiceOver && !assets.backgroundMusic) {
      warnings.push('No audio provided - video will be silent');
    }
    
    // Check duration vs images
    if (assets.images) {
      const totalImageTime = assets.images.length * 4; // 4 seconds per image
      if (totalImageTime < template.duration.default) {
        warnings.push('Images will cycle to fill duration');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Instagram Portrait Template - 4:5 Vertical
   */
  createInstagramPortraitTemplate() {
    return {
      name: 'Instagram Portrait',
      platform: 'instagram_portrait',
      aspectRatio: '4:5',
      resolution: {
        width: 1080,
        height: 1350
      },
      fps: 30,
      duration: {
        min: 15,
        max: 60,
        default: 30
      }
    };
  }

  /**
   * Twitter Landscape Template - 16:9
   */
  createTwitterLandscapeTemplate() {
    return {
      name: 'Twitter Landscape',
      platform: 'twitter_landscape',
      aspectRatio: '16:9',
      resolution: {
        width: 1280,
        height: 720
      },
      fps: 30,
      duration: {
        min: 2,
        max: 140,
        default: 30
      }
    };
  }

  /**
   * Twitter Portrait Template - 9:16
   */
  createTwitterPortraitTemplate() {
    return {
      name: 'Twitter Portrait',
      platform: 'twitter_portrait',
      aspectRatio: '9:16',
      resolution: {
        width: 720,
        height: 1280
      },
      fps: 30,
      duration: {
        min: 2,
        max: 140,
        default: 30
      }
    };
  }

  /**
   * Twitter Square Template - 1:1
   */
  createTwitterSquareTemplate() {
    return {
      name: 'Twitter Square',
      platform: 'twitter_square',
      aspectRatio: '1:1',
      resolution: {
        width: 720,
        height: 720
      },
      fps: 30,
      duration: {
        min: 2,
        max: 140,
        default: 30
      }
    };
  }
}

export default PlatformTemplates;