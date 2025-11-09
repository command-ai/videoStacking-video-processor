import { S3Client, GetObjectCommand, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config/environment.js'
import { logger } from '../utils/logger.js'
import fs from 'fs'
import { pipeline } from 'stream/promises'
import { uploadToLocal, downloadFromLocal, getLocalUrl } from './local-storage.js'

// Check if we're using local storage (development mode without real R2/S3)
const useLocalStorage = config.NODE_ENV === 'development' && 
  config.R2_ACCESS_KEY_ID === 'local-access-key'

// Create S3 client for Cloudflare R2 (may not be used in local dev)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: config.R2_ENDPOINT,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY
  }
})

export async function downloadFromR2(s3Key: string, localPath: string): Promise<void> {
  if (useLocalStorage) {
    return downloadFromLocal(s3Key, localPath)
  }
  
  try {
    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: s3Key
    })

    const response = await r2Client.send(command)
    
    if (!response.Body) {
      throw new Error('No body in R2 response')
    }

    const writeStream = fs.createWriteStream(localPath)
    await pipeline(response.Body as any, writeStream)
    
    logger.info(`Downloaded ${s3Key} to ${localPath}`)
  } catch (error) {
    logger.error(`Failed to download ${s3Key}:`, error)
    throw error
  }
}

export async function uploadToR2(
  localPath: string, 
  s3Key: string, 
  contentType: string = 'application/octet-stream'
): Promise<string> {
  if (useLocalStorage) {
    return uploadToLocal(localPath, s3Key, contentType)
  }
  
  try {
    const fileStream = fs.createReadStream(localPath)
    const stats = await fs.promises.stat(localPath)

    const params: PutObjectCommandInput = {
      Bucket: config.R2_BUCKET_NAME,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
      ContentLength: stats.size
    }

    const command = new PutObjectCommand(params)
    await r2Client.send(command)
    
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

export async function getSignedDownloadUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: s3Key
    })

    const url = await getSignedUrl(r2Client, command, { expiresIn })
    return url
  } catch (error) {
    logger.error(`Failed to generate signed URL for ${s3Key}:`, error)
    throw error
  }
}

export async function getSignedUploadUrl(
  s3Key: string, 
  contentType: string = 'application/octet-stream',
  expiresIn: number = 3600
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType
    })

    const url = await getSignedUrl(r2Client, command, { expiresIn })
    return url
  } catch (error) {
    logger.error(`Failed to generate signed upload URL for ${s3Key}:`, error)
    throw error
  }
}

export { r2Client }