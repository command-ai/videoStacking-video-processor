#!/bin/bash

# Fix TypeScript Errors Script
# Run this script in the video-processor directory

echo "Fixing TypeScript compilation errors..."

# Install missing dependency
echo "Installing missing @aws-sdk/s3-request-presigner dependency..."
npm install @aws-sdk/s3-request-presigner

# Build the project
echo "Building the video processor..."
npm run build

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo "✅ Build successful! You can now run the video processor:"
    echo "   npm start"
else
    echo "❌ Build failed. Please check the error messages above."
fi