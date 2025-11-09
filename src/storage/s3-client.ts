import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config/environment.js'
import { logger } from '../utils/logger.js'
import fs from 'fs'
import { pipeline } from 'stream/promises'

// Create S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: config.R2_ENDPOINT,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY
  }
})

export async function downloadFromS3(s3Key: string, localPath: string): Promise<void> {
  try {
    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: s3Key
    })

    const response = await s3Client.send(command)
    
    if (!response.Body) {
      throw new Error('No body in S3 response')
    }

    const writeStream = fs.createWriteStream(localPath)
    await pipeline(response.Body as any, writeStream)
    
    logger.info(`Downloaded ${s3Key} to ${localPath}`)
  } catch (error) {
    logger.error(`Failed to download ${s3Key}:`, error)
    throw error
  }
}

export async function uploadToS3(localPath: string, s3Key: string): Promise<string> {
  try {
    const fileStream = fs.createReadStream(localPath)
    const stats = await fs.promises.stat(localPath)

    const command = new PutObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: s3Key,
      Body: fileStream,
      ContentType: 'video/mp4',
      ContentLength: stats.size
    })

    await s3Client.send(command)
    
    const publicUrl = config.R2_PUBLIC_URL
      ? `${config.R2_PUBLIC_URL}/${s3Key}`
      : `${config.R2_ENDPOINT}/${config.R2_BUCKET_NAME}/${s3Key}`
    
    logger.info(`Uploaded ${localPath} to ${s3Key}`)
    
    return publicUrl
  } catch (error) {
    logger.error(`Failed to upload ${localPath}:`, error)
    throw error
  }
}