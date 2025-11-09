require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMedia() {
  const projectId = 'cmf0jey42000dlgllncaz9cqw';
  
  console.log('Checking media for project:', projectId);
  
  const media = await prisma.videoMedia.findMany({
    where: { projectId },
    select: {
      id: true,
      filename: true,
      s3Key: true,
      mimeType: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('Media count:', media.length);
  if (media.length > 0) {
    console.log('Media files:');
    media.forEach((m, i) => {
      console.log(`  ${i+1}. ${m.filename} (${m.mimeType})`);
      console.log(`     S3 Key: ${m.s3Key}`);
      console.log(`     Created: ${m.createdAt}`);
      console.log('');
    });
  } else {
    console.log('No media files found. Are you uploading them now?');
  }
  
  await prisma.$disconnect();
}

checkMedia().catch(console.error);