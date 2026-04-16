# Databricks notebook source

# MAGIC %md
# MAGIC # Inspire AI v4.7 — Workspace Installer
# MAGIC
# MAGIC **Fully self-contained installer** — deploys Inspire AI as a Databricks App.
# MAGIC
# MAGIC **Only one choice required:** pick the catalog where Inspire will store its data.
# MAGIC Everything else is auto-detected and configured.
# MAGIC
# MAGIC **Clean install every time:**
# MAGIC 1. Deletes old app + all legacy service principals
# MAGIC 2. Creates fresh app with a new SP
# MAGIC 3. Grants the new SP all needed permissions
# MAGIC
# MAGIC **Prerequisites:** DBR 13.3+ · Unity Catalog enabled

# COMMAND ----------

# MAGIC %md
# MAGIC ## Choose your catalog

# COMMAND ----------

import os, time, json, requests, base64
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState

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
APP_NAME = "inspire-ai"
SP_NAME = f"{APP_NAME}-sp"

print(f"Inspire AI will use: {INSPIRE_DB}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Auto-detect environment

# COMMAND ----------

# Find source folder
SOURCE_CANDIDATES = [
    f"/Workspace/Users/{USER_EMAIL}/InspireAI-main",
    f"/Workspace/Users/{USER_EMAIL}/InspireAI",
    f"/Workspace/Users/{USER_EMAIL}/InspireAI-dev_v_47",
    f"/Workspace/Shared/InspireAI",
]
SOURCE_FOLDER = None
for candidate in SOURCE_CANDIDATES:
    if os.path.exists(candidate) and os.path.exists(f"{candidate}/app.yaml"):
        SOURCE_FOLDER = candidate
        break
assert SOURCE_FOLDER, f"Source folder not found. Tried: {SOURCE_CANDIDATES}"

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

def api_delete(path):
    return requests.delete(f"{api_base}{path}", headers=api_headers)

# Auto-detect warehouse
WAREHOUSE_ID = None
WAREHOUSE_NAME = None
for wh in w.warehouses.list():
    if wh.state and wh.state.value == "RUNNING" and getattr(wh, "enable_serverless_compute", False):
        WAREHOUSE_ID = wh.id
        WAREHOUSE_NAME = wh.name
        break
if not WAREHOUSE_ID:
    for wh in w.warehouses.list():
        if wh.state and wh.state.value == "RUNNING":
            WAREHOUSE_ID = wh.id
            WAREHOUSE_NAME = wh.name
            break

print("=" * 60)
print("  Inspire AI v4.7 — Clean Install")
print("=" * 60)
print(f"  Catalog:       {CATALOG}")
print(f"  Database:      {INSPIRE_DB}")
print(f"  Source:        {SOURCE_FOLDER}")
print(f"  Warehouse:     {WAREHOUSE_NAME or 'N/A'} ({WAREHOUSE_ID or 'N/A'})")
print("=" * 60)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1: Clean up — delete old app and legacy SPs

# COMMAND ----------

# Delete existing app
print("Cleaning up old deployment...")
try:
    api_delete(f"/api/2.0/apps/{APP_NAME}")
    print(f"  Deleted app '{APP_NAME}'")
    # Wait for cleanup
    time.sleep(5)
except Exception:
    print(f"  No existing app to delete")

# Delete ALL legacy service principals matching the app name
print("Removing legacy service principals...")
deleted_count = 0
try:
    # Search broadly for any SP related to this app
    for search in [APP_NAME, SP_NAME, "inspire-ai", "inspire_ai"]:
        try:
            sps = api_get(f"/api/2.0/preview/scim/v2/ServicePrincipals?filter=displayName co \"{search}\"")
            for sp in sps.get("Resources", []):
                sp_id = sp.get("id")
                sp_name = sp.get("displayName", "")
                sp_app_id = sp.get("applicationId", "")
                print(f"  Deleting SP: {sp_name} (ID: {sp_id}, AppID: {sp_app_id})")
                try:
                    resp = api_delete(f"/api/2.0/preview/scim/v2/ServicePrincipals/{sp_id}")
                    if resp.status_code in (200, 204):
                        deleted_count += 1
                        print(f"    ✅ Deleted")
                    else:
                        print(f"    ⚠️ {resp.status_code}: {resp.text[:100]}")
                except Exception as e:
                    print(f"    ⚠️ {e}")
        except Exception:
            pass
except Exception as e:
    print(f"  Warning: {e}")

print(f"  Cleaned up {deleted_count} legacy SP(s)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2: Create database + publish notebook

# COMMAND ----------

# Create schema
if WAREHOUSE_ID:
    sql = f"CREATE SCHEMA IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`"
    print(f"Creating schema: {sql}")
    stmt = w.statement_execution.execute_statement(warehouse_id=WAREHOUSE_ID, statement=sql, wait_timeout="30s")
    print(f"  Schema: {'✅ Ready' if stmt.status and stmt.status.state == StatementState.SUCCEEDED else '⚠️ ' + str(stmt.status)}")

# Publish notebook
NOTEBOOK_DEST = f"/Shared/{APP_NAME}/dbx_inspire_ai_agent"
NOTEBOOK_PATH = None

notebook_source = None
for candidate in [f"{SOURCE_FOLDER}/dbx_inspire_ai_agent.ipynb", f"{SOURCE_FOLDER}/databricks_inspire_v46.dbc"]:
    if os.path.exists(candidate):
        notebook_source = candidate
        break

if notebook_source:
    print(f"Publishing: {notebook_source}")
    with open(notebook_source, "rb") as f:
        content_b64 = base64.b64encode(f.read()).decode("utf-8")
    is_ipynb = notebook_source.endswith(".ipynb")

    try:
        api_post("/api/2.0/workspace/mkdirs", {"path": f"/Shared/{APP_NAME}"})
    except Exception:
        pass
    try:
        api_post("/api/2.0/workspace/delete", {"path": NOTEBOOK_DEST, "recursive": False})
    except Exception:
        pass

    payload = {"path": NOTEBOOK_DEST, "format": "JUPYTER" if is_ipynb else "DBC", "content": content_b64, "overwrite": True}
    if is_ipynb:
        payload["language"] = "PYTHON"

    resp = api_post("/api/2.0/workspace/import", payload)
    if resp.status_code in (200, 201):
        NOTEBOOK_PATH = NOTEBOOK_DEST
        print(f"  Notebook: ✅ {NOTEBOOK_PATH}")
    else:
        print(f"  Notebook: ⚠️ {resp.status_code} {resp.text[:200]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Deploy fresh app (runtime creates a new SP)

# COMMAND ----------

import yaml

# Configure app.yaml
app_yaml_path = f"{SOURCE_FOLDER}/app.yaml"
with open(app_yaml_path, "r") as f:
    app_config = yaml.safe_load(f)

app_config["env"] = [e for e in (app_config.get("env") or []) if isinstance(e, dict) and e.get("name") not in ("NODE_ENV", "INSPIRE_DATABASE", "INSPIRE_AUTO_SETUP", "INSPIRE_WAREHOUSE_ID", "NOTEBOOK_PATH")]

inject = {"NODE_ENV": "production", "INSPIRE_DATABASE": INSPIRE_DB, "INSPIRE_AUTO_SETUP": "true"}
if WAREHOUSE_ID:
    inject["INSPIRE_WAREHOUSE_ID"] = WAREHOUSE_ID
if NOTEBOOK_PATH:
    inject["NOTEBOOK_PATH"] = NOTEBOOK_PATH

for name, value in inject.items():
    app_config["env"].append({"name": name, "value": str(value)})

app_config["resources"] = [{"name": SP_NAME, "type": "service-principal"}]

with open(app_yaml_path, "w") as f:
    yaml.dump(app_config, f, default_flow_style=False, sort_keys=False)

print("app.yaml ready:")
for k, v in inject.items():
    print(f"  {k} = {v}")
print(f"  resources: [{SP_NAME}]")

# Create fresh app
print(f"\nCreating app '{APP_NAME}'...")
resp = api_post("/api/2.0/apps", {"name": APP_NAME, "description": "Inspire AI v4.7 — Data Strategy Copilot"})
if resp.status_code in (200, 201):
    app_url = resp.json().get("url", "")
    print(f"  App created: {app_url}")
elif "already exists" in resp.text.lower():
    app_url = api_get(f"/api/2.0/apps/{APP_NAME}").get("url", "")
    print(f"  App already exists: {app_url}")
else:
    raise RuntimeError(f"Create failed ({resp.status_code}): {resp.text[:500]}")

# Wait for compute
print("Waiting for compute...")
for _ in range(30):
    data = api_get(f"/api/2.0/apps/{APP_NAME}")
    state = data.get("compute_status", {}).get("state", "UNKNOWN")
    if state == "ACTIVE":
        app_url = data.get("url", app_url)
        print(f"  Compute: ACTIVE ✅")
        break
    print(f"  Compute: {state}")
    time.sleep(10)
else:
    raise TimeoutError("Compute not ready in 5 minutes")

# Deploy
print(f"Deploying...")
resp = api_post(f"/api/2.0/apps/{APP_NAME}/deployments", {"source_code_path": SOURCE_FOLDER})
if resp.status_code not in (200, 201):
    raise RuntimeError(f"Deploy failed ({resp.status_code}): {resp.text[:500]}")

deploy_id = resp.json().get("deployment_id", "")
for _ in range(30):
    data = api_get(f"/api/2.0/apps/{APP_NAME}")
    pending = data.get("pending_deployment", {})
    active = data.get("active_deployment", {})
    dep = pending if pending.get("deployment_id") == deploy_id else active if active.get("deployment_id") == deploy_id else pending or active
    dep_state = dep.get("status", {}).get("state", "UNKNOWN")
    print(f"  Deploy: {dep_state}")
    if dep_state == "SUCCEEDED":
        app_url = data.get("url", app_url)
        print("  ✅ Deployment succeeded!")
        break
    elif dep_state in ("FAILED", "CANCELLED"):
        raise RuntimeError(f"Deployment {dep_state}: {dep.get('status', {}).get('message', '')}")
    time.sleep(10)
else:
    raise TimeoutError("Deployment not done in 5 minutes")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4: Grant permissions to the runtime's NEW SP
# MAGIC
# MAGIC The runtime created a fresh SP. We find it and grant all needed access.

# COMMAND ----------

# The runtime just created a new SP. Find it.
print("Finding the runtime's service principal...")

# Get the app info — the resources should now reference the actual SP
app_info = api_get(f"/api/2.0/apps/{APP_NAME}")
print(f"  App keys: {list(app_info.keys())}")

# Dump the service_principal and resources fields for inspection
for key in ["service_principal", "effective_service_principal", "resources", "service_principal_id", "service_principal_client_id"]:
    if key in app_info:
        print(f"  app.{key} = {json.dumps(app_info[key], default=str)[:300]}")

# Find ALL SPs that could be the runtime's SP
# (search by name since the runtime creates an SP matching the resource name)
GRANT_APP_IDS = set()
try:
    all_sps = api_get("/api/2.0/preview/scim/v2/ServicePrincipals?count=200")
    for sp in all_sps.get("Resources", []):
        name = sp.get("displayName", "")
        app_id = sp.get("applicationId", "")
        # Match any SP with inspire-ai in the name
        if APP_NAME in name.lower() or "inspire" in name.lower():
            print(f"  Found SP: {name} | applicationId={app_id} | id={sp.get('id')}")
            if app_id:
                GRANT_APP_IDS.add(app_id)
except Exception as e:
    print(f"  ⚠️ Could not list SPs: {e}")

if not GRANT_APP_IDS:
    print("  ⚠️ No matching SPs found! You'll need to grant permissions manually.")
else:
    print(f"\n  Will grant permissions to {len(GRANT_APP_IDS)} SP(s): {GRANT_APP_IDS}")

# Run grants
if GRANT_APP_IDS and WAREHOUSE_ID:
    for sp_id in GRANT_APP_IDS:
        print(f"\n  Granting to {sp_id}...")
        grants = [
            f"GRANT USE_CATALOG ON CATALOG `{CATALOG}` TO `{sp_id}`",
            f"GRANT BROWSE ON CATALOG `{CATALOG}` TO `{sp_id}`",
            f"GRANT USE_SCHEMA ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{sp_id}`",
            f"GRANT CREATE_TABLE ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{sp_id}`",
            f"GRANT SELECT ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{sp_id}`",
            f"GRANT MODIFY ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{sp_id}`",
        ]
        for cat in available_catalogs:
            if cat != CATALOG and cat != "samples":
                grants.append(f"GRANT BROWSE ON CATALOG `{cat}` TO `{sp_id}`")

        for sql in grants:
            try:
                stmt = w.statement_execution.execute_statement(warehouse_id=WAREHOUSE_ID, statement=sql, wait_timeout="15s")
                status = stmt.status.state.value if stmt.status else "?"
                label = sql.split(" ON ")[0].replace("GRANT ", "") + " ON " + sql.split(" ON ")[1].split(" TO ")[0]
                if status == "SUCCEEDED":
                    print(f"    {label}: ✅")
                else:
                    err = stmt.status.error.message[:80] if stmt.status and stmt.status.error else status
                    print(f"    {label}: ⚠️ {err}")
            except Exception as e:
                print(f"    ⚠️ {str(e)[:120]}")

        # Warehouse
        try:
            resp = api_patch(f"/api/2.0/permissions/sql/warehouses/{WAREHOUSE_ID}", {
                "access_control_list": [{"service_principal_name": sp_id, "permission_level": "CAN_USE"}]
            })
            print(f"    CAN_USE on warehouse: {'✅' if resp.status_code == 200 else '⚠️ ' + resp.text[:100]}")
        except Exception as e:
            print(f"    Warehouse: ⚠️ {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Done!

# COMMAND ----------

app_data = api_get(f"/api/2.0/apps/{APP_NAME}")
app_url = app_data.get("url", "")

print("=" * 60)
print("  Inspire AI v4.7 — Ready!")
print("=" * 60)
print(f"  App URL:       {app_url}")
print(f"  Database:      {INSPIRE_DB}")
print(f"  Warehouse:     {WAREHOUSE_NAME or 'N/A'}")
print(f"  Notebook:      {NOTEBOOK_PATH or 'auto-publish'}")
print(f"  SPs granted:   {GRANT_APP_IDS or 'none'}")
print()
print("  Open the URL — no setup needed!")
print("=" * 60)

displayHTML(f"""
<div style="padding: 24px; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px; text-align: center; margin: 20px 0;">
  <h2 style="color: #e0e0e0; margin-bottom: 8px;">Inspire AI v4.7 is ready!</h2>
  <p style="color: #aaa; font-size: 13px; margin-bottom: 20px;">
    Clean install complete. Just open the app.
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
