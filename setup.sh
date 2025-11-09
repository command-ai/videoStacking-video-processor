#!/bin/bash

# Video Processor Setup Script

echo "Setting up Video Processor Service..."

# Install dependencies
echo "Installing npm dependencies..."
npm install

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please update .env with your configuration values"
fi

# Build the project
echo "Building TypeScript..."
npm run build

echo ""
echo "Setup complete! Next steps:"
echo "1. Update .env with your configuration"
echo "2. Ensure DATABASE_URL matches VideoStacking"
echo "3. Run 'npm run dev' to start development server"
echo "4. Run 'railway init' to initialize Railway deployment"