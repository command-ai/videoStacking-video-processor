// Quick start without TypeScript compilation
// This runs the service directly with Node.js

require('dotenv').config();

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'video-processor',
    timestamp: new Date().toISOString()
  });
});

// Process video job endpoint
app.post('/process', async (req, res) => {
  try {
    const { jobId } = req.body;
    
    console.log(`Received video processing job: ${jobId}`);
    
    // Acknowledge quickly
    res.json({ 
      received: true, 
      jobId,
      message: 'Video processing started' 
    });
    
    // In a real implementation, you would process the video here
    // For now, just update the status in the database
    if (jobId) {
      try {
        await prisma.video.updateMany({
          where: { id: jobId },
          data: { 
            status: 'processing',
            startedAt: new Date()
          }
        });
        
        // Simulate processing
        setTimeout(async () => {
          await prisma.video.updateMany({
            where: { id: jobId },
            data: { 
              status: 'completed',
              completedAt: new Date()
            }
          });
          console.log(`Video ${jobId} processing completed (simulated)`);
        }, 5000);
        
      } catch (error) {
        console.error('Database error:', error);
      }
    }
    
  } catch (error) {
    console.error('Invalid request:', error);
    res.status(400).json({ error: 'Invalid request' });
  }
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`Video processor listening on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Database connected:', process.env.DATABASE_URL ? 'Yes' : 'No');
  console.log('');
  console.log('⚠️  Note: This is a simplified version for testing');
  console.log('Real video processing with FFMPEG is temporarily disabled');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});