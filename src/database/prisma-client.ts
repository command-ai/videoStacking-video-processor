import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger.js'

const globalForPrisma = global as unknown as { prisma: PrismaClient | null }

// Create real Prisma client with optimized connection pool settings
export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Optimize connection pool for video processing workloads
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Log Prisma events only in development
if (process.env.NODE_ENV === 'development') {
  // @ts-ignore - Prisma event types
  prisma.$on('query' as any, (e: any) => {
    logger.debug('Query: ' + e.query)
  })
}