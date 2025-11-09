#!/bin/bash

# Fix TypeScript errors in video-processor

echo "🔧 Fixing TypeScript errors..."

# 1. Update tsconfig.json to allow synthetic imports
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# 2. Install missing dependency
npm install @aws-sdk/s3-request-presigner

# 3. Try building again
npm run build

echo "✅ Fixes applied. If build still fails, run: npm start"