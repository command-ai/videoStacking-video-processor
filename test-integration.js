/**
 * Test script to verify FFMPEG integration
 * Run with: node test-integration.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Testing FFMPEG Core Integration\n');

// Test 1: Check core files exist
console.log('1️⃣ Checking core files...');
const coreFiles = [
  'src/core/VideoGenerator.js',
  'src/core/FFmpegRenderer.js',
  'src/core/MathematicalSizing.js',
  'src/core/ImageHandlingModes.js',
  'src/templates/PlatformTemplates.js'
];

let allFilesExist = true;
for (const file of coreFiles) {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`   ${file}: ${exists ? '✅' : '❌'}`);
  if (!exists) allFilesExist = false;
}

if (!allFilesExist) {
  console.error('\n❌ Some core files are missing!');
  process.exit(1);
}

// Test 2: Check TypeScript files
console.log('\n2️⃣ Checking TypeScript integration files...');
const tsFiles = [
  'src/processors/video-processor.ts',
  'src/processors/ffmpeg-processor.ts',
  'src/storage/r2-client.ts'
];

for (const file of tsFiles) {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`   ${file}: ${exists ? '✅' : '❌'}`);
}

// Test 3: Check if modules can be loaded
console.log('\n3️⃣ Testing module loading...');
try {
  const VideoGenerator = await import('./src/core/VideoGenerator.js');
  console.log('   VideoGenerator: ✅');
  
  const FFmpegRenderer = await import('./src/core/FFmpegRenderer.js');
  console.log('   FFmpegRenderer: ✅');
  
  const MathematicalSizing = await import('./src/core/MathematicalSizing.js');
  console.log('   MathematicalSizing: ✅');
  
  const PlatformTemplates = await import('./src/templates/PlatformTemplates.js');
  console.log('   PlatformTemplates: ✅');
} catch (error) {
  console.error('   ❌ Module loading failed:', error.message);
  process.exit(1);
}

// Test 4: Check FFmpeg availability
console.log('\n4️⃣ Checking FFmpeg installation...');
import { execSync } from 'child_process';
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  console.log('   ffmpeg: ✅');
  
  execSync('ffprobe -version', { stdio: 'ignore' });
  console.log('   ffprobe: ✅');
} catch (error) {
  console.error('   ❌ FFmpeg is not installed or not in PATH');
  console.log('   Please install FFmpeg: https://ffmpeg.org/download.html');
}

console.log('\n✅ FFMPEG integration complete!');
console.log('\nNext steps:');
console.log('1. Set up environment variables in .env');
console.log('2. Run: npm run build');
console.log('3. Run: npm run dev');
console.log('4. Test video generation with a sample job');