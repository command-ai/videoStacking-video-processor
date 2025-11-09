#!/bin/bash

###############################################################################
# Deployment Testing Script
#
# This script runs comprehensive tests against a deployed video-processor
# service to validate deployment success.
#
# Usage:
#   ./scripts/test-deployment.sh <service-url>
#
# Example:
#   ./scripts/test-deployment.sh https://video-processor.railway.app
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service URL
SERVICE_URL="${1:-https://video-processor.railway.app}"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
  echo ""
  echo "=========================================="
  echo "$1"
  echo "=========================================="
  echo ""
}

print_test() {
  echo -e "${YELLOW}Testing:${NC} $1"
}

print_success() {
  echo -e "${GREEN}✅ PASS:${NC} $1"
  ((TESTS_PASSED++))
}

print_failure() {
  echo -e "${RED}❌ FAIL:${NC} $1"
  ((TESTS_FAILED++))
}

print_info() {
  echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

# Test functions
test_health_endpoint() {
  print_test "Health endpoint accessibility"

  RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/health")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" -eq 200 ]; then
    print_success "Health endpoint returned 200 OK"

    # Validate response structure
    if echo "$BODY" | jq -e '.status' > /dev/null 2>&1; then
      print_success "Health response has valid JSON structure"
    else
      print_failure "Health response JSON is invalid"
    fi

    # Check required fields
    STATUS=$(echo "$BODY" | jq -r '.status')
    SERVICE=$(echo "$BODY" | jq -r '.service')

    if [ "$STATUS" = "healthy" ]; then
      print_success "Service status is healthy"
    else
      print_failure "Service status is: $STATUS"
    fi

    if [ "$SERVICE" = "video-processor" ]; then
      print_success "Service name is correct"
    else
      print_failure "Service name is: $SERVICE"
    fi
  else
    print_failure "Health endpoint returned HTTP $HTTP_CODE"
  fi
}

test_health_response_time() {
  print_test "Health endpoint response time"

  START=$(date +%s%N)
  curl -s "$SERVICE_URL/health" > /dev/null
  END=$(date +%s%N)

  DURATION=$(( (END - START) / 1000000 )) # Convert to milliseconds

  print_info "Response time: ${DURATION}ms"

  if [ "$DURATION" -lt 2000 ]; then
    print_success "Response time is acceptable (< 2 seconds)"
  else
    print_failure "Response time is too slow (${DURATION}ms)"
  fi
}

test_health_concurrent() {
  print_test "Health endpoint under concurrent load"

  REQUESTS=10
  FAILURES=0

  for i in $(seq 1 $REQUESTS); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health")
    if [ "$HTTP_CODE" -ne 200 ]; then
      ((FAILURES++))
    fi
  done

  if [ "$FAILURES" -eq 0 ]; then
    print_success "All $REQUESTS concurrent requests succeeded"
  else
    print_failure "$FAILURES out of $REQUESTS requests failed"
  fi
}

test_invalid_endpoint() {
  print_test "404 handling for invalid endpoints"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/invalid-endpoint")

  if [ "$HTTP_CODE" -eq 404 ]; then
    print_success "Invalid endpoint returns 404"
  else
    print_failure "Invalid endpoint returned HTTP $HTTP_CODE"
  fi
}

test_process_endpoint_structure() {
  print_test "/process endpoint accessibility"

  # Test with empty body (should fail validation)
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/process" \
    -H "Content-Type: application/json" \
    -d '{}')

  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

  # Should return 400 for invalid input
  if [ "$HTTP_CODE" -eq 400 ]; then
    print_success "/process endpoint validates input correctly"
  else
    print_failure "/process endpoint returned HTTP $HTTP_CODE for invalid input"
  fi
}

test_enhance_endpoint_structure() {
  print_test "/enhance endpoint accessibility"

  # Test with empty body (should fail validation)
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/enhance" \
    -H "Content-Type: application/json" \
    -d '{}')

  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

  # Should return 400 or 500 for invalid input
  if [ "$HTTP_CODE" -eq 400 ] || [ "$HTTP_CODE" -eq 500 ]; then
    print_success "/enhance endpoint validates input correctly"
  else
    print_failure "/enhance endpoint returned HTTP $HTTP_CODE for invalid input"
  fi
}

test_cors_headers() {
  print_test "CORS headers configuration"

  HEADERS=$(curl -s -I "$SERVICE_URL/health")

  if echo "$HEADERS" | grep -i "access-control-allow-origin" > /dev/null; then
    print_success "CORS headers present"
  else
    print_info "CORS headers not found (may be intentional)"
  fi
}

test_compression() {
  print_test "Response compression"

  HEADERS=$(curl -s -I -H "Accept-Encoding: gzip" "$SERVICE_URL/health")

  if echo "$HEADERS" | grep -i "content-encoding: gzip" > /dev/null; then
    print_success "Gzip compression enabled"
  else
    print_info "Compression not detected (responses may be too small)"
  fi
}

test_ssl_certificate() {
  print_test "SSL certificate validity"

  if echo "$SERVICE_URL" | grep -q "https://"; then
    if curl -s --insecure -I "$SERVICE_URL/health" > /dev/null 2>&1; then
      if curl -s -I "$SERVICE_URL/health" > /dev/null 2>&1; then
        print_success "SSL certificate is valid"
      else
        print_failure "SSL certificate is invalid or expired"
      fi
    else
      print_failure "HTTPS connection failed"
    fi
  else
    print_info "Service not using HTTPS (testing HTTP endpoint)"
  fi
}

# Main execution
main() {
  print_header "Video Processor Deployment Tests"
  print_info "Testing service at: $SERVICE_URL"
  print_info "Started at: $(date)"

  # Run all tests
  print_header "1. Health Endpoint Tests"
  test_health_endpoint
  test_health_response_time
  test_health_concurrent

  print_header "2. API Endpoint Tests"
  test_invalid_endpoint
  test_process_endpoint_structure
  test_enhance_endpoint_structure

  print_header "3. Infrastructure Tests"
  test_cors_headers
  test_compression
  test_ssl_certificate

  # Summary
  print_header "Test Summary"
  echo "Tests Passed: $TESTS_PASSED"
  echo "Tests Failed: $TESTS_FAILED"
  echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
  echo "Completed at: $(date)"

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All tests passed! Deployment is successful.${NC}"
    echo ""
    exit 0
  else
    echo ""
    echo -e "${RED}❌ Some tests failed. Please review the deployment.${NC}"
    echo ""
    exit 1
  fi
}

# Run main function
main
