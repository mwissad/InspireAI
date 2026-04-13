# Databricks notebook source

# MAGIC %md
# MAGIC # Inspire AI — Workspace Installer
# MAGIC
# MAGIC Deploys **Inspire AI** from a folder already uploaded to your workspace.
# MAGIC
# MAGIC **Steps:**
# MAGIC 1. Upload / unzip InspireAI into your workspace (e.g. drag-and-drop)
# MAGIC 2. Run this notebook — it auto-detects your folder and deploys
# MAGIC
# MAGIC ---
# MAGIC **Prerequisites:** DBR 13.3+ · Unity Catalog enabled

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

import os, time, json, requests
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()
current_user = w.current_user.me()
USER_EMAIL = current_user.user_name
WORKSPACE_HOST = w.config.host

# Auto-detect the source folder
DEFAULT_SOURCE = f"/Workspace/Users/{USER_EMAIL}/InspireAI-main"

dbutils.widgets.text("source_folder", DEFAULT_SOURCE, "1. Source Folder")
dbutils.widgets.text("app_name", "inspire-ai", "2. App Name")
dbutils.widgets.text("catalog", "workspace", "3. Catalog")
dbutils.widgets.text("schema", "_inspire", "4. Schema")

SOURCE_FOLDER = dbutils.widgets.get("source_folder")
APP_NAME = dbutils.widgets.get("app_name")
CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
INSPIRE_DB = f"{CATALOG}.{SCHEMA}"

# REST API setup
api_base = WORKSPACE_HOST.rstrip("/")
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

# Detect SQL warehouse
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

# Validate
assert os.path.exists(SOURCE_FOLDER), f"Source folder not found: {SOURCE_FOLDER}"
assert os.path.exists(f"{SOURCE_FOLDER}/app.yaml"), f"No app.yaml in {SOURCE_FOLDER} — is this the right folder?"
assert os.path.exists(f"{SOURCE_FOLDER}/start.sh"), f"No start.sh in {SOURCE_FOLDER}"

print("=" * 60)
print("  Inspire AI — Workspace Installer")
print("=" * 60)
print(f"  Source folder:     {SOURCE_FOLDER}")
print(f"  App name:          {APP_NAME}")
print(f"  Database:          {INSPIRE_DB}")
print(f"  Workspace:         {WORKSPACE_HOST}")
print(f"  User:              {USER_EMAIL}")
print(f"  SQL Warehouse:     {WAREHOUSE_NAME or 'None'} ({WAREHOUSE_ID or 'N/A'})")
print("=" * 60)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Inject Configuration

# COMMAND ----------

import yaml

app_yaml_path = f"{SOURCE_FOLDER}/app.yaml"

with open(app_yaml_path, "r") as f:
    app_config = yaml.safe_load(f)

if "env" not in app_config or app_config["env"] is None:
    app_config["env"] = []

inject_vars = {
    "NODE_ENV": "production",
    "INSPIRE_DATABASE": INSPIRE_DB,
}
if WAREHOUSE_ID:
    inject_vars["INSPIRE_WAREHOUSE_ID"] = WAREHOUSE_ID

existing_names = {e["name"] for e in app_config["env"] if isinstance(e, dict) and "name" in e}
for name, value in inject_vars.items():
    if name in existing_names:
        for e in app_config["env"]:
            if isinstance(e, dict) and e.get("name") == name:
                e["value"] = value
                break
    else:
        app_config["env"].append({"name": name, "value": value})

with open(app_yaml_path, "w") as f:
    yaml.dump(app_config, f, default_flow_style=False, sort_keys=False)

print("Injected into app.yaml:")
for name, value in inject_vars.items():
    print(f"  {name} = {value}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create & Deploy App

# COMMAND ----------

# Create app if it doesn't exist
app_url = None
try:
    resp = api_get(f"/api/2.0/apps/{APP_NAME}")
    app_url = resp.get("url")
    print(f"App '{APP_NAME}' already exists. Redeploying...")
except Exception:
    print(f"Creating app '{APP_NAME}'...")
    resp = api_post("/api/2.0/apps", {"name": APP_NAME, "description": "Inspire AI — Data Strategy Copilot powered by Databricks"})
    if resp.status_code in (200, 201):
        app_url = resp.json().get("url")
        print(f"App created: {app_url}")
    elif "already exists" in resp.text.lower():
        data = api_get(f"/api/2.0/apps/{APP_NAME}")
        app_url = data.get("url")
        print(f"App already exists: {app_url}")
    else:
        raise RuntimeError(f"Failed to create app ({resp.status_code}): {resp.text[:500]}")

# Wait for compute
print("Waiting for app compute...")
for _ in range(30):
    data = api_get(f"/api/2.0/apps/{APP_NAME}")
    state = data.get("compute_status", {}).get("state", "UNKNOWN")
    if state == "ACTIVE":
        app_url = data.get("url", app_url)
        print(f"Compute ACTIVE.")
        break
    print(f"  Compute: {state}")
    time.sleep(10)
else:
    raise TimeoutError("App compute did not become ACTIVE within 5 minutes.")

# Deploy from workspace folder
print(f"Deploying from {SOURCE_FOLDER} ...")
resp = api_post(f"/api/2.0/apps/{APP_NAME}/deployments", {"source_code_path": SOURCE_FOLDER})
if resp.status_code not in (200, 201):
    raise RuntimeError(f"Deploy failed ({resp.status_code}): {resp.text[:500]}")

deploy_id = resp.json().get("deployment_id", "")
print(f"Deployment started (ID: {deploy_id}). Waiting...")

for _ in range(30):
    data = api_get(f"/api/2.0/apps/{APP_NAME}")
    pending = data.get("pending_deployment", {})
    active = data.get("active_deployment", {})

    if pending.get("deployment_id") == deploy_id:
        dep = pending
    elif active.get("deployment_id") == deploy_id:
        dep = active
    elif pending:
        dep = pending
    else:
        dep = active

    dep_state = dep.get("status", {}).get("state", "UNKNOWN")
    dep_msg = dep.get("status", {}).get("message", "")
    print(f"  Deploy: {dep_state}")

    if dep_state == "SUCCEEDED":
        app_url = data.get("url", app_url)
        print("Deployment succeeded!")
        break
    elif dep_state in ("FAILED", "CANCELLED"):
        raise RuntimeError(f"Deployment {dep_state}: {dep_msg}")
    time.sleep(10)
else:
    raise TimeoutError("Deployment did not complete within 5 minutes.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Database

# COMMAND ----------

from databricks.sdk.service.sql import StatementState

if WAREHOUSE_ID:
    sql = f"CREATE SCHEMA IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`"
    print(f"Executing: {sql}")
    stmt = w.statement_execution.execute_statement(warehouse_id=WAREHOUSE_ID, statement=sql, wait_timeout="30s")
    if stmt.status and stmt.status.state in (StatementState.SUCCEEDED,):
        print(f"Schema {INSPIRE_DB} is ready.")
    else:
        print(f"Warning: Schema creation returned {stmt.status.state if stmt.status else 'UNKNOWN'}")
        print("You can create it manually from the app's Settings page.")
else:
    print(f"No warehouse found. Create manually: CREATE SCHEMA IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Done!

# COMMAND ----------

app_data = api_get(f"/api/2.0/apps/{APP_NAME}")
app_url = app_data.get("url", app_url)

print("=" * 60)
print("  Inspire AI — Ready!")
print("=" * 60)
print(f"  App URL:     {app_url}")
print(f"  Database:    {INSPIRE_DB}")
print(f"  Warehouse:   {WAREHOUSE_NAME or 'N/A'}")
print()
print("  No PAT needed — Databricks auto-authenticates you.")
print("  Just open the URL and go!")
print("=" * 60)

displayHTML(f"""
<div style="padding: 24px; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px; text-align: center; margin: 20px 0;">
  <h2 style="color: #e0e0e0; margin-bottom: 8px;">Inspire AI is ready!</h2>
  <p style="color: #aaa; font-size: 13px; margin-bottom: 20px;">
    No PAT needed — Databricks authenticates you automatically.<br/>
    Just open the app and start using it.
  </p>
  <a href="{app_url}" target="_blank"
     style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #ff6b35, #f7931e);
            color: white; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600;
            box-shadow: 0 4px 15px rgba(255, 107, 53, 0.3);">
    Open Inspire AI
  </a>
  <p style="color: #666; margin-top: 14px; font-size: 12px;">{app_url}</p>
</div>
""")
