import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3002').transform(Number),
  
  // Database (shared with VideoStacking) - Optional for local testing
  DATABASE_URL: z.string().default('postgresql://localhost:5432/videostacking'),
  
  // Storage - Optional for local testing (will use local files)
  R2_ENDPOINT: z.string().default('http://localhost:9000'),
  R2_ACCESS_KEY_ID: z.string().default('local-access-key'),
  R2_SECRET_ACCESS_KEY: z.string().default('local-secret-key'),
  R2_BUCKET_NAME: z.string().default('video-uploads'),
  R2_PUBLIC_URL: z.string().optional(),
  
  // Processing
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  MAX_CONCURRENT_JOBS: z.string().default('2').transform(Number),
  JOB_TIMEOUT_MS: z.string().default('1800000').transform(Number), // 30 minutes
  
  // Paths
  TEMP_DIR: z.string().default('./temp'),
  ASSET_PATH: z.string().optional()
})

export const config = envSchema.parse(process.env)