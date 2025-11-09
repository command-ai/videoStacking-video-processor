#!/bin/bash

echo "Checking TypeScript compilation..."

# Check what files TypeScript sees
echo "Files TypeScript is processing:"
npx tsc --listFiles | grep -E "(index|processor|ffmpeg)" | head -10

echo ""
echo "Checking for compilation errors:"
npx tsc --noEmit

echo ""
echo "Checking dist directory:"
ls -la dist/

echo ""
echo "Attempting direct compilation of index.ts:"
npx tsc src/index.ts --outDir dist --module ES2022 --target ES2022 --esModuleInterop true