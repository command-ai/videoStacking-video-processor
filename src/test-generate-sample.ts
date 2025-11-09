/**
 * Sample video generation test
 * Tests the full FFMPEG integration without database
 */

// @ts-ignore - CommonJS module
const VideoGenerator = require('./core/VideoGenerator.js')
import path from 'path'
import fs from 'fs/promises'

async function generateSampleVideo() {
  console.log('🎬 Generating sample video...\n')
  
  try {
    // 1. Create temp directories
    const tempDir = './temp/test'
    const outputDir = './output/test'
    await fs.mkdir(tempDir, { recursive: true })
    await fs.mkdir(outputDir, { recursive: true })
    
    // 2. Initialize video generator
    const generator = new VideoGenerator({
      tempDir,
      outputDir,
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe'
    })
    
    // 3. Create test assets (using placeholder paths)
    // In production, these would be actual image/video files
    const testAssets = {
      images: [
        // Add paths to test images here
        '/path/to/test/image1.jpg',
        '/path/to/test/image2.jpg',
        '/path/to/test/image3.jpg'
      ],
      logo: '/path/to/test/logo.png',
      backgroundImage: '/path/to/test/background.jpg',
      voiceOver: null, // Optional audio file
      backgroundMusic: null // Optional music file
    }
    
    // 4. Test different platforms
    const platforms = ['youtube', 'instagram_reel', 'tiktok']
    
    for (const platform of platforms) {
      console.log(`\nGenerating ${platform} video...`)
      
      try {
        // Check if we have actual test assets
        const hasAssets = await checkTestAssets()
        
        if (!hasAssets) {
          console.log(`⚠️  Skipping ${platform} - no test assets found`)
          console.log('   Please add test images to continue')
          continue
        }
        
        const outputPath = await generator.generateVideo(
          platform,
          testAssets,
          {
            adaptiveGraphics: true,
            onProgress: (progress: { percent: number }) => {
              process.stdout.write(`\r   Progress: ${progress.percent}%`)
            }
          }
        )
        
        console.log(`\n✅ ${platform} video generated: ${outputPath}`)
        
        // Check file size
        const stats = await fs.stat(outputPath)
        console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
        
      } catch (error) {
        console.error(`❌ Failed to generate ${platform} video:`, error)
      }
    }
    
    console.log('\n✨ Sample generation complete!')
    
  } catch (error) {
    console.error('❌ Sample generation failed:', error)
  }
}

async function checkTestAssets(): Promise<boolean> {
  // Check if we have any test assets in a common location
  const testAssetsDir = path.join(process.cwd(), 'test-assets')
  
  try {
    await fs.access(testAssetsDir)
    const files = await fs.readdir(testAssetsDir)
    return files.length > 0
  } catch {
    return false
  }
}

// Run the test
generateSampleVideo().catch(console.error)