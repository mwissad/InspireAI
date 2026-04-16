# Databricks notebook source

# MAGIC %md
# MAGIC # Inspire AI v4.7 — Workspace Installer
# MAGIC
# MAGIC **Only one choice:** pick the catalog. Everything else is automatic.
# MAGIC
# MAGIC **Clean install:** deletes old app + SPs, deploys fresh, grants correct permissions.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Choose your catalog

# COMMAND ----------

# MAGIC %pip install pyyaml -q

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

# COMMAND ----------

# MAGIC %md
# MAGIC ## Setup

# COMMAND ----------

# Source folder
for candidate in [
    f"/Workspace/Users/{USER_EMAIL}/InspireAI-main",
    f"/Workspace/Users/{USER_EMAIL}/InspireAI",
    f"/Workspace/Users/{USER_EMAIL}/InspireAI-dev_v_47",
    f"/Workspace/Shared/InspireAI",
]:
    if os.path.exists(candidate) and os.path.exists(f"{candidate}/app.yaml"):
        SOURCE_FOLDER = candidate
        break
else:
    raise FileNotFoundError("InspireAI source folder not found. Upload/clone the repo first.")

# API helpers
api_base = WORKSPACE_HOST.rstrip("/")
try:
    auth_header = w.config.authenticate()
    api_headers = auth_header if isinstance(auth_header, dict) else {"Authorization": f"Bearer {auth_header}"}
except Exception:
    api_headers = {"Authorization": f"Bearer {dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiToken().get()}"}

def api(method, path, body=None):
    fn = {"GET": requests.get, "POST": requests.post, "PUT": requests.put, "PATCH": requests.patch, "DELETE": requests.delete}[method]
    kwargs = {"headers": api_headers}
    if body is not None:
        kwargs["json"] = body
    return fn(f"{api_base}{path}", **kwargs)

def api_get(path):
    r = api("GET", path)
    r.raise_for_status()
    return r.json()

# Warehouse — collect into a list first (iterators exhaust on re-use)
WAREHOUSE_ID = WAREHOUSE_NAME = None
all_warehouses = list(w.warehouses.list())
for wh in all_warehouses:
    if wh.state and wh.state.value == "RUNNING" and getattr(wh, "enable_serverless_compute", False):
        WAREHOUSE_ID, WAREHOUSE_NAME = wh.id, wh.name
        break
if not WAREHOUSE_ID:
    for wh in all_warehouses:
        if wh.state and wh.state.value == "RUNNING":
            WAREHOUSE_ID, WAREHOUSE_NAME = wh.id, wh.name
            break
if not WAREHOUSE_ID and all_warehouses:
    WAREHOUSE_ID, WAREHOUSE_NAME = all_warehouses[0].id, all_warehouses[0].name

print(f"Catalog: {CATALOG} | Database: {INSPIRE_DB} | Warehouse: {WAREHOUSE_NAME} ({WAREHOUSE_ID})")
print(f"Source:  {SOURCE_FOLDER}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1: Clean up old app + SPs

# COMMAND ----------

# Delete app
print("Cleaning up...")
try:
    api("DELETE", f"/api/2.0/apps/{APP_NAME}")
    print(f"  Deleted app '{APP_NAME}'")
    time.sleep(5)
except Exception:
    print(f"  No existing app")

# Delete ALL SPs matching inspire-ai
for search in [APP_NAME, SP_NAME, "inspire-ai", "inspire_ai"]:
    try:
        sps = api_get(f"/api/2.0/preview/scim/v2/ServicePrincipals?filter=displayName co \"{search}\"")
        for sp in sps.get("Resources", []):
            sp_id = sp.get("id")
            print(f"  Deleting SP: {sp.get('displayName')} (ID: {sp_id}, AppID: {sp.get('applicationId')})")
            api("DELETE", f"/api/2.0/preview/scim/v2/ServicePrincipals/{sp_id}")
    except Exception:
        pass

print("  Clean ✅")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2: Schema + Notebook

# COMMAND ----------

# Schema
if WAREHOUSE_ID:
    stmt = w.statement_execution.execute_statement(warehouse_id=WAREHOUSE_ID, statement=f"CREATE SCHEMA IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`", wait_timeout="30s")
    print(f"Schema: {'✅' if stmt.status and stmt.status.state == StatementState.SUCCEEDED else '⚠️ ' + str(stmt.status)}")

# Notebook — ALWAYS publish to /Shared/ so the SP can access it.
# The SP can't read from user folders — only /Shared/ is accessible.
NOTEBOOK_DEST = f"/Shared/{APP_NAME}/dbx_inspire_ai_agent"
NOTEBOOK_PATH = None

# Find notebook in source folder (Databricks strips .ipynb on upload)
notebook_source = None
for candidate in [f"{SOURCE_FOLDER}/dbx_inspire_ai_agent", f"{SOURCE_FOLDER}/dbx_inspire_ai_agent.ipynb"]:
    if os.path.exists(candidate):
        notebook_source = candidate
        break

if not notebook_source:
    print(f"⚠️ Notebook not found in: {os.listdir(SOURCE_FOLDER)[:20]}")
    raise FileNotFoundError("dbx_inspire_ai_agent not found in source folder")

print(f"Notebook source: {notebook_source}")

# Export from source location (workspace notebook → base64)
export_path = notebook_source.replace("/Workspace", "")  # workspace API needs path without /Workspace prefix
try:
    resp = api("GET", f"/api/2.0/workspace/export?path={requests.utils.quote(export_path)}&format=JUPYTER")
    if resp.status_code == 200:
        b64 = resp.json().get("content", "")
        print(f"  Exported: {len(b64)} bytes base64")
    else:
        # Fallback: read directly if it's a file on disk
        with open(notebook_source, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        print(f"  Read from disk: {len(b64)} bytes base64")
except Exception:
    with open(notebook_source, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    print(f"  Read from disk: {len(b64)} bytes base64")

# Publish to /Shared/ where SP has access
try: api("POST", "/api/2.0/workspace/mkdirs", {"path": f"/Shared/{APP_NAME}"})
except: pass
try: api("POST", "/api/2.0/workspace/delete", {"path": NOTEBOOK_DEST})
except: pass

resp = api("POST", "/api/2.0/workspace/import", {
    "path": NOTEBOOK_DEST, "format": "JUPYTER", "content": b64,
    "language": "PYTHON", "overwrite": True,
})
if resp.status_code in (200, 201):
    NOTEBOOK_PATH = NOTEBOOK_DEST
    print(f"Published to: ✅ {NOTEBOOK_PATH}")
else:
    print(f"Publish failed: ⚠️ {resp.status_code} {resp.text[:300]}")

# Verify
try:
    v = api("GET", f"/api/2.0/workspace/get-status?path={requests.utils.quote(NOTEBOOK_DEST)}")
    if v.status_code == 200:
        print(f"Verified: ✅ {v.json().get('object_type')} at {NOTEBOOK_DEST}")
except: pass

assert NOTEBOOK_PATH, "❌ Notebook publish failed."
print(f"NOTEBOOK_PATH = {NOTEBOOK_PATH}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Snapshot SPs, deploy, find new SP

# COMMAND ----------

import yaml

# ── Snapshot all SPs BEFORE deploy ──
sp_before = set()
try:
    data = api_get("/api/2.0/preview/scim/v2/ServicePrincipals?count=500")
    for sp in data.get("Resources", []):
        sp_before.add(sp.get("applicationId", ""))
except Exception:
    pass
print(f"SPs before deploy: {len(sp_before)}")

# ── Configure app.yaml ──
app_yaml_path = f"{SOURCE_FOLDER}/app.yaml"
with open(app_yaml_path, "r") as f:
    app_config = yaml.safe_load(f)

app_config["env"] = [e for e in (app_config.get("env") or []) if isinstance(e, dict) and e.get("name") not in ("NODE_ENV", "INSPIRE_DATABASE", "INSPIRE_AUTO_SETUP", "INSPIRE_WAREHOUSE_ID", "NOTEBOOK_PATH")]
for name, value in {"NODE_ENV": "production", "INSPIRE_DATABASE": INSPIRE_DB, "INSPIRE_AUTO_SETUP": "true", **({"INSPIRE_WAREHOUSE_ID": WAREHOUSE_ID} if WAREHOUSE_ID else {}), **({"NOTEBOOK_PATH": NOTEBOOK_PATH} if NOTEBOOK_PATH else {})}.items():
    app_config["env"].append({"name": name, "value": str(value)})
app_config["resources"] = [{"name": SP_NAME, "type": "service-principal"}]

with open(app_yaml_path, "w") as f:
    yaml.dump(app_config, f, default_flow_style=False, sort_keys=False)
print("app.yaml: ✅")

# ── Create + Deploy ──
app_url = ""
resp = api("POST", "/api/2.0/apps", {"name": APP_NAME, "description": "Inspire AI v4.7"})
if resp.status_code in (200, 201):
    app_url = resp.json().get("url", "")
    print(f"App created: {app_url}")
elif "already exists" in resp.text.lower():
    app_url = api_get(f"/api/2.0/apps/{APP_NAME}").get("url", "")
    print(f"App exists: {app_url}")
else:
    raise RuntimeError(f"Create failed: {resp.text[:300]}")

# Wait for compute
for _ in range(30):
    state = api_get(f"/api/2.0/apps/{APP_NAME}").get("compute_status", {}).get("state", "?")
    if state == "ACTIVE":
        print(f"Compute: ACTIVE ✅")
        break
    print(f"  Compute: {state}")
    time.sleep(10)

# Deploy
resp = api("POST", f"/api/2.0/apps/{APP_NAME}/deployments", {"source_code_path": SOURCE_FOLDER})
if resp.status_code not in (200, 201):
    raise RuntimeError(f"Deploy failed: {resp.text[:300]}")
deploy_id = resp.json().get("deployment_id", "")

for _ in range(30):
    data = api_get(f"/api/2.0/apps/{APP_NAME}")
    p, a = data.get("pending_deployment", {}), data.get("active_deployment", {})
    dep = p if p.get("deployment_id") == deploy_id else a if a.get("deployment_id") == deploy_id else p or a
    s = dep.get("status", {}).get("state", "?")
    print(f"  Deploy: {s}")
    if s == "SUCCEEDED":
        app_url = data.get("url", app_url)
        break
    elif s in ("FAILED", "CANCELLED"):
        raise RuntimeError(f"Deploy {s}: {dep.get('status', {}).get('message', '')}")
    time.sleep(10)

print(f"Deployed ✅")

# ── Find the NEW SP (created by deploy) ──
print("\nFinding new service principal...")
time.sleep(5)  # Give SCIM a moment to sync

NEW_SP_APP_ID = None
try:
    data = api_get("/api/2.0/preview/scim/v2/ServicePrincipals?count=500")
    for sp in data.get("Resources", []):
        app_id = sp.get("applicationId", "")
        if app_id and app_id not in sp_before:
            NEW_SP_APP_ID = app_id
            print(f"  NEW SP: {sp.get('displayName')} | applicationId={app_id} | id={sp.get('id')}")
except Exception as e:
    print(f"  ⚠️ Could not list SPs: {e}")

if not NEW_SP_APP_ID:
    print("  ⚠️ Could not find new SP by diff. Trying name search...")
    try:
        sps = api_get(f"/api/2.0/preview/scim/v2/ServicePrincipals?filter=displayName co \"{APP_NAME}\"")
        for sp in sps.get("Resources", []):
            app_id = sp.get("applicationId", "")
            if app_id:
                NEW_SP_APP_ID = app_id
                print(f"  Found: {sp.get('displayName')} | applicationId={app_id}")
                break
    except Exception:
        pass

if not NEW_SP_APP_ID:
    print("\n⚠️  COULD NOT FIND SP. You need to grant manually:")
    print(f"    Run: fetch('/api/health').then(r=>r.json()).then(d=>console.log(d.envVars.SP_CLIENT_ID_resolved))")
    print(f"    Then: GRANT USE_CATALOG ON CATALOG `{CATALOG}` TO `<applicationId>`")
else:
    print(f"\n✅ Runtime SP applicationId: {NEW_SP_APP_ID}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 4: Grant permissions

# COMMAND ----------

if NEW_SP_APP_ID and WAREHOUSE_ID:
    sp = NEW_SP_APP_ID
    print(f"Granting permissions to {sp}...")

    # Full permissions on the selected catalog + schema
    grants = [
        f"GRANT USE_CATALOG ON CATALOG `{CATALOG}` TO `{sp}`",
        f"GRANT BROWSE ON CATALOG `{CATALOG}` TO `{sp}`",
        f"GRANT USE_SCHEMA ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{sp}`",
        f"GRANT CREATE_TABLE ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{sp}`",
        f"GRANT SELECT ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{sp}`",
        f"GRANT MODIFY ON SCHEMA `{CATALOG}`.`{SCHEMA}` TO `{sp}`",
    ]
    # BROWSE on ALL catalogs so the SP can list them in the catalog browser
    all_catalogs = set(available_catalogs)
    try:
        for cat in w.catalogs.list():
            all_catalogs.add(cat.name)
    except Exception:
        pass
    for cat in all_catalogs:
        if cat not in ("samples", "system", "__databricks_internal", "information_schema"):
            grants.append(f"GRANT BROWSE ON CATALOG `{cat}` TO `{sp}`")
            if cat != CATALOG:
                grants.append(f"GRANT USE_CATALOG ON CATALOG `{cat}` TO `{sp}`")

    for sql in grants:
        try:
            stmt = w.statement_execution.execute_statement(warehouse_id=WAREHOUSE_ID, statement=sql, wait_timeout="15s")
            ok = stmt.status and stmt.status.state == StatementState.SUCCEEDED
            label = sql.split(" ON ")[0].replace("GRANT ", "") + " ON " + sql.split(" ON ")[1].split(" TO ")[0]
            print(f"  {label}: {'✅' if ok else '⚠️ ' + (stmt.status.error.message[:80] if stmt.status and stmt.status.error else str(stmt.status))}")
        except Exception as e:
            print(f"  ⚠️ {str(e)[:120]}")

    # Warehouse
    resp = api("PATCH", f"/api/2.0/permissions/sql/warehouses/{WAREHOUSE_ID}", {
        "access_control_list": [{"service_principal_name": sp, "permission_level": "CAN_USE"}]
    })
    print(f"  CAN_USE on warehouse: {'✅' if resp.status_code == 200 else '⚠️ ' + resp.text[:100]}")
elif not NEW_SP_APP_ID:
    print("⚠️ Skipped — SP not found. Grant manually after checking /api/health.")
elif not WAREHOUSE_ID:
    print("⚠️ Skipped — no warehouse.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Done!

# COMMAND ----------

app_data = api_get(f"/api/2.0/apps/{APP_NAME}")
app_url = app_data.get("url", "")

print("=" * 60)
print("  Inspire AI v4.7 — Ready!")
print("=" * 60)
print(f"  URL:         {app_url}")
print(f"  Database:    {INSPIRE_DB}")
print(f"  Warehouse:   {WAREHOUSE_NAME}")
print(f"  SP:          {NEW_SP_APP_ID or 'NOT FOUND'}")
print("=" * 60)

displayHTML(f"""
<div style="padding:24px;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:12px;text-align:center;margin:20px 0">
<h2 style="color:#e0e0e0;margin-bottom:8px">Inspire AI v4.7 is ready!</h2>
<p style="color:#aaa;font-size:13px;margin-bottom:20px">Clean install complete.</p>
<a href="{app_url}" target="_blank" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#ff6b35,#f7931e);color:white;text-decoration:none;border-radius:8px;font-size:18px;font-weight:600;box-shadow:0 4px 15px rgba(255,107,53,0.3)">Open Inspire AI</a>
<p style="color:#666;margin-top:14px;font-size:12px">{app_url}</p>
</div>""")
