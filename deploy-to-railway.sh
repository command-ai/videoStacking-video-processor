#!/bin/bash
set -e

# Video Processor - Railway Deployment Script
# This script deploys the video-processor service to Railway

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================"
echo -e "Video Processor - Railway Deployment"
echo -e "========================================${NC}"

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found${NC}"
    echo -e "${YELLOW}Install it with: npm install -g @railway/cli${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Railway CLI found${NC}"

# Check login status
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Railway${NC}"
    echo -e "${BLUE}Logging you in...${NC}"
    railway login
fi

echo -e "${GREEN}✅ Logged in to Railway${NC}"

# Check if project is linked
if [ ! -f ".railway/config.json" ]; then
    echo -e "${YELLOW}⚠️  Project not linked${NC}"
    echo -e "${BLUE}Creating new Railway project...${NC}"
    railway init
fi

echo -e "${GREEN}✅ Railway project configured${NC}"

# Prompt for environment variables (only if not already set)
echo -e "${BLUE}Checking environment variables...${NC}"

# Check if variables are already set
if railway variables | grep -q "DATABASE_URL"; then
    echo -e "${GREEN}✅ Environment variables already configured${NC}"
else
    echo -e "${YELLOW}⚠️  Environment variables not set${NC}"
    echo -e "${BLUE}You'll need to set these variables manually:${NC}"
    echo ""
    echo "railway variables set DATABASE_URL=\"postgresql://...\""
    echo "railway variables set R2_ENDPOINT=\"https://...\""
    echo "railway variables set R2_ACCESS_KEY_ID=\"...\""
    echo "railway variables set R2_SECRET_ACCESS_KEY=\"...\""
    echo "railway variables set R2_BUCKET_NAME=\"video-platform\""
    echo "railway variables set R2_PUBLIC_URL=\"https://...\""
    echo ""
    echo -e "${YELLOW}Would you like to continue with deployment anyway? (y/n)${NC}"
    read -r CONTINUE

    if [ "$CONTINUE" != "y" ]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

# Set standard environment variables
echo -e "${BLUE}Setting standard environment variables...${NC}"
railway variables set NODE_ENV=production
railway variables set PORT=3002
railway variables set FFMPEG_PATH=ffmpeg
railway variables set FFPROBE_PATH=ffprobe
railway variables set MAX_CONCURRENT_JOBS=2
railway variables set JOB_TIMEOUT_MS=1800000
railway variables set TEMP_DIR=/tmp/video-processor
railway variables set ASSET_PATH=/app/assets

echo -e "${GREEN}✅ Standard variables set${NC}"

# Build locally first (validate)
echo -e "${BLUE}Building project locally for validation...${NC}"
npm install
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Local build failed! Fix errors before deploying.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Local build successful${NC}"

# Deploy to Railway
echo -e "${BLUE}Deploying to Railway...${NC}"
railway up

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deployment initiated${NC}"

# Wait for deployment
echo -e "${BLUE}Waiting for deployment to complete (30 seconds)...${NC}"
sleep 30

# Get deployment URL
DEPLOYMENT_URL=$(railway domain 2>/dev/null)

if [ -z "$DEPLOYMENT_URL" ]; then
    echo -e "${YELLOW}⚠️  No domain configured yet${NC}"
    echo -e "${BLUE}Generate a domain with: railway domain${NC}"
else
    echo -e "${GREEN}✅ Service deployed at: https://$DEPLOYMENT_URL${NC}"

    # Health check
    echo -e "${BLUE}Running health check...${NC}"
    sleep 5

    HEALTH_RESPONSE=$(curl -s "https://$DEPLOYMENT_URL/health" --max-time 10 || echo "failed")

    if echo "$HEALTH_RESPONSE" | grep -q "video-processor"; then
        echo -e "${GREEN}✅ Health check passed!${NC}"
        echo -e "${GREEN}Service is running at: https://$DEPLOYMENT_URL${NC}"
    else
        echo -e "${YELLOW}⚠️  Health check inconclusive${NC}"
        echo -e "${BLUE}Check logs with: railway logs${NC}"
    fi
fi

# Display useful commands
echo ""
echo -e "${BLUE}========================================"
echo -e "Useful Railway Commands"
echo -e "========================================${NC}"
echo "railway logs              # View logs"
echo "railway status            # Check status"
echo "railway domain            # Get/set domain"
echo "railway variables         # List variables"
echo "railway restart           # Restart service"
echo "railway rollback          # Rollback deployment"
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
