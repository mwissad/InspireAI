# Databricks notebook source

# MAGIC %md
# MAGIC # Inspire AI — Installer
# MAGIC
# MAGIC This notebook installs and deploys **Inspire AI v4.6** as a Databricks App in your workspace.
# MAGIC
# MAGIC **Two installation sources:**
# MAGIC - **GitHub** — clones directly from the public repository
# MAGIC - **Zip** — uses a zip file you uploaded to your workspace
# MAGIC
# MAGIC **What this installer does:**
# MAGIC 1. Downloads the Inspire AI source code
# MAGIC 2. Uploads it to your workspace files
# MAGIC 3. Creates and deploys a Databricks App
# MAGIC 4. Creates the Inspire tracking database
# MAGIC 5. Prints the app URL — ready to use
# MAGIC
# MAGIC ---
# MAGIC **Prerequisites:** DBR 13.3+ · Unity Catalog enabled · Workspace admin permissions

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1 — Configuration

# COMMAND ----------

# Widgets with pre-filled defaults
dbutils.widgets.dropdown("install_source", "github", ["github", "zip"], "1. Install Source")
dbutils.widgets.text("github_url", "https://github.com/mwissad/InspireAI.git", "2. GitHub Repository URL")
dbutils.widgets.text("github_branch", "main", "3. GitHub Branch")
dbutils.widgets.text("zip_path", "/Workspace/Users/me/InspireAI.zip", "4. Zip File Path (if zip)")
dbutils.widgets.text("app_name", "inspire-ai", "5. App Name")
dbutils.widgets.text("catalog", "workspace", "6. Inspire Catalog")
dbutils.widgets.text("schema", "_inspire", "7. Inspire Schema")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2 — Setup & Validation

# COMMAND ----------

import os, shutil, time, json, base64, subprocess, tempfile
from pathlib import Path
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.workspace import ImportFormat

# Read widget values
INSTALL_SOURCE = dbutils.widgets.get("install_source")
GITHUB_URL     = dbutils.widgets.get("github_url")
GITHUB_BRANCH  = dbutils.widgets.get("github_branch")
ZIP_PATH       = dbutils.widgets.get("zip_path")
APP_NAME       = dbutils.widgets.get("app_name")
CATALOG        = dbutils.widgets.get("catalog")
SCHEMA         = dbutils.widgets.get("schema")

# Derived values
INSPIRE_DB = f"{CATALOG}.{SCHEMA}"
LOCAL_DIR  = "/tmp/inspire_install"
w          = WorkspaceClient()
current_user = w.current_user.me()
USER_EMAIL   = current_user.user_name
WORKSPACE_DEST = f"/Workspace/Users/{USER_EMAIL}/{APP_NAME}"

# Directories/files to skip during upload
SKIP_DIRS  = {".git", "node_modules", ".venv", "__pycache__", ".claude", "docs", "notebooks", ".DS_Store"}
SKIP_PATHS = {"frontend/src", "frontend/public", "frontend/node_modules"}

print("=" * 60)
print("  Inspire AI Installer — Configuration")
print("=" * 60)
print(f"  Install source:    {INSTALL_SOURCE}")
if INSTALL_SOURCE == "github":
    print(f"  GitHub URL:        {GITHUB_URL}")
    print(f"  GitHub Branch:     {GITHUB_BRANCH}")
else:
    print(f"  Zip path:          {ZIP_PATH}")
print(f"  App name:          {APP_NAME}")
print(f"  Inspire database:  {INSPIRE_DB}")
print(f"  Current user:      {USER_EMAIL}")
print(f"  Workspace dest:    {WORKSPACE_DEST}")
print("=" * 60)

# Validate
assert APP_NAME.strip(), "App name cannot be empty"
assert CATALOG.strip(), "Catalog cannot be empty"
assert SCHEMA.strip(), "Schema cannot be empty"
if INSTALL_SOURCE == "zip":
    assert os.path.exists(ZIP_PATH), f"Zip file not found at: {ZIP_PATH}"

print("\n  Validation passed.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3 — Get Source Code

# COMMAND ----------

# Clean up any previous install
if os.path.exists(LOCAL_DIR):
    shutil.rmtree(LOCAL_DIR)
os.makedirs(LOCAL_DIR, exist_ok=True)

if INSTALL_SOURCE == "github":
    print(f"Cloning {GITHUB_URL} (branch: {GITHUB_BRANCH})...")
    result = subprocess.run(
        ["git", "clone", "--depth", "1", "--branch", GITHUB_BRANCH, GITHUB_URL, LOCAL_DIR],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        print(f"STDERR: {result.stderr}")
        raise RuntimeError(f"Git clone failed (exit {result.returncode}): {result.stderr}")
    print(f"Cloned successfully to {LOCAL_DIR}")

elif INSTALL_SOURCE == "zip":
    import zipfile
    print(f"Extracting {ZIP_PATH}...")
    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        zf.extractall(LOCAL_DIR)

    # Handle GitHub-style zips that have a top-level directory (e.g. InspireAI-main/)
    entries = os.listdir(LOCAL_DIR)
    if len(entries) == 1 and os.path.isdir(os.path.join(LOCAL_DIR, entries[0])):
        nested = os.path.join(LOCAL_DIR, entries[0])
        tmp_move = LOCAL_DIR + "_tmp"
        shutil.move(nested, tmp_move)
        shutil.rmtree(LOCAL_DIR)
        shutil.move(tmp_move, LOCAL_DIR)
        print(f"Unwrapped nested directory: {entries[0]}/")

    print(f"Extracted to {LOCAL_DIR}")

# Quick sanity check
required_files = ["app.yaml", "start.sh", "backend/server.js"]
for f in required_files:
    fpath = os.path.join(LOCAL_DIR, f)
    assert os.path.exists(fpath), f"Missing required file: {f} — is this a valid Inspire AI repo?"

print(f"Source code ready. Key files verified.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4 — Upload to Workspace

# COMMAND ----------

def should_skip(rel_path: str) -> bool:
    """Check if a file should be skipped during upload."""
    parts = rel_path.split("/")
    for part in parts:
        if part in SKIP_DIRS:
            return True
    for skip in SKIP_PATHS:
        if rel_path.startswith(skip):
            return True
    return False

# Walk the local directory and upload each file
uploaded = 0
skipped = 0
errors = []

print(f"Uploading to {WORKSPACE_DEST} ...")

# Create the destination directory
try:
    w.workspace.mkdirs(WORKSPACE_DEST)
except Exception:
    pass  # May already exist

for root, dirs, files in os.walk(LOCAL_DIR):
    # Filter out skip directories in-place to prevent descending into them
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

    for filename in files:
        local_path = os.path.join(root, filename)
        rel_path = os.path.relpath(local_path, LOCAL_DIR)

        if should_skip(rel_path):
            skipped += 1
            continue

        workspace_path = f"{WORKSPACE_DEST}/{rel_path}"

        try:
            with open(local_path, "rb") as f:
                content = f.read()
            w.workspace.upload(workspace_path, content, overwrite=True)
            uploaded += 1
        except Exception as e:
            errors.append((rel_path, str(e)))

print(f"\nUploaded: {uploaded} files")
print(f"Skipped:  {skipped} files")
if errors:
    print(f"Errors:   {len(errors)}")
    for path, err in errors[:5]:
        print(f"  - {path}: {err}")
else:
    print("No errors.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5 — Create Databricks App

# COMMAND ----------

from databricks.sdk.service.apps import App

# Check if app already exists
app_exists = False
app_url = None

try:
    existing = w.apps.get(APP_NAME)
    app_exists = True
    app_url = existing.url
    print(f"App '{APP_NAME}' already exists: {app_url}")
    print("Will redeploy with updated source code.")
except Exception:
    pass

if not app_exists:
    print(f"Creating app '{APP_NAME}'...")
    try:
        app = w.apps.create_and_wait(
            name=APP_NAME,
            description="Inspire AI — Data Strategy Copilot powered by Databricks"
        )
        app_url = app.url
        print(f"App created: {app_url}")
    except Exception as e:
        error_msg = str(e)
        if "already exists" in error_msg.lower():
            existing = w.apps.get(APP_NAME)
            app_exists = True
            app_url = existing.url
            print(f"App '{APP_NAME}' already exists: {app_url}")
        else:
            raise RuntimeError(f"Failed to create app: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 6 — Wait for App Compute

# COMMAND ----------

print(f"Waiting for app compute to become ACTIVE...")

timeout = 300  # 5 minutes
start_time = time.time()

while True:
    app_info = w.apps.get(APP_NAME)
    state = app_info.compute_status.state.value if app_info.compute_status else "UNKNOWN"
    elapsed = int(time.time() - start_time)
    print(f"  [{elapsed}s] Compute state: {state}")

    if state == "ACTIVE":
        print("Compute is ACTIVE.")
        break

    if elapsed > timeout:
        raise TimeoutError(f"App compute did not become ACTIVE within {timeout}s (current: {state})")

    time.sleep(10)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7 — Deploy

# COMMAND ----------

from databricks.sdk.service.apps import AppDeployment

print(f"Deploying '{APP_NAME}' from {WORKSPACE_DEST} ...")

deployment = w.apps.deploy_and_wait(
    app_name=APP_NAME,
    source_code_path=WORKSPACE_DEST
)

deploy_state = deployment.status.state.value if deployment.status else "UNKNOWN"
print(f"Deployment status: {deploy_state}")

if deploy_state != "SUCCEEDED":
    msg = deployment.status.message if deployment.status else "No message"
    raise RuntimeError(f"Deployment failed ({deploy_state}): {msg}")

print(f"Deployment succeeded.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8 — Create Inspire Database

# COMMAND ----------

from databricks.sdk.service.sql import StatementState

# Find a SQL warehouse
warehouses = list(w.warehouses.list())
warehouse_id = None

# Prefer a running serverless warehouse
for wh in warehouses:
    if wh.state and wh.state.value == "RUNNING":
        warehouse_id = wh.id
        print(f"Using warehouse: {wh.name} ({wh.id}) — RUNNING")
        break

# Fall back to any warehouse (will auto-start)
if not warehouse_id and warehouses:
    wh = warehouses[0]
    warehouse_id = wh.id
    print(f"Using warehouse: {wh.name} ({wh.id}) — will auto-start")

if warehouse_id:
    sql = f"CREATE SCHEMA IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`"
    print(f"Executing: {sql}")

    stmt = w.statement_execution.execute_statement(
        warehouse_id=warehouse_id,
        statement=sql,
        wait_timeout="30s"
    )

    if stmt.status and stmt.status.state in (StatementState.SUCCEEDED,):
        print(f"Schema {INSPIRE_DB} is ready.")
    else:
        error = stmt.status.error if stmt.status else None
        print(f"Warning: Schema creation returned state={stmt.status.state if stmt.status else 'UNKNOWN'}")
        if error:
            print(f"  Error: {error.message}")
        print("You can create it manually from the app's Settings page.")
else:
    print("No SQL warehouse found. Skipping database creation.")
    print(f"Create the schema manually: CREATE SCHEMA IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Done!

# COMMAND ----------

# Refresh app info to get the final URL
app_info = w.apps.get(APP_NAME)
app_url = app_info.url

print("=" * 60)
print("  Inspire AI — Installation Complete")
print("=" * 60)
print()
print(f"  App URL:           {app_url}")
print(f"  Inspire Database:  {INSPIRE_DB}")
if warehouse_id:
    print(f"  SQL Warehouse:     {warehouse_id}")
print()
print("  Next steps:")
print("  1. Open the app URL above")
print("  2. Click the Settings gear icon")
print("  3. Enter your Personal Access Token (PAT)")
print("  4. Select a SQL Warehouse from the dropdown")
print(f"  5. Set Inspire Database to: {INSPIRE_DB}")
print("  6. Click 'Get Started' and launch your first analysis!")
print()
print("=" * 60)

# Display clickable link
displayHTML(f"""
<div style="padding: 20px; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px; text-align: center; margin: 20px 0;">
  <h2 style="color: #e0e0e0; margin-bottom: 16px;">Inspire AI is ready!</h2>
  <a href="{app_url}" target="_blank"
     style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #ff6b35, #f7931e);
            color: white; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600;">
    Open Inspire AI
  </a>
  <p style="color: #888; margin-top: 12px; font-size: 14px;">{app_url}</p>
</div>
""")
