#!/usr/bin/env bash
# Build frontend (optional) and create InspireAI-workspace.zip for `npm run deploy` / deploy:inspire.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_BUILD="${SKIP_BUILD:-0}"
if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> Building frontend (set SKIP_BUILD=1 to skip)"
  (cd frontend && npm run build)
fi

mkdir -p "$ROOT/dist"
OUT="${ARTIFACT_ZIP:-$ROOT/dist/InspireAI-workspace.zip}"
rm -f "$OUT"

echo "==> Zipping to $OUT"

# Exclusions mirror a lean Apps deploy (small zip for 10MB workspace import limit).
zip -r "$OUT" . \
  -x "*.git/*" \
  -x "*/*/.git/*" \
  -x "*/node_modules/*" \
  -x "*/.venv/*" \
  -x "*/*/__pycache__/*" \
  -x "*mypy_cache*" \
  -x ".databricks/*" \
  -x ".databricks/*/*" \
  -x ".databricks/*/*/*" \
  -x ".claude/*" \
  -x ".claude/*/*" \
  -x ".claude/*/*/*" \
  -x "./docs/*" \
  -x "*.dbc" \
  -x "./notebooks/*" \
  -x "./dist/*" \
  -x "./.DS_Store" \
  -x "./frontend/node_modules/*" \
  -x "./frontend/src/*" \
  -x "./frontend/public/*" \
  -x "./dist/InspireAI-workspace.zip" \
  -x "./.env" \
  -x "./.env.*" \
  -x "*/.env" \
  -x "*/.env.*"

echo "==> Done: $OUT ($(du -h "$OUT" | awk '{print $1}'))"
