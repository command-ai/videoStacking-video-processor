#!/bin/bash

echo "🖼️  Creating test images for video generation..."

# Create test assets directory
mkdir -p test-assets/test

# Generate test images using ImageMagick or ffmpeg
if command -v convert &> /dev/null; then
    echo "Using ImageMagick to create test images..."
    
    # Create test image 1 - Red
    convert -size 1920x1080 xc:red -gravity center -pointsize 100 -fill white -annotate +0+0 "Test Image 1" test-assets/test/image1.jpg
    
    # Create test image 2 - Blue
    convert -size 1920x1080 xc:blue -gravity center -pointsize 100 -fill white -annotate +0+0 "Test Image 2" test-assets/test/image2.jpg
    
    # Create test image 3 - Green
    convert -size 1920x1080 xc:green -gravity center -pointsize 100 -fill white -annotate +0+0 "Test Image 3" test-assets/test/image3.jpg
    
elif command -v ffmpeg &> /dev/null; then
    echo "Using FFmpeg to create test images..."
    
    # Create test image 1 - Red
    ffmpeg -f lavfi -i color=red:s=1920x1080:d=1 -frames:v 1 test-assets/test/image1.jpg -y
    
    # Create test image 2 - Blue  
    ffmpeg -f lavfi -i color=blue:s=1920x1080:d=1 -frames:v 1 test-assets/test/image2.jpg -y
    
    # Create test image 3 - Green
    ffmpeg -f lavfi -i color=green:s=1920x1080:d=1 -frames:v 1 test-assets/test/image3.jpg -y
    
else
    echo "❌ Neither ImageMagick nor FFmpeg found. Creating placeholder files..."
    touch test-assets/test/image1.jpg
    touch test-assets/test/image2.jpg
    touch test-assets/test/image3.jpg
fi

echo ""
echo "✅ Test images created in: test-assets/test/"
ls -la test-assets/test/

echo ""
echo "Next: The video processor will use these images for testing"