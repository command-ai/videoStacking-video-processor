#!/bin/bash

# Build and Run Video Processor Script

echo "🔨 Building video processor..."

# Clean previous build
rm -rf dist

# Build TypeScript
npm run build

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "📦 Starting video processor service..."
    echo ""
    
    # Start the service
    npm start
else
    echo "❌ Build failed. Please check the TypeScript errors above."
    exit 1
fi