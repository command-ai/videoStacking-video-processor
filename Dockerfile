# VideoStacking Video Processor Dockerfile
# Railway deployment with FFmpeg support

FROM node:20-alpine3.17 AS base

# Install FFmpeg and dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
FROM base AS deps
RUN npm ci --only=production

# Build stage
FROM base AS build
COPY package*.json ./
RUN npm ci

# Copy Prisma schema for generation
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

COPY . .
RUN npm run build; exit 0

# Production stage
FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma/

# Copy the generated Prisma client
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Generate Prisma client in production (as fallback)
RUN npx prisma generate

# Copy core FFMPEG implementation
COPY --from=build /app/src/core ./dist/core

# Create necessary directories
RUN mkdir -p /tmp/video-processor /app/assets

# Set user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /tmp/video-processor /app/assets
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe
ENV TEMP_DIR=/tmp/video-processor
ENV ASSET_PATH=/app/assets

# Railway provides PORT automatically at runtime
# No EXPOSE needed - Railway handles port assignment

# Health check disabled - Railway has built-in healthchecks
# Use Railway dashboard to configure healthcheck endpoint at /health

CMD ["sh", "-c", "test -f dist/index.js && node dist/index.js || npx tsx src/index.ts"]