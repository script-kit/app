#!/bin/bash
# Script Kit Grid Fixes - Initialization Script
# Run this at the start of each agent session

set -e

echo "🚀 Initializing Script Kit Grid Fixes..."

# Install dependencies if needed
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run: cd /Users/johnlindquist/dev/kit-container/app && pnpm i
cd /Users/johnlindquist/dev/kit-container/app && pnpm i

echo "✅ Environment ready!"
