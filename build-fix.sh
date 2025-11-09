#!/bin/bash

echo "🧹 Cleaning build artifacts..."
rm -rf dist
rm -f tsconfig.tsbuildinfo

echo "📂 Creating dist directory..."
mkdir -p dist

echo "🔨 Building TypeScript files..."
# Build all TypeScript files explicitly
npx tsc --project . --outDir dist

echo ""
echo "📋 Checking what was built:"
find dist -name "*.js" -type f | sort

echo ""
echo "🔍 Looking for index.js:"
if [ -f "dist/index.js" ]; then
    echo "✅ Found dist/index.js"
else
    echo "❌ dist/index.js not found"
    
    # Try alternative build approach
    echo ""
    echo "🔧 Trying alternative build..."
    npx tsc src/index.ts src/**/*.ts --outDir dist --module ES2022 --target ES2022 --esModuleInterop true --allowSyntheticDefaultImports true --resolveJsonModule true --skipLibCheck true
fi

echo ""
echo "📂 Final dist contents:"
ls -la dist/