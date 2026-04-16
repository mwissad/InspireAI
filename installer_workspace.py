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
# MAGIC 3. Creates the `_inspire` schema
# MAGIC 4. Publishes the notebook
# MAGIC 5. Deploys the Databricks App with a service principal
# MAGIC 6. Grants the runtime SP all needed permissions
# MAGIC
# MAGIC **Prerequisites:** DBR 13.3+ · Unity Catalog enabled

# COMMAND ----------

# MAGIC %md
# MAGIC ## Choose your catalog

# COMMAND ----------

import os, time, json, requests, base64
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()
current_user = w.current_user.me()
USER_EMAIL = current_user.user_name
WORKSPACE_HOST = w.config.host

available_catalogs = []
try:
    for cat in w.catalogs.list():
        if cat.name not in ("system", "information_schema", "__databricks_internal"):
            available_catalogs.append(cat.name)
except Exception:
    available_catalogs = ["workspace"]

if not available_catalogs:
    available_catalogs = ["workspace"]

dbutils.widgets.dropdown("catalog", available_catalogs[0], available_catalogs, "Select Catalog")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = "_inspire"
INSPIRE_DB = f"{CATALOG}.{SCHEMA}"

print(f"Inspire AI will use: {INSPIRE_DB}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Auto-detect environment

# COMMAND ----------

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
SP_NAME = f"{APP_NAME}-sp"

# REST API helpers
api_base = WORKSPACE_HOST.rstrip("/")
api_headers = {}
try:
    auth_header = w.config.authenticate()
    api_headers = auth_header if isinstance(auth_header, dict) else {"Authorization": f"Bearer {auth_header}"}
except Exception:
    api_headers = {"Authorization": f"Bearer {dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiToken().get()}"}

def api_get(path):
    r = requests.get(f"{api_base}{path}", headers=api_headers)
    r.raise_for_status()
    return r.json()

def api_post(path, body=None):
    return requests.post(f"{api_base}{path}", headers=api_headers, json=body or {})

def api_put(path, body=None):
    return requests.put(f"{api_base}{path}", headers=api_headers, json=body or {})

def api_patch(path, body=None):
    return requests.patch(f"{api_base}{path}", headers=api_headers, json=body or {})

# Auto-detect warehouse
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
# MAGIC ## Step 2: Publish Notebook

# COMMAND ----------

NOTEBOOK_DEST = f"/Shared/{APP_NAME}/dbx_inspire_ai_agent"
NOTEBOOK_PATH = None

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
    with open(notebook_source, "rb") as f:
        content_b64 = base64.b64encode(f.read()).decode("utf-8")

    is_ipynb = notebook_source.endswith(".ipynb")
    import_format = "JUPYTER" if is_ipynb else "DBC"

    # Create parent folder
    try:
        api_post("/api/2.0/workspace/mkdirs", {"path": f"/Shared/{APP_NAME}"})
    except Exception:
        pass
    # Delete old notebook
    try:
        api_post("/api/2.0/workspace/delete", {"path": NOTEBOOK_DEST, "recursive": False})
    except Exception:
        pass

    import_payload = {"path": NOTEBOOK_DEST, "format": import_format, "content": content_b64, "overwrite": True}
    if is_ipynb:
        import_payload["language"] = "PYTHON"

    resp = api_post("/api/2.0/workspace/import", import_payload)
    if resp.status_code in (200, 201):
        NOTEBOOK_PATH = NOTEBOOK_DEST
        print(f"Notebook published: {NOTEBOOK_PATH}")
    else:
        print(f"Warning: Notebook publish failed ({resp.status_code}): {resp.text[:300]}")
else:
    print("Warning: No notebook file found in source folder.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Configure & Deploy App

# COMMAND ----------

import yaml

app_yaml_path = f"{SOURCE_FOLDER}/app.yaml"

with open(app_yaml_path, "r") as f:
    app_config = yaml.safe_load(f)

if "env" not in app_config or app_config["env"] is None:
    app_config["env"] = []

# Env vars
inject_vars = {
    "NODE_ENV": "production",
    "INSPIRE_DATABASE": INSPIRE_DB,
    "INSPIRE_AUTO_SETUP": "true",
}
if WAREHOUSE_ID:
    inject_vars["INSPIRE_WAREHOUSE_ID"] = WAREHOUSE_ID
if NOTEBOOK_PATH:
    inject_vars["NOTEBOOK_PATH"] = NOTEBOOK_PATH

existing_names = {e["name"] for e in app_config["env"] if isinstance(e, dict) and "name" in e}
for name, value in inject_vars.items():
    if name in existing_names:
        for e in app_config["env"]:
            if isinstance(e, dict) and e.get("name") == name:
                e["value"] = str(value)
                break
    else:
        app_config["env"].append({"name": name, "value": str(value)})

# SP resource — runtime will create an SP and inject DATABRICKS_CLIENT_ID/SECRET
app_config["resources"] = [{"name": SP_NAME, "type": "service-principal"}]

with open(app_yaml_path, "w") as f:
    yaml.dump(app_config, f, default_flow_style=False, sort_keys=False)

print("app.yaml configured:")
for name, value in inject_vars.items():
    print(f"  {name} = {value}")
print(f"  resources: [{SP_NAME}]")

# Deploy
app_url = None
try:
    resp = api_get(f"/api/2.0/apps/{APP_NAME}")
    app_url = resp.get("url")
    print(f"\nApp '{APP_NAME}' exists. Redeploying...")
except Exception:
    print(f"\nCreating app '{APP_NAME}'...")
    resp = api_post("/api/2.0/apps", {"name": APP_NAME, "description": "Inspire AI v4.7 — Data Strategy Copilot"})
    if resp.status_code in (200, 201):
        app_url = resp.json().get("url")
        print(f"App created: {app_url}")
    elif "already exists" in resp.text.lower():
        data = api_get(f"/api/2.0/apps/{APP_NAME}")
        app_url = data.get("url")
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
    dep = pending if pending.get("deployment_id") == deploy_id else active if active.get("deployment_id") == deploy_id else pending or active
    dep_state = dep.get("status", {}).get("state", "UNKNOWN")
    print(f"  Deploy: {dep_state}")
    if dep_state == "SUCCEEDED":
        app_url = data.get("url", app_url)
        print("Deployment succeeded!")
        break
    elif dep_state in ("FAILED", "CANCELLED"):
        raise RuntimeError(f"Deployment {dep_state}: {dep.get('status', {}).get('message', '')}")
    time.sleep(10)
else:
    raise TimeoutError("Deployment did not complete within 5 minutes.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4: Grant permissions to the runtime's SP
# MAGIC
# MAGIC The runtime creates the SP and injects its credentials. We now look up
# MAGIC that SP and grant it access to catalogs, schema, and warehouse.

# COMMAND ----------

# Look up the actual SP the runtime assigned to the app
print("Looking up the app's service principal...")
RUNTIME_SP_NAME = None
RUNTIME_SP_ID = None

# The runtime SP has the same name we declared in app.yaml resources
try:
    sps = api_get(f"/api/2.0/preview/scim/v2/ServicePrincipals?filter=displayName eq \"{SP_NAME}\"")
    resources = sps.get("Resources", [])
    if resources:
        RUNTIME_SP_ID = resources[0]["id"]
        RUNTIME_SP_NAME = resources[0].get("displayName", SP_NAME)
        app_id = resources[0].get("applicationId", "")
        print(f"  Found SP: {RUNTIME_SP_NAME} (ID: {RUNTIME_SP_ID}, AppID: {app_id})")
except Exception as e:
    print(f"  Warning: Could not find SP by name '{SP_NAME}': {e}")

# If not found by declared name, try app-specific name patterns
if not RUNTIME_SP_ID:
    for pattern in [APP_NAME, f"{APP_NAME}-sp", f"apps/{APP_NAME}"]:
        try:
            sps = api_get(f"/api/2.0/preview/scim/v2/ServicePrincipals?filter=displayName co \"{pattern}\"")
            resources = sps.get("Resources", [])
            if resources:
                RUNTIME_SP_ID = resources[0]["id"]
                RUNTIME_SP_NAME = resources[0].get("displayName", pattern)
                app_id = resources[0].get("applicationId", "")
                print(f"  Found SP by pattern '{pattern}': {RUNTIME_SP_NAME} (ID: {RUNTIME_SP_ID}, AppID: {app_id})")
                break
        except Exception:
            pass

if not RUNTIME_SP_NAME:
    print("  Warning: Could not find the runtime SP. Permissions must be granted manually.")

# Grant permissions to the RUNTIME SP using the Databricks SDK (more reliable than REST)
if RUNTIME_SP_NAME:
    principal = RUNTIME_SP_NAME
    print(f"\nGranting permissions to '{principal}'...")

    # Use SDK for Unity Catalog grants (correct method: SQL GRANT statements)
    if WAREHOUSE_ID:
        grants = [
            f"GRANT USE_CATALOG ON CATALOG `{CATALOG}` TO `{principal}`",
            f"GRANT BROWSE ON CATALOG `{CATALOG}` TO `{principal}`",
            f"GRANT USE_SCHEMA ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{principal}`",
            f"GRANT CREATE_TABLE ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{principal}`",
            f"GRANT SELECT ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{principal}`",
            f"GRANT MODIFY ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{principal}`",
        ]
        # Also grant BROWSE on other catalogs
        for cat in available_catalogs:
            if cat != CATALOG:
                grants.append(f"GRANT BROWSE ON CATALOG `{cat}` TO `{principal}`")

        for sql in grants:
            try:
                stmt = w.statement_execution.execute_statement(
                    warehouse_id=WAREHOUSE_ID, statement=sql, wait_timeout="15s"
                )
                status = stmt.status.state.value if stmt.status else "UNKNOWN"
                label = sql.split(" ON ")[0].replace("GRANT ", "") + " ON " + sql.split(" ON ")[1].split(" TO ")[0]
                if status == "SUCCEEDED":
                    print(f"  {label}: ✅")
                else:
                    print(f"  {label}: ⚠️ {status}")
            except Exception as e:
                print(f"  {sql[:60]}...: ⚠️ {e}")

        # Warehouse CAN_USE via permissions API (PATCH, not PUT)
        try:
            resp = api_patch(f"/api/2.0/permissions/sql/warehouses/{WAREHOUSE_ID}", {
                "access_control_list": [
                    {"service_principal_name": principal, "all_permissions": [{"permission_level": "CAN_USE"}]}
                ]
            })
            print(f"  CAN_USE on warehouse: {resp.status_code}" + (f" ⚠️ {resp.text[:150]}" if resp.status_code != 200 else " ✅"))
        except Exception as e:
            print(f"  Warehouse permission: ⚠️ {e}")
    else:
        print("  ⚠️ No warehouse — cannot grant permissions via SQL. Grant manually.")

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
print(f"  Warehouse:         {WAREHOUSE_NAME or 'N/A'}")
print(f"  Notebook:          {NOTEBOOK_PATH or 'auto-publish'}")
print(f"  Service Principal: {RUNTIME_SP_NAME or 'N/A'}")
print()
print("  Open the URL — no setup needed!")
print("=" * 60)

displayHTML(f"""
<div style="padding: 24px; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px; text-align: center; margin: 20px 0;">
  <h2 style="color: #e0e0e0; margin-bottom: 8px;">Inspire AI v4.7 is ready!</h2>
  <p style="color: #aaa; font-size: 13px; margin-bottom: 20px;">
    Everything is configured. Just open the app.
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
