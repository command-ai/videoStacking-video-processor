#!/bin/bash
# Script to copy core FFMPEG files to video processor

# Source directory (relative to video-processor)
CORE_DIR="../core"
# Destination directory
DEST_DIR="src/core"

echo "Starting core files integration..."

# Create destination directory if it doesn't exist
mkdir -p $DEST_DIR

# Copy core JavaScript files
echo "Copying VideoGenerator.js..."
cp $CORE_DIR/VideoGenerator.js $DEST_DIR/
echo "Copying FFmpegRenderer.js..."
cp $CORE_DIR/FFmpegRenderer.js $DEST_DIR/
echo "Copying MathematicalSizing.js..."
cp $CORE_DIR/MathematicalSizing.js $DEST_DIR/
echo "Copying ImageHandlingModes.js..."
cp $CORE_DIR/ImageHandlingModes.js $DEST_DIR/

# Copy templates directory if it exists
if [ -d "../templates" ]; then
  echo "Copying templates directory..."
  mkdir -p src/templates
  cp -r ../templates/* src/templates/
fi

echo "Core FFMPEG files copied successfully!"
echo "Files copied to: $DEST_DIR"
ls -la $DEST_DIR