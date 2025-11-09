import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger.js'
import { config } from '../config/environment.js'

const globalForPrisma = global as unknown as { prisma: PrismaClient | null }

// Create real Prisma client with optimized connection pool settings
export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
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

// Log Prisma events with proper typing
interface PrismaQueryEvent {
  query: string
  params: string
  duration: number
  target: string
}

interface PrismaLogEvent {
  message: string
  target: string
  timestamp: Date
}

prisma.$on('query', (e: PrismaQueryEvent) => {
  logger.debug('Query: ' + e.query)
})

prisma.$on('error', (e: PrismaLogEvent) => {
  logger.error('Prisma error:', e.message)
})

prisma.$on('info', (e: PrismaLogEvent) => {
  logger.info('Prisma info:', e.message)
})

prisma.$on('warn', (e: PrismaLogEvent) => {
  logger.warn('Prisma warning:', e.message)
})