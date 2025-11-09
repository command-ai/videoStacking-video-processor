import fs from 'fs/promises'
import path from 'path'
import { logger } from '../utils/logger.js'

// Local storage fallback for development without R2/S3
const LOCAL_STORAGE_PATH = './local-storage'

export async function ensureStorageDir() {
  await fs.mkdir(LOCAL_STORAGE_PATH, { recursive: true })
  await fs.mkdir(path.join(LOCAL_STORAGE_PATH, 'videos'), { recursive: true })
  await fs.mkdir(path.join(LOCAL_STORAGE_PATH, 'assets'), { recursive: true })
}

export async function uploadToLocal(
  localPath: string,
  storageKey: string,
  contentType?: string
): Promise<string> {
  try {
    await ensureStorageDir()
    
    const destPath = path.join(LOCAL_STORAGE_PATH, storageKey)
    const destDir = path.dirname(destPath)
    
    await fs.mkdir(destDir, { recursive: true })
    await fs.copyFile(localPath, destPath)
    
    logger.info(`Saved file locally: ${storageKey}`)
    
    // Return a local file URL
    return `file://${path.resolve(destPath)}`
  } catch (error) {
    logger.error(`Failed to save file locally:`, error)
    throw error
  }
}

export async function downloadFromLocal(
  storageKey: string,
  destPath: string
): Promise<void> {
  try {
    const srcPath = path.join(LOCAL_STORAGE_PATH, storageKey)
    await fs.copyFile(srcPath, destPath)
    
    logger.info(`Retrieved file from local storage: ${storageKey}`)
  } catch (error) {
    logger.error(`Failed to retrieve file from local storage:`, error)
    throw error
  }
}

export async function getLocalUrl(storageKey: string): Promise<string> {
  const filePath = path.join(LOCAL_STORAGE_PATH, storageKey)
  return `file://${path.resolve(filePath)}`
}