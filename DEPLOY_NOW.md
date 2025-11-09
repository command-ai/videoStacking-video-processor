# Deploy Video-Processor to Railway - Run These Commands

You're logged in to Railway as: **code@contentrocket.ai**

## Step 1: Initialize Railway Project

```bash
cd /Users/macbookpro/Development/BusinessProjects/projects/Media/HomeServiceProviders-Media-Generator/Working_Pipeline/video-processor

# Initialize new Railway project (will prompt for workspace selection)
railway init
```

**When prompted:**
- Select workspace: `command-ai's Projects`
- Project name: `video-processor` (or your choice)

## Step 2: Set Environment Variables

```bash
# Standard variables (safe to run)
railway variables set NODE_ENV=production
railway variables set PORT=3002
railway variables set FFMPEG_PATH=ffmpeg
railway variables set FFPROBE_PATH=ffprobe
railway variables set MAX_CONCURRENT_JOBS=2
railway variables set JOB_TIMEOUT_MS=1800000
railway variables set TEMP_DIR=/tmp/video-processor
railway variables set ASSET_PATH=/app/assets

# Critical variables (get these from your VideoStacking deployment)
railway variables set DATABASE_URL="<YOUR_DATABASE_URL_HERE>"
railway variables set R2_ENDPOINT="<YOUR_R2_ENDPOINT_HERE>"
railway variables set R2_ACCESS_KEY_ID="<YOUR_R2_KEY_HERE>"
railway variables set R2_SECRET_ACCESS_KEY="<YOUR_R2_SECRET_HERE>"
railway variables set R2_BUCKET_NAME="video-platform"
railway variables set R2_PUBLIC_URL="<YOUR_R2_PUBLIC_URL_HERE>"
```

### Where to Find These Values:

**DATABASE_URL:**
- Go to your VideoStacking Railway project
- Click on PostgreSQL service
- Copy the `DATABASE_URL` from the Variables tab

**R2 Credentials:**
- CloudFlare Dashboard → R2 → Manage R2 API Tokens
- Or check your existing VideoStacking .env file

## Step 3: Deploy

```bash
# Build and test locally first
npm install
npm run build

# Deploy to Railway
railway up
```

## Step 4: Generate Domain

```bash
# Generate a public domain for your service
railway domain
```

This will give you a URL like: `https://video-processor-production-xxxx.up.railway.app`

## Step 5: Test Deployment

```bash
# Wait a moment for deployment to complete
sleep 30

# Get your deployment URL
DEPLOYMENT_URL=$(railway domain)

# Test health endpoint
curl https://$DEPLOYMENT_URL/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "video-processor",
  "timestamp": "2025-11-09T..."
}
```

## Useful Commands

```bash
# View logs
railway logs

# Check status
railway status

# List environment variables
railway variables

# Restart service
railway restart

# Rollback if needed
railway rollback
```

## Troubleshooting

**If build fails:**
```bash
# Check logs
railway logs --tail 100

# Try rebuilding
railway up --detach
```

**If health check fails:**
```bash
# Check environment variables are set
railway variables

# Check service is running
railway status

# View recent logs
railway logs --tail 50
```

## Next: Configure CloudFlare Pages

After video-processor is deployed, configure CloudFlare Pages:

1. Go to CloudFlare Pages dashboard
2. Navigate to your project settings
3. Set:
   - **Build command:** `cd packages/renderer && npm install && npm run build`
   - **Build output:** `packages/renderer/dist`
   - **Environment:** `NODE_VERSION=23`
4. Trigger deployment

See `../VideoStacking/CLOUDFLARE_PAGES_SETUP.md` for details.
