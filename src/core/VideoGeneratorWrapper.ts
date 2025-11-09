// ES Module wrapper for CommonJS VideoGenerator
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Load the CommonJS module
const VideoGenerator = require('./VideoGenerator.js')

// Export as default for ES module compatibility
export default VideoGenerator
export { VideoGenerator }