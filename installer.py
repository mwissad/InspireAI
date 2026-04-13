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
# MAGIC 2. Detects your SQL warehouse and pre-configures the app
# MAGIC 3. Uploads everything to your workspace files
# MAGIC 4. Creates and deploys a Databricks App
# MAGIC 5. Creates the Inspire tracking database
# MAGIC 6. Prints the app URL — ready to use with zero manual setup
# MAGIC
# MAGIC ---
# MAGIC **Prerequisites:** DBR 13.3+ · Unity Catalog enabled · Workspace admin permissions

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1 — Configuration

# COMMAND ----------

# Widgets with pre-filled defaults
dbutils.widgets.dropdown("install_source", "workspace", ["github", "zip", "workspace"], "1. Install Source")
dbutils.widgets.text("github_url", "https://github.com/mwissad/InspireAI.git", "2. GitHub Repository URL")
dbutils.widgets.text("github_branch", "main", "3. GitHub Branch")
dbutils.widgets.text("zip_path", "/Workspace/Users/me/InspireAI.zip", "4. Zip/Folder Path (if zip or workspace)")
dbutils.widgets.text("app_name", "inspire-ai", "5. App Name")
dbutils.widgets.text("catalog", "workspace", "6. Inspire Catalog")
dbutils.widgets.text("schema", "_inspire", "7. Inspire Schema")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2 — Setup & Validation

# COMMAND ----------

import os, shutil, time, json, subprocess
from pathlib import Path
from databricks.sdk import WorkspaceClient

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
WORKSPACE_HOST = w.config.host  # Full host URL with https://

# Directories/files to skip during upload
SKIP_DIRS  = {".git", "node_modules", ".venv", "__pycache__", ".claude", "docs", "notebooks", ".DS_Store"}
SKIP_PATHS = {"frontend/src", "frontend/public", "frontend/node_modules"}

# Detect SQL warehouse early — needed for app.yaml injection and database creation
warehouses = list(w.warehouses.list())
WAREHOUSE_ID = None
WAREHOUSE_NAME = None

for wh in warehouses:
    if wh.state and wh.state.value == "RUNNING":
        WAREHOUSE_ID = wh.id
        WAREHOUSE_NAME = wh.name
        break

if not WAREHOUSE_ID and warehouses:
    WAREHOUSE_ID = warehouses[0].id
    WAREHOUSE_NAME = warehouses[0].name

print("=" * 60)
print("  Inspire AI Installer — Configuration")
print("=" * 60)
print(f"  Install source:    {INSTALL_SOURCE}")
if INSTALL_SOURCE == "github":
    print(f"  GitHub URL:        {GITHUB_URL}")
    print(f"  GitHub Branch:     {GITHUB_BRANCH}")
elif INSTALL_SOURCE == "zip":
    print(f"  Zip path:          {ZIP_PATH}")
else:
    print(f"  Workspace folder:  {ZIP_PATH}")
print(f"  App name:          {APP_NAME}")
print(f"  Inspire database:  {INSPIRE_DB}")
print(f"  Workspace host:    {WORKSPACE_HOST}")
print(f"  Current user:      {USER_EMAIL}")
print(f"  Workspace dest:    {WORKSPACE_DEST}")
print(f"  SQL Warehouse:     {WAREHOUSE_NAME or 'None found'} ({WAREHOUSE_ID or 'N/A'})")
print("=" * 60)

# Validate
assert APP_NAME.strip(), "App name cannot be empty"
assert CATALOG.strip(), "Catalog cannot be empty"
assert SCHEMA.strip(), "Schema cannot be empty"
if INSTALL_SOURCE == "zip":
    assert os.path.exists(ZIP_PATH), f"Zip file not found at: {ZIP_PATH}"
elif INSTALL_SOURCE == "workspace":
    assert os.path.exists(ZIP_PATH), f"Workspace folder not found at: {ZIP_PATH}"

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

elif INSTALL_SOURCE == "workspace":
    print(f"Copying from workspace folder {ZIP_PATH} ...")
    shutil.copytree(ZIP_PATH, LOCAL_DIR, dirs_exist_ok=True)
    print(f"Copied to {LOCAL_DIR}")

# Quick sanity check
required_files = ["app.yaml", "start.sh", "backend/server.js"]
for f in required_files:
    fpath = os.path.join(LOCAL_DIR, f)
    assert os.path.exists(fpath), f"Missing required file: {f} — is this a valid Inspire AI repo?"

print("Source code ready. Key files verified.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4 — Inject Configuration into app.yaml

# COMMAND ----------

import yaml

app_yaml_path = os.path.join(LOCAL_DIR, "app.yaml")

with open(app_yaml_path, "r") as f:
    app_config = yaml.safe_load(f)

# Ensure env section exists
if "env" not in app_config or app_config["env"] is None:
    app_config["env"] = []

# Env vars to inject — these pre-fill the Setup Wizard so users skip manual config
inject_vars = {
    "NODE_ENV": "production",
    "INSPIRE_DATABASE": INSPIRE_DB,
}
if WAREHOUSE_ID:
    inject_vars["INSPIRE_WAREHOUSE_ID"] = WAREHOUSE_ID

# Update or append each env var
existing_names = {e["name"] for e in app_config["env"] if isinstance(e, dict) and "name" in e}

for name, value in inject_vars.items():
    if name in existing_names:
        for e in app_config["env"]:
            if isinstance(e, dict) and e.get("name") == name:
                e["value"] = value
                break
    else:
        app_config["env"].append({"name": name, "value": value})

# Write the modified app.yaml back
with open(app_yaml_path, "w") as f:
    yaml.dump(app_config, f, default_flow_style=False, sort_keys=False)

print("Injected into app.yaml:")
for name, value in inject_vars.items():
    print(f"  {name} = {value}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5 — Upload to Workspace

# COMMAND ----------

import requests, urllib.parse

# REST API helper — SDK-version-agnostic (needed for file uploads and app management)
api_base = w.config.host.rstrip("/")
api_headers = {}
try:
    auth_header = w.config.authenticate()
    if isinstance(auth_header, dict):
        api_headers = auth_header
    else:
        api_headers = {"Authorization": f"Bearer {auth_header}"}
except Exception:
    api_headers = {"Authorization": f"Bearer {dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiToken().get()}"}

def api_get(path):
    r = requests.get(f"{api_base}{path}", headers=api_headers)
    r.raise_for_status()
    return r.json()

def api_post(path, body=None):
    r = requests.post(f"{api_base}{path}", headers=api_headers, json=body or {})
    return r

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

if INSTALL_SOURCE == "workspace":
    # Files are already in the workspace — just point the deploy at the source folder.
    # We still need to inject app.yaml, so upload only the modified app.yaml.
    WORKSPACE_DEST = ZIP_PATH  # Deploy directly from the pre-uploaded folder
    print(f"Using existing workspace folder: {WORKSPACE_DEST}")
    print("Uploading modified app.yaml with injected config...")
    import base64
    app_yaml_workspace = f"{WORKSPACE_DEST}/app.yaml"
    with open(app_yaml_path, "rb") as f:
        content = f.read()
    try:
        put_resp = requests.post(
            f"{api_base}/api/2.0/workspace/import",
            headers=api_headers,
            json={
                "path": app_yaml_workspace,
                "content": base64.b64encode(content).decode("utf-8"),
                "overwrite": True,
                "format": "AUTO"
            }
        )
        put_resp.raise_for_status()
        print(f"  Updated {app_yaml_workspace}")
    except Exception as e:
        print(f"  Warning: Could not update app.yaml ({e}). Config may need manual setup.")
else:
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
                # Use the Import REST API with AUTO format for arbitrary files.
                import base64
                put_resp = requests.post(
                    f"{api_base}/api/2.0/workspace/import",
                    headers=api_headers,
                    json={
                        "path": workspace_path,
                        "content": base64.b64encode(content).decode("utf-8"),
                        "overwrite": True,
                        "format": "AUTO"
                    }
                )
                put_resp.raise_for_status()
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
# MAGIC ## Step 6 — Create Databricks App

# COMMAND ----------

# Check if app already exists
app_exists = False
app_url = None

try:
    resp = api_get(f"/api/2.0/apps/{APP_NAME}")
    app_exists = True
    app_url = resp.get("url")
    print(f"App '{APP_NAME}' already exists: {app_url}")
    print("Will redeploy with updated source code.")
except Exception:
    pass

if not app_exists:
    print(f"Creating app '{APP_NAME}'...")
    resp = api_post("/api/2.0/apps", {"name": APP_NAME, "description": "Inspire AI — Data Strategy Copilot powered by Databricks"})
    if resp.status_code in (200, 201):
        data = resp.json()
        app_url = data.get("url")
        print(f"App created: {app_url}")
    elif "already exists" in resp.text.lower():
        data = api_get(f"/api/2.0/apps/{APP_NAME}")
        app_exists = True
        app_url = data.get("url")
        print(f"App '{APP_NAME}' already exists: {app_url}")
    else:
        raise RuntimeError(f"Failed to create app ({resp.status_code}): {resp.text[:500]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 7 — Wait for App Compute

# COMMAND ----------

print("Waiting for app compute to become ACTIVE...")

timeout = 300  # 5 minutes
start_time = time.time()

while True:
    data = api_get(f"/api/2.0/apps/{APP_NAME}")
    state = data.get("compute_status", {}).get("state", "UNKNOWN")
    elapsed = int(time.time() - start_time)
    print(f"  [{elapsed}s] Compute state: {state}")

    if state == "ACTIVE":
        app_url = data.get("url", app_url)
        print("Compute is ACTIVE.")
        break

    if elapsed > timeout:
        raise TimeoutError(f"App compute did not become ACTIVE within {timeout}s (current: {state})")

    time.sleep(10)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 8 — Deploy

# COMMAND ----------

print(f"Deploying '{APP_NAME}' from {WORKSPACE_DEST} ...")

resp = api_post(f"/api/2.0/apps/{APP_NAME}/deployments", {"source_code_path": WORKSPACE_DEST})
if resp.status_code not in (200, 201):
    raise RuntimeError(f"Deploy failed ({resp.status_code}): {resp.text[:500]}")

deploy_data = resp.json()
deploy_id = deploy_data.get("deployment_id", "")
print(f"Deployment started (ID: {deploy_id}). Waiting for completion...")

timeout = 300
start_time = time.time()

while True:
    data = api_get(f"/api/2.0/apps/{APP_NAME}")

    # Check pending_deployment first (in-progress), then fall back to active_deployment (completed)
    pending_dep = data.get("pending_deployment", {})
    active_dep = data.get("active_deployment", {})

    # Use the deployment matching our deploy_id, preferring pending
    if pending_dep.get("deployment_id") == deploy_id:
        dep = pending_dep
    elif active_dep.get("deployment_id") == deploy_id:
        dep = active_dep
    elif pending_dep:
        dep = pending_dep
    else:
        dep = active_dep

    dep_state = dep.get("status", {}).get("state", "UNKNOWN")
    dep_msg = dep.get("status", {}).get("message", "")
    elapsed = int(time.time() - start_time)
    print(f"  [{elapsed}s] Deployment state: {dep_state}")

    if dep_state == "SUCCEEDED":
        app_url = data.get("url", app_url)
        print("Deployment succeeded.")
        break
    elif dep_state in ("FAILED", "CANCELLED"):
        raise RuntimeError(f"Deployment failed ({dep_state}): {dep_msg}")

    if elapsed > timeout:
        raise TimeoutError(f"Deployment did not complete within {timeout}s")

    time.sleep(10)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 9 — Create Inspire Database

# COMMAND ----------

from databricks.sdk.service.sql import StatementState

if WAREHOUSE_ID:
    sql = f"CREATE SCHEMA IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`"
    print(f"Executing: {sql}")

    stmt = w.statement_execution.execute_statement(
        warehouse_id=WAREHOUSE_ID,
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
app_data = api_get(f"/api/2.0/apps/{APP_NAME}")
app_url = app_data.get("url", app_url)

print("=" * 60)
print("  Inspire AI — Installation Complete")
print("=" * 60)
print()
print(f"  App URL:           {app_url}")
print(f"  Workspace Host:    {WORKSPACE_HOST}")
print(f"  Inspire Database:  {INSPIRE_DB}")
if WAREHOUSE_ID:
    print(f"  SQL Warehouse:     {WAREHOUSE_NAME} ({WAREHOUSE_ID})")
print()
print("  Pre-configured:")
print(f"    Workspace host .... injected by Databricks runtime")
print(f"    SQL Warehouse ..... {WAREHOUSE_ID or 'not set — select in Settings'}")
print(f"    Inspire Database .. {INSPIRE_DB}")
print(f"    Notebook .......... auto-published on first launch")
print()
print("  Next steps:")
print("  1. Open the app URL above")
print("  2. Enter your Personal Access Token (PAT) in the Setup Wizard")
print("  3. Everything else is pre-configured — click through to launch!")
print()
print("=" * 60)

# Display clickable link
displayHTML(f"""
<div style="padding: 24px; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px; text-align: center; margin: 20px 0;">
  <h2 style="color: #e0e0e0; margin-bottom: 8px;">Inspire AI is ready!</h2>
  <p style="color: #aaa; font-size: 13px; margin-bottom: 20px;">
    Warehouse, database, and notebook are pre-configured.<br/>
    Just open the app and enter your PAT to get started.
  </p>
  <a href="{app_url}" target="_blank"
     style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #ff6b35, #f7931e);
            color: white; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600;
            box-shadow: 0 4px 15px rgba(255, 107, 53, 0.3);">
    Open Inspire AI
  </a>
  <p style="color: #666; margin-top: 14px; font-size: 12px;">{app_url}</p>
  <div style="margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; text-align: left; font-family: monospace; font-size: 11px; color: #888;">
    <div>Warehouse: <span style="color: #4ec9b0;">{WAREHOUSE_NAME or 'N/A'}</span></div>
    <div>Database: <span style="color: #4ec9b0;">{INSPIRE_DB}</span></div>
    <div>Notebook: <span style="color: #4ec9b0;">auto-published on first launch</span></div>
  </div>
</div>
""")
