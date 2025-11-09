#!/bin/bash

echo "🔧 Setting up Prisma for Video Processor..."

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

echo ""
echo "✅ Prisma setup complete!"
echo ""
echo "The video processor now has access to the real database schema."
echo "No more mocks - using real data from videostacking_dev database!"