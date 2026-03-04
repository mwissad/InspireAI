#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
#  Inspire AI — Production Startup Script
#  Used by Databricks App (app.yaml) or manual deploy
# ═══════════════════════════════════════════════════

set -e

echo "🚀 Inspire AI — Starting..."

# Install backend dependencies if needed
if [ ! -d "backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  cd backend && npm install --production && cd ..
fi

# Install frontend dependencies & build if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
  echo "📦 Installing frontend dependencies..."
  cd frontend && npm install && echo "🔨 Building frontend..." && npm run build && cd ..
fi

echo "✅ Starting server..."
export NODE_ENV=production
exec node backend/server.js
