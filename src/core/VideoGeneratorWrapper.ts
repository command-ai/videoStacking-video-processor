// ES Module wrapper for CommonJS VideoGenerator
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

// Load the CommonJS module
const VideoGenerator = require('./VideoGenerator.js')

// Export as default for ES module compatibility
export default VideoGenerator
export { VideoGenerator }