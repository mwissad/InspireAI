#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
#  Inspire AI — Production Startup Script
#  Used by Databricks App (app.yaml)
# ═══════════════════════════════════════════════════

set -e

echo "Inspire AI — Starting..."
echo "Working directory: $(pwd)"
echo "Node version: $(node --version 2>/dev/null || echo 'not found')"
echo "NPM version: $(npm --version 2>/dev/null || echo 'not found')"

# Install backend dependencies if needed
if [ ! -d "backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  cd backend && npm install --production && cd ..
fi

# Check if frontend/dist exists
if [ -d "frontend/dist" ]; then
  echo "Frontend dist found: $(ls frontend/dist/)"
else
  echo "WARNING: frontend/dist not found. The app will run without a frontend."
  echo "To fix, build the frontend locally and redeploy."
fi

echo "Starting server on port ${PORT:-8080}..."
export NODE_ENV=production
exec node backend/server.js
