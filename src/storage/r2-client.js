/**
 * R2 Storage Client
 * Handles authenticated downloads from R2/S3 storage
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import fs from 'fs'
import { pipeline } from 'stream/promises'
import { logger } from '../utils/logger.js'

// Bound how long a single R2 download may take. Without these, a stalled
// stream makes `pipeline()` hang forever, which freezes the render in
// "processing" with no error and no completion.
const R2_CONNECT_TIMEOUT_MS = Number(process.env.R2_CONNECT_TIMEOUT_MS) || 15000
const R2_REQUEST_TIMEOUT_MS = Number(process.env.R2_REQUEST_TIMEOUT_MS) || 120000

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || ''
  },
  requestHandler: new NodeHttpHandler({
    connectionTimeout: R2_CONNECT_TIMEOUT_MS,
    requestTimeout: R2_REQUEST_TIMEOUT_MS
  })
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
    
    // Stream the response to file, with a hard wall-clock backstop so a
    // stream that stalls mid-transfer (no error, no end) cannot hang forever.
    const writeStream = fs.createWriteStream(localPath)
    let stallTimer
    const stallGuard = new Promise((_, reject) => {
      stallTimer = setTimeout(() => {
        try { response.Body?.destroy?.(new Error('R2 download stalled')) } catch {}
        try { writeStream.destroy() } catch {}
        reject(new Error(`R2 download timed out after ${R2_REQUEST_TIMEOUT_MS}ms: ${cleanKey}`))
      }, R2_REQUEST_TIMEOUT_MS + 5000)
    })
    try {
      await Promise.race([pipeline(response.Body, writeStream), stallGuard])
    } finally {
      clearTimeout(stallTimer)
    }
    
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