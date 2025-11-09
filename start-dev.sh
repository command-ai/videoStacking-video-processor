#!/bin/bash

echo "🚀 Starting Video Processor in development mode..."
echo ""

# Check if tsx is available
if ! command -v npx tsx &> /dev/null; then
    echo "Installing tsx..."
    npm install --save-dev tsx
fi

echo "Starting service with tsx (TypeScript runtime)..."
echo "Service will be available at: http://localhost:3002/health"
echo ""

# Run directly with tsx, which handles TypeScript without compilation
npx tsx src/index.ts