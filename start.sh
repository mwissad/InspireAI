#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Inspire AI — Production Startup Script
#  Used by Databricks App runtime (app.yaml → command: bash start.sh)
#
#  This script is designed to work out-of-the-box when Databricks
#  clones the repo via git-backed Apps. It:
#    1. Checks for Node.js (pre-installed in Databricks App runtime)
#    2. Installs backend dependencies (if not present)
#    3. Verifies the frontend build exists
#    4. Starts the Express server
# ═══════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════"
echo "  Inspire AI — Starting..."
echo "════════════════════════════════════════════════"
echo "  Working directory: $(pwd)"
echo "  Node: $(node --version 2>/dev/null || echo 'NOT FOUND')"
echo "  NPM:  $(npm --version 2>/dev/null || echo 'NOT FOUND')"
echo "  Port: ${PORT:-8080}"
echo "════════════════════════════════════════════════"

# ─── 1. Check Node.js ───
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed."
  echo "The Databricks App runtime should include Node.js."
  echo "If running locally, install Node.js 18+ first."
  exit 1
fi

# ─── 2. Install backend dependencies ───
if [ ! -d "backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  if (cd backend && npm ci --omit=dev --no-audit --no-fund 2>&1); then
    echo "✅ Dependencies installed."
  else
    echo "❌ npm install failed — retrying with --legacy-peer-deps..."
    (cd backend && npm install --omit=dev --no-audit --no-fund --legacy-peer-deps 2>&1) || {
      echo "❌ ERROR: Failed to install backend dependencies."
      exit 1
    }
    echo "✅ Dependencies installed (retry succeeded)."
  fi
else
  echo "✅ Backend dependencies found."
fi

# ─── 3. Verify frontend build ───
if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
  echo "✅ Frontend build found."
else
  echo "⚠️  WARNING: frontend/dist not found."
  echo "   The app will run API-only without a UI."
  echo "   To fix: cd frontend && npm install && npm run build"
fi

# ─── 4. Verify DBC notebook bundle ───
if [ -f "databricks_inspire_v46.dbc" ] || [ -f "backend/dbc_bundle.js" ]; then
  echo "✅ Notebook bundle found."
else
  echo "⚠️  WARNING: No DBC notebook found. Publish feature will be unavailable."
fi

# ─── 5. Show Databricks connection info ───
if [ -n "$DATABRICKS_HOST" ]; then
  echo "✅ Databricks Host: $DATABRICKS_HOST"
else
  echo "ℹ️  DATABRICKS_HOST not set — users will configure via the Settings page."
fi

if [ -n "$DATABRICKS_TOKEN" ]; then
  echo "✅ Service token available."
else
  echo "ℹ️  No service token — users will authenticate with their own PAT."
fi

echo ""
echo "🚀 Starting Inspire AI on port ${PORT:-8080}..."
echo "════════════════════════════════════════════════"

export NODE_ENV=production
exec node backend/server.js
