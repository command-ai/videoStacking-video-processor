/**
 * R2 Storage Client
 * Handles authenticated downloads from R2/S3 storage
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import { pipeline } from 'stream/promises'
import { logger } from '../utils/logger.js'

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || ''
  }
})

/**
 * Download file from R2 using authenticated client
 * @param {string} s3Key - The S3 key of the file to download
 * @param {string} localPath - The local path to save the file
 * @returns {Promise<void>}
 */
export async function downloadFromR2(s3Key, localPath) {
  logger.info('Downloading from R2', { s3Key, localPath })
  
  try {
    // Clean up the S3 key if it starts with the public URL
    let cleanKey = s3Key
    if (s3Key.startsWith('http')) {
      const url = new URL(s3Key)
      cleanKey = url.pathname.substring(1) // Remove leading slash
    }
    
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET || 'video-stacking',
      Key: cleanKey
    })
    
    const response = await s3Client.send(command)
    
    if (!response.Body) {
      throw new Error('No body in R2 response')
    }
    
    // Stream the response to file
    const writeStream = fs.createWriteStream(localPath)
    await pipeline(response.Body, writeStream)
    
    // Verify file was written
    const stats = fs.statSync(localPath)
    logger.info('Downloaded file from R2', { 
      s3Key: cleanKey, 
      size: stats.size,
      localPath 
    })
    
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }
    
  } catch (error) {
    logger.error('Failed to download from R2', { 
      error: error.message, 
      s3Key,
      localPath 
    })
    throw error
  }
}

/**
 * Check if an S3 key exists in R2
 * @param {string} s3Key - The S3 key to check
 * @returns {Promise<boolean>}
 */
export async function checkR2FileExists(s3Key) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET || 'video-stacking',
      Key: s3Key
    })
    
    // Use HEAD request to check existence without downloading
    const response = await s3Client.send(command, { 
      requestHandler: { 
        metadata: { handlerProtocol: 'HEAD' } 
      } 
    })
    
    return true
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw error
  }
}