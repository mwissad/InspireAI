# Databricks notebook source

# MAGIC %md
# MAGIC # Inspire AI v4.7 — Workspace Installer
# MAGIC
# MAGIC **Fully self-contained installer** — deploys Inspire AI as a Databricks App.
# MAGIC
# MAGIC **Only one choice required:** pick the catalog where Inspire will store its data.
# MAGIC Everything else is auto-detected and configured.
# MAGIC
# MAGIC **What it does:**
# MAGIC 1. Lists your catalogs — you pick one
# MAGIC 2. Auto-detects SQL warehouse, source folder, etc.
# MAGIC 3. Creates the `_inspire` schema and a service principal
# MAGIC 4. Publishes the notebook and injects all config
# MAGIC 5. Creates & deploys the Databricks App — ready to use
# MAGIC
# MAGIC **Prerequisites:** DBR 13.3+ · Unity Catalog enabled
# MAGIC
# MAGIC ---
# MAGIC **Usage:** Upload/clone InspireAI into your workspace, then **Run All**.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Choose your catalog
# MAGIC
# MAGIC Select the Unity Catalog where Inspire AI will create its `_inspire` schema to store sessions and results.

# COMMAND ----------

import os, time, json, requests, base64
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()
current_user = w.current_user.me()
USER_EMAIL = current_user.user_name
WORKSPACE_HOST = w.config.host

# ── List available catalogs for the user to pick from ──
available_catalogs = []
try:
    for cat in w.catalogs.list():
        if cat.name not in ("system", "information_schema", "__databricks_internal"):
            available_catalogs.append(cat.name)
except Exception:
    available_catalogs = ["workspace"]

if not available_catalogs:
    available_catalogs = ["workspace"]

# Show catalog dropdown — this is the ONLY user interaction
dbutils.widgets.dropdown("catalog", available_catalogs[0], available_catalogs, "Select Catalog")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = "_inspire"
INSPIRE_DB = f"{CATALOG}.{SCHEMA}"

print(f"Inspire AI will use: {INSPIRE_DB}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Auto-detect environment

# COMMAND ----------

# Auto-detect the source folder
DEFAULT_SOURCE = f"/Workspace/Users/{USER_EMAIL}/InspireAI-main"
SOURCE_CANDIDATES = [
    DEFAULT_SOURCE,
    f"/Workspace/Users/{USER_EMAIL}/InspireAI",
    f"/Workspace/Users/{USER_EMAIL}/InspireAI-dev_v_47",
    f"/Workspace/Shared/InspireAI",
]
SOURCE_FOLDER = None
for candidate in SOURCE_CANDIDATES:
    if os.path.exists(candidate) and os.path.exists(f"{candidate}/app.yaml"):
        SOURCE_FOLDER = candidate
        break

assert SOURCE_FOLDER, f"Could not find InspireAI source folder. Tried: {SOURCE_CANDIDATES}. Upload/clone the repo first."

APP_NAME = "inspire-ai"

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

def api_put(path, body=None):
    r = requests.put(f"{api_base}{path}", headers=api_headers, json=body or {})
    return r

def api_patch(path, body=None):
    r = requests.patch(f"{api_base}{path}", headers=api_headers, json=body or {})
    return r

# Auto-detect SQL warehouse: prefer running serverless, then running, then first available
WAREHOUSE_ID = None
WAREHOUSE_NAME = None
warehouses = list(w.warehouses.list())
for wh in warehouses:
    if wh.state and wh.state.value == "RUNNING" and getattr(wh, "enable_serverless_compute", False):
        WAREHOUSE_ID = wh.id
        WAREHOUSE_NAME = wh.name
        break
if not WAREHOUSE_ID:
    for wh in warehouses:
        if wh.state and wh.state.value == "RUNNING":
            WAREHOUSE_ID = wh.id
            WAREHOUSE_NAME = wh.name
            break
if not WAREHOUSE_ID and warehouses:
    WAREHOUSE_ID = warehouses[0].id
    WAREHOUSE_NAME = warehouses[0].name

print("=" * 60)
print("  Inspire AI v4.7 — Workspace Installer")
print("=" * 60)
print(f"  Catalog:           {CATALOG}")
print(f"  Database:          {INSPIRE_DB}")
print(f"  Source folder:     {SOURCE_FOLDER}")
print(f"  App name:          {APP_NAME}")
print(f"  Workspace:         {WORKSPACE_HOST}")
print(f"  User:              {USER_EMAIL}")
print(f"  SQL Warehouse:     {WAREHOUSE_NAME or 'None'} ({WAREHOUSE_ID or 'N/A'})")
print("=" * 60)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1: Create Database Schema

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
else:
    print(f"No warehouse found. Create manually: CREATE SCHEMA IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2: Publish Notebook to Workspace

# COMMAND ----------

NOTEBOOK_DEST = f"/Shared/{APP_NAME}/dbx_inspire_ai_agent"
NOTEBOOK_PATH = None

# Look for the notebook in the source folder
notebook_candidates = [
    f"{SOURCE_FOLDER}/dbx_inspire_ai_agent.ipynb",
    f"{SOURCE_FOLDER}/databricks_inspire_v46.dbc",
]

notebook_source = None
for candidate in notebook_candidates:
    if os.path.exists(candidate):
        notebook_source = candidate
        break

if notebook_source:
    print(f"Publishing notebook: {notebook_source}")
    print(f"  Destination: {NOTEBOOK_DEST}")

    with open(notebook_source, "rb") as f:
        content_b64 = base64.b64encode(f.read()).decode("utf-8")

    is_ipynb = notebook_source.endswith(".ipynb")
    import_format = "JUPYTER" if is_ipynb else "DBC"

    # Delete old if exists
    try:
        api_post("/api/2.0/workspace/delete", {"path": f"/Shared/{APP_NAME}", "recursive": True})
    except Exception:
        pass

    # Import
    import_payload = {
        "path": NOTEBOOK_DEST,
        "format": import_format,
        "content": content_b64,
        "overwrite": True,
    }
    if is_ipynb:
        import_payload["language"] = "PYTHON"

    resp = api_post("/api/2.0/workspace/import", import_payload)
    if resp.status_code in (200, 201):
        NOTEBOOK_PATH = NOTEBOOK_DEST
        print(f"Notebook published: {NOTEBOOK_PATH}")
    else:
        print(f"Warning: Notebook publish failed ({resp.status_code}): {resp.text[:300]}")
        # For DBC, the notebook may be inside a folder
        if not is_ipynb:
            try:
                list_resp = api_get(f"/api/2.0/workspace/list?path=/Shared/{APP_NAME}")
                for obj in list_resp.get("objects", []):
                    if obj.get("object_type") == "NOTEBOOK":
                        NOTEBOOK_PATH = obj["path"]
                        print(f"Found notebook in folder: {NOTEBOOK_PATH}")
                        break
            except Exception:
                pass
else:
    print("Warning: No notebook file found in source folder. Publish will be handled by the app.")

if NOTEBOOK_PATH:
    print(f"Notebook path: {NOTEBOOK_PATH}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Create Service Principal

# COMMAND ----------

SP_NAME = f"{APP_NAME}-sp"
SP_APP_ID = None
SP_ID = None

# Check if SP already exists
try:
    sps = api_get(f"/api/2.0/preview/scim/v2/ServicePrincipals?filter=displayName eq \"{SP_NAME}\"")
    existing = sps.get("Resources", [])
    if existing:
        SP_ID = existing[0]["id"]
        SP_APP_ID = existing[0].get("applicationId", existing[0].get("externalId", ""))
        print(f"Service principal '{SP_NAME}' already exists (ID: {SP_ID})")
    else:
        raise Exception("Not found")
except Exception:
    # Create new service principal
    print(f"Creating service principal '{SP_NAME}'...")
    resp = api_post("/api/2.0/preview/scim/v2/ServicePrincipals", {
        "displayName": SP_NAME,
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ServicePrincipal"],
        "active": True,
    })
    if resp.status_code in (200, 201):
        sp_data = resp.json()
        SP_ID = sp_data["id"]
        SP_APP_ID = sp_data.get("applicationId", sp_data.get("externalId", ""))
        print(f"Service principal created (ID: {SP_ID}, AppID: {SP_APP_ID})")
    else:
        print(f"Warning: Could not create service principal ({resp.status_code}): {resp.text[:300]}")
        print("The app will rely on user OAuth tokens (x-forwarded-access-token).")

# Grant SP permissions on catalog/schema
if SP_ID:
    # Grant USE CATALOG
    try:
        resp = api_post("/api/2.1/unity-catalog/permissions/catalog/" + CATALOG, {
            "changes": [{"principal": SP_NAME, "add": ["USE_CATALOG"]}]
        })
        if resp.status_code == 200:
            print(f"  Granted USE_CATALOG on '{CATALOG}' to {SP_NAME}")
    except Exception as e:
        print(f"  Warning: Could not grant USE_CATALOG: {e}")

    # Grant USE/CREATE on schema
    try:
        resp = api_post(f"/api/2.1/unity-catalog/permissions/schema/{CATALOG}.{SCHEMA}", {
            "changes": [{"principal": SP_NAME, "add": ["USE_SCHEMA", "CREATE_TABLE", "SELECT", "MODIFY"]}]
        })
        if resp.status_code == 200:
            print(f"  Granted schema permissions on '{INSPIRE_DB}' to {SP_NAME}")
    except Exception as e:
        print(f"  Warning: Could not grant schema permissions: {e}")

    # Grant warehouse access
    if WAREHOUSE_ID:
        try:
            resp = api_put(f"/api/2.0/permissions/sql/warehouses/{WAREHOUSE_ID}", {
                "access_control_list": [
                    {"service_principal_name": SP_NAME, "all_permissions": [{"permission_level": "CAN_USE"}]}
                ]
            })
            if resp.status_code == 200:
                print(f"  Granted CAN_USE on warehouse to {SP_NAME}")
        except Exception as e:
            print(f"  Warning: Could not grant warehouse permission: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4: Inject Configuration into app.yaml

# COMMAND ----------

import yaml

app_yaml_path = f"{SOURCE_FOLDER}/app.yaml"

with open(app_yaml_path, "r") as f:
    app_config = yaml.safe_load(f)

if "env" not in app_config or app_config["env"] is None:
    app_config["env"] = []

# Build the complete set of env vars the app needs
inject_vars = {
    "NODE_ENV": "production",
    "INSPIRE_DATABASE": INSPIRE_DB,
    "INSPIRE_AUTO_SETUP": "true",
}
if WAREHOUSE_ID:
    inject_vars["INSPIRE_WAREHOUSE_ID"] = WAREHOUSE_ID
if NOTEBOOK_PATH:
    inject_vars["NOTEBOOK_PATH"] = NOTEBOOK_PATH

# Update or add each env var
existing_names = {e["name"] for e in app_config["env"] if isinstance(e, dict) and "name" in e}
for name, value in inject_vars.items():
    if name in existing_names:
        for e in app_config["env"]:
            if isinstance(e, dict) and e.get("name") == name:
                e["value"] = str(value)
                break
    else:
        app_config["env"].append({"name": name, "value": str(value)})

# Add service principal as an app resource if created
if SP_ID:
    app_config["resources"] = [
        {
            "name": SP_NAME,
            "type": "service-principal",
            "description": "Service principal for Inspire AI to access Databricks APIs",
            "permissions": ["CAN_USE", "CAN_MANAGE"],
        }
    ]

with open(app_yaml_path, "w") as f:
    yaml.dump(app_config, f, default_flow_style=False, sort_keys=False)

print("Injected into app.yaml:")
for name, value in inject_vars.items():
    print(f"  {name} = {value}")
if SP_ID:
    print(f"  resources: [{SP_NAME} (service-principal)]")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 5: Create & Deploy App

# COMMAND ----------

# Create app if it doesn't exist
app_url = None
try:
    resp = api_get(f"/api/2.0/apps/{APP_NAME}")
    app_url = resp.get("url")
    print(f"App '{APP_NAME}' already exists. Redeploying...")
except Exception:
    print(f"Creating app '{APP_NAME}'...")
    resp = api_post("/api/2.0/apps", {"name": APP_NAME, "description": "Inspire AI v4.7 — Data Strategy Copilot powered by Databricks"})
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
# MAGIC ## Done!

# COMMAND ----------

app_data = api_get(f"/api/2.0/apps/{APP_NAME}")
app_url = app_data.get("url", app_url)

print("=" * 60)
print("  Inspire AI v4.7 — Ready!")
print("=" * 60)
print(f"  App URL:           {app_url}")
print(f"  Database:          {INSPIRE_DB}")
print(f"  Warehouse:         {WAREHOUSE_NAME or 'N/A'} ({WAREHOUSE_ID or 'N/A'})")
print(f"  Notebook:          {NOTEBOOK_PATH or 'auto-publish on first use'}")
print(f"  Service Principal: {SP_NAME if SP_ID else 'N/A (user OAuth)'}")
print()
print("  No setup wizard needed — everything is pre-configured.")
print("  Just open the URL and start analyzing!")
print("=" * 60)

displayHTML(f"""
<div style="padding: 24px; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px; text-align: center; margin: 20px 0;">
  <h2 style="color: #e0e0e0; margin-bottom: 8px;">Inspire AI v4.7 is ready!</h2>
  <p style="color: #aaa; font-size: 13px; margin-bottom: 20px;">
    No setup wizard. No PAT needed. Everything is pre-configured.<br/>
    Just open the app and start analyzing your data.
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
