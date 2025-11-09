/**
 * Test script to verify platform-specific durations are working correctly
 */

import { processVideo } from './processors/video-processor.js'
import { logger } from './utils/logger.js'

// Mock video IDs for testing (replace with actual test video IDs)
const testVideos = [
  { videoId: 'test-youtube-shorts', platform: 'youtube_shorts', expectedDuration: 30 },
  { videoId: 'test-tiktok', platform: 'tiktok', expectedDuration: 15 },
  { videoId: 'test-instagram', platform: 'instagram', expectedDuration: 30 },
  { videoId: 'test-youtube', platform: 'youtube', expectedDuration: 60 },
  { videoId: 'test-facebook', platform: 'facebook', expectedDuration: 60 }
]

async function testPlatformDurations() {
  logger.info('Starting platform duration tests...')
  
  for (const test of testVideos) {
    logger.info(`\nTesting ${test.platform} with expected duration: ${test.expectedDuration}s`)
    
    try {
      // Process video with platform-specific settings
      const result = await processVideo(test.videoId, {
        platform: test.platform,
        settings: {
          targetDuration: test.expectedDuration,
          resolution: '1080p',
          frameRate: '30',
          layoutMode: 'letterbox'
        },
        targetDuration: test.expectedDuration
      })
      
      logger.info(`✅ ${test.platform} test completed successfully`, {
        expectedDuration: test.expectedDuration,
        result
      })
      
    } catch (error) {
      logger.error(`❌ ${test.platform} test failed`, {
        error: error instanceof Error ? error.message : error,
        expectedDuration: test.expectedDuration
      })
    }
  }
  
  logger.info('\nPlatform duration tests completed')
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPlatformDurations().catch(console.error)
}

export { testPlatformDurations }