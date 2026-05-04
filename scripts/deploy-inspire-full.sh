#!/usr/bin/env bash
# Full deploy: build + zip → delete old workspace copy → import latest zip + installer →
# run installer_workspace.py as a one-time Job (needs a RUNNING cluster, or INSPIRE_DEPLOY_CLUSTER_ID).
#
# Prereqs: Databricks CLI, .env with DATABRICKS_HOST + DATABRICKS_TOKEN (or DATABRICKS_CONFIG_PROFILE with valid auth).
# Optional: INSPIRE_DEPLOY_CLUSTER_ID=<all-purpose cluster id>
#
# Usage: npm run deploy   (alias for deploy:inspire)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

if [[ -n "${DATABRICKS_CONFIG_PROFILE:-}" ]]; then
  DB=( databricks -p "$DATABRICKS_CONFIG_PROFILE" )
else
  DB=( databricks )
fi

if [[ -z "${DATABRICKS_CONFIG_PROFILE:-}" && ( -z "${DATABRICKS_HOST:-}" || -z "${DATABRICKS_TOKEN:-}" ) ]]; then
  echo "Set DATABRICKS_HOST + DATABRICKS_TOKEN in .env, or set DATABRICKS_CONFIG_PROFILE."
  exit 1
fi

echo "==> 1) Package (frontend build + InspireAI-workspace.zip)"
bash "$ROOT/scripts/package-for-workspace.sh"

USER_EMAIL="$( "${DB[@]}" current-user me -o json | python3 -c "import json,sys; print(json.load(sys.stdin)['userName'])")"
INSPIRE_DIR="/Workspace/Users/${USER_EMAIL}/InspireAI"
ZIP_REMOTE="/Workspace/Users/${USER_EMAIL}/InspireAI-workspace.zip"
NB_REMOTE="/Workspace/Users/${USER_EMAIL}/InspireAI_workspace_installer"

echo "==> 2) Remove prior deployed source tree (clean slate)"
"${DB[@]}" workspace delete "$INSPIRE_DIR" --recursive 2>/dev/null || true
# Remove import targets too: AUTO import may leave a folder named InspireAI-workspace (no .zip).
ZIP_STEM="/Workspace/Users/${USER_EMAIL}/InspireAI-workspace"
"${DB[@]}" workspace delete "$ZIP_STEM" --recursive 2>/dev/null || true
"${DB[@]}" workspace delete "$ZIP_REMOTE" --recursive 2>/dev/null || true
"${DB[@]}" workspace delete "$NB_REMOTE" --recursive 2>/dev/null || true

echo "==> 3) Import latest zip + installer_workspace.py"
"${DB[@]}" workspace import "$ZIP_REMOTE" --file "$ROOT/dist/InspireAI-workspace.zip" --format AUTO --overwrite
"${DB[@]}" workspace import "$NB_REMOTE" --file "$ROOT/installer_workspace.py" --format SOURCE --language PYTHON --overwrite

echo "==> 4) Submit one-time job: run installer notebook"
CLUSTER_ID="${INSPIRE_DEPLOY_CLUSTER_ID:-}"
if [[ -z "$CLUSTER_ID" ]]; then
  CLUSTER_ID="$( "${DB[@]}" clusters list -o json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for c in d.get('clusters') or []:
    if c.get('state') == 'RUNNING':
        cid = c.get('cluster_id')
        if cid:
            print(cid)
            sys.exit(0)
sys.exit(1)
" 2>/dev/null)" || CLUSTER_ID=""
fi

if [[ -z "$CLUSTER_ID" ]]; then
  echo ""
  echo "No RUNNING cluster found. Start an all-purpose cluster, or set:"
  echo "  INSPIRE_DEPLOY_CLUSTER_ID=<cluster_id>"
  echo "Then re-run: npm run deploy"
  echo ""
  echo "Zip + notebook are already uploaded. You can open the notebook on Serverless and Run All:"
  echo "  ${NB_REMOTE}"
  exit 2
fi

export SUBMIT_JSON="$(mktemp)"
export NB_REMOTE CLUSTER_ID
python3 <<'PY'
import json, os
path = os.environ["SUBMIT_JSON"]
nb = os.environ["NB_REMOTE"]
cluster = os.environ["CLUSTER_ID"]
with open(path, "w") as f:
    json.dump({
        "run_name": "inspire-workspace-installer",
        "tasks": [{
            "task_key": "installer",
            "existing_cluster_id": cluster,
            "notebook_task": {"notebook_path": nb},
        }],
    }, f)
PY

"${DB[@]}" jobs submit --json "@${SUBMIT_JSON}" --timeout 45m --run-name "inspire-install-$(date +%s)"
rm -f "$SUBMIT_JSON"

echo ""
echo "==> Done. When the run succeeds: Compute → Apps → inspire-ai (hard refresh)."
