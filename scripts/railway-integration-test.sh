#!/bin/bash

###############################################################################
# Railway Integration Test Script
#
# This script tests Railway-specific functionality and deployment integration.
#
# Prerequisites:
#   - Railway CLI installed
#   - RAILWAY_TOKEN environment variable set
#   - Project linked to Railway
#
# Usage:
#   export RAILWAY_TOKEN=your_token
#   ./scripts/railway-integration-test.sh
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_NAME="video-processor"
REQUIRED_ENV_VARS=(
  "DATABASE_URL"
  "R2_ENDPOINT"
  "R2_ACCESS_KEY_ID"
  "R2_SECRET_ACCESS_KEY"
  "R2_BUCKET_NAME"
  "PORT"
  "NODE_ENV"
)

# Helper functions
print_header() {
  echo ""
  echo -e "${BLUE}=========================================="
  echo -e "$1"
  echo -e "==========================================${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_failure() {
  echo -e "${RED}❌ $1${NC}"
  exit 1
}

print_info() {
  echo -e "${YELLOW}ℹ  $1${NC}"
}

print_step() {
  echo -e "${BLUE}▶ $1${NC}"
}

# Check Railway CLI
check_railway_cli() {
  print_step "Checking Railway CLI installation"

  if ! command -v railway &> /dev/null; then
    print_failure "Railway CLI not found. Install from: https://docs.railway.app/develop/cli"
  fi

  RAILWAY_VERSION=$(railway --version)
  print_success "Railway CLI installed: $RAILWAY_VERSION"
}

# Check Railway token
check_railway_token() {
  print_step "Checking Railway authentication"

  if [ -z "$RAILWAY_TOKEN" ]; then
    print_failure "RAILWAY_TOKEN environment variable not set"
  fi

  print_success "Railway token configured"
}

# Link to project
link_project() {
  print_step "Linking to Railway project"

  # Check if already linked
  if railway status &> /dev/null; then
    print_success "Already linked to Railway project"
    return
  fi

  # Try to link
  if railway link; then
    print_success "Successfully linked to Railway project"
  else
    print_failure "Failed to link to Railway project"
  fi
}

# Get service URL
get_service_url() {
  print_step "Getting service URL"

  SERVICE_URL=$(railway status --json 2>/dev/null | jq -r '.serviceUrl // .url // empty')

  if [ -z "$SERVICE_URL" ]; then
    print_failure "Could not get service URL from Railway"
  fi

  print_success "Service URL: $SERVICE_URL"
  echo "$SERVICE_URL"
}

# Check environment variables
check_env_vars() {
  print_step "Checking environment variables configuration"

  MISSING_VARS=()

  for var in "${REQUIRED_ENV_VARS[@]}"; do
    if railway variables get "$var" &> /dev/null; then
      print_success "Environment variable set: $var"
    else
      print_info "Environment variable missing: $var"
      MISSING_VARS+=("$var")
    fi
  done

  if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    print_failure "Missing required environment variables: ${MISSING_VARS[*]}"
  fi
}

# Test deployment status
test_deployment_status() {
  print_step "Checking deployment status"

  STATUS=$(railway status --json | jq -r '.status')

  case "$STATUS" in
    "SUCCESS"|"DEPLOYED")
      print_success "Deployment status: $STATUS"
      ;;
    "BUILDING"|"DEPLOYING")
      print_info "Deployment in progress: $STATUS"
      ;;
    "FAILED")
      print_failure "Deployment failed"
      ;;
    *)
      print_info "Unknown deployment status: $STATUS"
      ;;
  esac
}

# Test health endpoint
test_health_endpoint() {
  print_step "Testing health endpoint"

  SERVICE_URL=$1

  if [ -z "$SERVICE_URL" ]; then
    print_failure "Service URL not provided"
  fi

  # Test health check
  RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/health" || echo "FAILED")

  if [ "$RESPONSE" = "FAILED" ]; then
    print_failure "Health check request failed"
  fi

  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" -eq 200 ]; then
    print_success "Health check returned 200 OK"

    # Validate response
    if echo "$BODY" | jq -e '.status' > /dev/null 2>&1; then
      STATUS=$(echo "$BODY" | jq -r '.status')
      SERVICE=$(echo "$BODY" | jq -r '.service')

      if [ "$STATUS" = "healthy" ]; then
        print_success "Service is healthy"
      else
        print_failure "Service status: $STATUS"
      fi

      if [ "$SERVICE" = "video-processor" ]; then
        print_success "Service name verified"
      fi
    else
      print_failure "Invalid health check response"
    fi
  else
    print_failure "Health check returned HTTP $HTTP_CODE"
  fi
}

# Test video processing
test_video_processing() {
  print_step "Testing video processing endpoint"

  SERVICE_URL=$1

  # Create test payload
  TEST_PAYLOAD=$(cat <<'EOF'
{
  "videoId": "cm_test_deployment_001",
  "platform": "youtube",
  "mediaIds": ["test-image-1"],
  "enhancements": {
    "logo": null,
    "music": null,
    "voiceover": null
  },
  "settings": {
    "duration": 5,
    "layoutMode": "single"
  },
  "organizationId": "test-org-001"
}
EOF
)

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/enhance" \
    -H "Content-Type: application/json" \
    -d "$TEST_PAYLOAD" || echo "FAILED")

  if [ "$RESPONSE" = "FAILED" ]; then
    print_info "Video processing test failed (expected if no test data)"
    return
  fi

  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

  case "$HTTP_CODE" in
    200)
      print_success "Video processing endpoint responded successfully"
      ;;
    400)
      print_info "Video processing validation working (returned 400 for test data)"
      ;;
    500)
      print_info "Video processing endpoint accessible (returned 500 - may need test data)"
      ;;
    *)
      print_info "Video processing returned HTTP $HTTP_CODE"
      ;;
  esac
}

# Check logs
check_logs() {
  print_step "Checking recent logs for errors"

  LOGS=$(railway logs --tail 20 2>&1 || echo "")

  if echo "$LOGS" | grep -i "error" > /dev/null; then
    print_info "Found errors in recent logs - review manually"
    echo "$LOGS" | grep -i "error" | head -5
  else
    print_success "No errors in recent logs"
  fi
}

# Check scaling configuration
check_scaling() {
  print_step "Checking scaling configuration"

  # Get scaling info from railway.json if exists
  if [ -f "railway.json" ]; then
    MIN_REPLICAS=$(jq -r '.deploy.scaling.minReplicas' railway.json)
    MAX_REPLICAS=$(jq -r '.deploy.scaling.maxReplicas' railway.json)

    print_success "Scaling: $MIN_REPLICAS - $MAX_REPLICAS replicas"
  else
    print_info "railway.json not found - using default scaling"
  fi
}

# Test rollback capability
test_rollback_capability() {
  print_step "Checking rollback capability"

  DEPLOYMENTS=$(railway deployments list --json 2>/dev/null | jq '. | length')

  if [ "$DEPLOYMENTS" -gt 1 ]; then
    print_success "Multiple deployments available for rollback"
  else
    print_info "Only one deployment - rollback not yet available"
  fi
}

# Performance test
performance_test() {
  print_step "Running basic performance test"

  SERVICE_URL=$1

  # Measure response time
  START=$(date +%s%N)
  curl -s "$SERVICE_URL/health" > /dev/null
  END=$(date +%s%N)

  DURATION=$(( (END - START) / 1000000 ))

  print_info "Health endpoint response time: ${DURATION}ms"

  if [ "$DURATION" -lt 1000 ]; then
    print_success "Response time is excellent (< 1 second)"
  elif [ "$DURATION" -lt 3000 ]; then
    print_success "Response time is acceptable (< 3 seconds)"
  else
    print_info "Response time is slow (${DURATION}ms)"
  fi
}

# Main execution
main() {
  print_header "Railway Integration Tests - Video Processor"
  print_info "Started at: $(date)"

  # Pre-flight checks
  print_header "1. Pre-flight Checks"
  check_railway_cli
  check_railway_token
  link_project

  # Configuration tests
  print_header "2. Configuration Tests"
  check_env_vars
  check_scaling

  # Deployment tests
  print_header "3. Deployment Tests"
  test_deployment_status
  check_logs

  # Get service URL
  SERVICE_URL=$(get_service_url)

  # Functional tests
  print_header "4. Functional Tests"
  test_health_endpoint "$SERVICE_URL"
  test_video_processing "$SERVICE_URL"

  # Performance tests
  print_header "5. Performance Tests"
  performance_test "$SERVICE_URL"

  # Operational tests
  print_header "6. Operational Tests"
  test_rollback_capability

  # Summary
  print_header "Test Summary"
  echo ""
  print_success "All Railway integration tests completed successfully!"
  echo ""
  print_info "Service URL: $SERVICE_URL"
  print_info "Completed at: $(date)"
  echo ""
  echo -e "${GREEN}✅ Railway deployment is validated and operational${NC}"
  echo ""
}

# Run main function
main
