# Databricks notebook source

# MAGIC %md
# MAGIC # Inspire AI v8.8 — Workspace Installer
# MAGIC
# MAGIC **Run All** — pick **SQL warehouse** then **Inspire catalog** via the widgets (no `%pip`). Uses **Databricks SDK** (preinstalled on DBR / Serverless).
# MAGIC
# MAGIC **What it does:** clean install → unpacks **`/Workspace/Users/<you>/InspireAI-workspace.zip`** if present (produced by **`npm run deploy`** / `deploy:inspire`), else uses an existing workspace folder under **`InspireAI`**, **`inspire-ai`**, **`InspireAI-*`**, or **`/Workspace/Shared/InspireAI`** (must contain **`app.yaml`**) → publishes **`dbx_inspire_ai_agent.ipynb`** to **`/Shared/inspire-ai/`** → writes **`app.yaml`** → creates/deploys Databricks App **`inspire-ai`** → grants the app **service principal** full rights on **`{catalog}._inspire`**, **USE_CATALOG** + **BROWSE** on other catalogs (metadata only), and **CAN_USE** on the warehouse.
# MAGIC
# MAGIC **Where you use the product:** **Compute → Apps → inspire-ai** (or the link in the last cell) — not this notebook.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Setup

# COMMAND ----------

# MAGIC %md
# MAGIC ### SQL warehouse and Unity Catalog
# MAGIC The next cell shows **two** dropdown widgets immediately (also under **View → Notebook parameters**). The following cell loads workspace choices into those widgets and **stops with an error** until both are set.
# MAGIC
# MAGIC 1. **`00_sql_warehouse`** — SQL warehouse used for `CREATE SCHEMA`, SQL grants, and the deployed app’s **`INSPIRE_WAREHOUSE_ID`** default.
# MAGIC 2. **`01_inspire_catalog`** — catalog where Inspire creates the **`_inspire`** schema (session / tracking tables).
# MAGIC
# MAGIC **First run:** widgets appear with **— Please select —** → the setup cell fails → pick both values → **re-run the setup cell** (or Run All).
# MAGIC
# MAGIC **Jobs** (`npm run deploy`): set **`WAREHOUSE_OVERRIDE`** (warehouse id) and/or **`CATALOG_OVERRIDE`** in code to skip the matching widget. Values must exist in this workspace.

# COMMAND ----------

# Widgets visible by default (placeholder until setup cell fills choices).
_WIDGET_PLACEHOLDER = "— Please select —"
W_WH = "00_sql_warehouse"
W_CAT = "01_inspire_catalog"

_existing_wh = ""
_existing_cat = ""
try:
    _existing_wh = (dbutils.widgets.get(W_WH) or "").strip()
except Exception:
    pass
try:
    _existing_cat = (dbutils.widgets.get(W_CAT) or "").strip()
except Exception:
    pass

_already_configured = (
    _existing_wh
    and _existing_wh != _WIDGET_PLACEHOLDER
    and _existing_cat
    and _existing_cat != _WIDGET_PLACEHOLDER
)

if _already_configured:
    print("Parameters already set above. Change them if needed, then re-run the setup cell.")
else:
    for _w in (W_WH, W_CAT):
        try:
            dbutils.widgets.remove(_w)
        except Exception:
            pass

    dbutils.widgets.dropdown(
        W_WH,
        _WIDGET_PLACEHOLDER,
        [_WIDGET_PLACEHOLDER],
        "1) SQL warehouse for grants & app default",
    )
    dbutils.widgets.dropdown(
        W_CAT,
        _WIDGET_PLACEHOLDER,
        [_WIDGET_PLACEHOLDER],
        "2) Unity Catalog for Inspire tracking tables (_inspire)",
    )

    print("Notebook parameters are ready above (empty until you choose values).")
    print("Run the next cell to load choices. If it fails, select both dropdowns and re-run that cell.")

# COMMAND ----------

import os, time, json, glob, requests, base64, shutil, zipfile
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState

w = WorkspaceClient()
current_user = w.current_user.me()
USER_EMAIL = current_user.user_name
WORKSPACE_HOST = w.config.host


def _require_widget_selection(widget_name, picked, valid_values, label_human):
    """Fail fast when the customer left a parameter widget empty."""
    value = (picked or "").strip()
    if not value or value == _WIDGET_PLACEHOLDER:
        raise ValueError(
            f"Missing {label_human}: use the **{widget_name}** dropdown above, choose a value, "
            "then re-run this cell (or Run All from here)."
        )
    if value not in valid_values:
        raise ValueError(
            f"Invalid {label_human} ({value!r}). Pick a value from the **{widget_name}** dropdown "
            "and re-run this cell."
        )
    return value


# --- 1) SQL warehouses (widget: pick one) ---
WAREHOUSE_OVERRIDE = None  # Set to a warehouse UUID string for Jobs/CI to skip the dropdown

all_warehouses = [wh for wh in w.warehouses.list() if getattr(wh, "id", None)]


def _wh_sort_key(wh):
    st = wh.state.value if wh.state else ""
    srv = bool(getattr(wh, "enable_serverless_compute", False))
    return (0 if st == "RUNNING" and srv else 1 if st == "RUNNING" else 2, (wh.name or "").lower())


all_warehouses.sort(key=_wh_sort_key)

warehouse_labels = []
warehouse_ids_list = []
for wh in all_warehouses:
    st = wh.state.value if wh.state else "?"
    nm = wh.name or wh.id
    warehouse_labels.append(f"{nm} [{st}] {wh.id}")
    warehouse_ids_list.append(wh.id)

if not warehouse_ids_list:
    raise RuntimeError("No SQL warehouses found. Create a SQL warehouse in this workspace, then re-run.")

if WAREHOUSE_OVERRIDE:
    if WAREHOUSE_OVERRIDE not in warehouse_ids_list:
        raise ValueError(f"WAREHOUSE_OVERRIDE={WAREHOUSE_OVERRIDE!r} not in warehouse ids (showing first 5): {warehouse_ids_list[:5]}")
    WAREHOUSE_ID = WAREHOUSE_OVERRIDE
    WAREHOUSE_NAME = WAREHOUSE_ID
    for wh in all_warehouses:
        if wh.id == WAREHOUSE_ID:
            WAREHOUSE_NAME = wh.name or WAREHOUSE_ID
            break
else:
    _prev_wh = (dbutils.widgets.get(W_WH) or "").strip()
    try:
        dbutils.widgets.remove(W_WH)
    except Exception:
        pass
    _wh_choices = [_WIDGET_PLACEHOLDER] + warehouse_labels
    _def_wh_label = _prev_wh if _prev_wh in warehouse_labels else _WIDGET_PLACEHOLDER
    dbutils.widgets.dropdown(
        W_WH,
        _def_wh_label,
        _wh_choices,
        "1) SQL warehouse for grants & app default",
    )
    _picked_wh = _require_widget_selection(
        W_WH,
        dbutils.widgets.get(W_WH),
        warehouse_labels,
        "SQL warehouse",
    )
    _wh_idx = warehouse_labels.index(_picked_wh)
    WAREHOUSE_ID = warehouse_ids_list[_wh_idx]
    WAREHOUSE_NAME = all_warehouses[_wh_idx].name or WAREHOUSE_ID

# --- 2) Unity Catalog for Inspire (widget: pick catalog) ---
available_catalogs = []
try:
    for cat in w.catalogs.list():
        if cat.name not in ("system", "information_schema", "__databricks_internal"):
            available_catalogs.append(cat.name)
except Exception:
    available_catalogs = ["workspace"]
if not available_catalogs:
    available_catalogs = ["workspace"]
available_catalogs = sorted(set(available_catalogs))

CATALOG_OVERRIDE = None  # Set to a catalog name for Jobs/CI to skip the catalog dropdown

if CATALOG_OVERRIDE:
    if CATALOG_OVERRIDE not in available_catalogs:
        raise ValueError(f"CATALOG_OVERRIDE={CATALOG_OVERRIDE!r} not in catalogs: {available_catalogs}")
    CATALOG = CATALOG_OVERRIDE
else:
    _prev_cat = (dbutils.widgets.get(W_CAT) or "").strip()
    try:
        dbutils.widgets.remove(W_CAT)
    except Exception:
        pass
    _cat_choices = [_WIDGET_PLACEHOLDER] + available_catalogs
    _def_cat = _prev_cat if _prev_cat in available_catalogs else _WIDGET_PLACEHOLDER
    dbutils.widgets.dropdown(
        W_CAT,
        _def_cat,
        _cat_choices,
        "2) Unity Catalog for Inspire tracking tables (_inspire)",
    )
    CATALOG = _require_widget_selection(
        W_CAT,
        dbutils.widgets.get(W_CAT),
        available_catalogs,
        "Unity Catalog",
    )

SCHEMA = "_inspire"
INSPIRE_DB = f"{CATALOG}.{SCHEMA}"
APP_NAME = "inspire-ai"
SP_NAME = f"{APP_NAME}-sp"

print(f"Selected warehouse: {WAREHOUSE_NAME} ({WAREHOUSE_ID})")
print(f"Selected catalog:   {CATALOG}  →  {INSPIRE_DB}")

# Bundle zip (optional): same path produced by `npm run deploy` (scripts/package-for-workspace.sh).
AUTO_ZIP = f"/Workspace/Users/{USER_EMAIL}/InspireAI-workspace.zip"
SOURCE_ZIP = AUTO_ZIP if os.path.exists(AUTO_ZIP) else ""
if SOURCE_ZIP:
    print(f"Using bundle zip: {SOURCE_ZIP}")

# Source folder — zip auto-detected above, else existing workspace folder
SOURCE_FOLDER = None

if SOURCE_ZIP:
    if not os.path.exists(SOURCE_ZIP):
        raise FileNotFoundError(f"source_zip not found: {SOURCE_ZIP}")
    stage = "/tmp/inspire_ws_zip_stage"
    dest = f"/Workspace/Users/{USER_EMAIL}/InspireAI"
    print(f"Removing prior workspace bundle folder (clean run): {dest}")
    try:
        w.workspace.delete(dest, recursive=True)
    except Exception as _e:
        print(f"  (API delete skipped or failed) {_e}")
    if os.path.exists(dest):
        shutil.rmtree(dest, ignore_errors=True)
    print(f"Unpacking zip -> {dest} ...")
    if os.path.exists(stage):
        shutil.rmtree(stage)
    os.makedirs(stage, exist_ok=True)
    with zipfile.ZipFile(SOURCE_ZIP, "r") as zf:
        zf.extractall(stage)
    entries = os.listdir(stage)
    if len(entries) == 1 and os.path.isdir(os.path.join(stage, entries[0])):
        root_dir = os.path.join(stage, entries[0])
    else:
        root_dir = stage
    if not os.path.exists(os.path.join(root_dir, "app.yaml")):
        raise FileNotFoundError(f"No app.yaml after unzip under {root_dir}. Use a bundle from scripts/package-for-workspace.sh")
    shutil.copytree(root_dir, dest)
    SOURCE_FOLDER = dest
    print(f"  Source from zip: {SOURCE_FOLDER}")
else:
    _user_root = f"/Workspace/Users/{USER_EMAIL}"
    _fixed_candidates = [
        f"{_user_root}/inspire-ai",
        f"{_user_root}/InspireAI-main",
        f"{_user_root}/InspireAI",
        f"{_user_root}/InspireAI-dev_v_47",
        "/Workspace/Shared/InspireAI",
    ]
    _star = sorted(
        p
        for p in glob.glob(f"{_user_root}/InspireAI-*")
        if os.path.isdir(p)
    )
    _seen = set()
    _source_candidates = []
    for c in _fixed_candidates + _star:
        if c not in _seen:
            _seen.add(c)
            _source_candidates.append(c)
    for candidate in _source_candidates:
        if os.path.exists(candidate) and os.path.exists(f"{candidate}/app.yaml"):
            SOURCE_FOLDER = candidate
            break
    if not SOURCE_FOLDER:
        raise FileNotFoundError(
            f"InspireAI source not found. Run `npm run deploy` from your laptop to upload `InspireAI-workspace.zip` to {AUTO_ZIP}, "
            f"or sync the repo to {_user_root}/InspireAI (or inspire-ai, InspireAI-main, any {_user_root}/InspireAI-*/ with app.yaml, /Workspace/Shared/InspireAI)."
        )

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


def export_workspace_b64(source_path, export_formats=("JUPYTER",)):
    """
    Export workspace notebook/file as base64 (same pattern as main branch).
    Always calls workspace/export (strip /Workspace prefix); falls back to open() on local paths.
    """
    path = str(source_path or "").strip()
    if not path:
        return None

    export_paths = []
    stripped = path.replace("/Workspace", "", 1) if path.startswith("/Workspace") else path
    for p in (stripped, path):
        if p and p not in export_paths:
            export_paths.append(p)

    for export_path in export_paths:
        for fmt in export_formats:
            try:
                resp = api(
                    "GET",
                    f"/api/2.0/workspace/export?path={requests.utils.quote(export_path)}&format={fmt}",
                )
                if resp.status_code == 200:
                    content = (resp.json() or {}).get("content") or ""
                    if content:
                        print(f"  Exported {export_path} ({fmt}): {len(content)} bytes base64")
                        return content
            except Exception as e:
                print(f"  export note {export_path} ({fmt}): {e}")

    try:
        with open(path, "rb") as f:
            raw = f.read()
        b64 = base64.b64encode(raw).decode("utf-8")
        print(f"  Read from disk {path}: {len(b64)} bytes base64")
        return b64
    except OSError as e:
        print(f"  ⚠️ Cannot read {path}: {e}")
        return None


def _yaml_quote(value):
    if value is None:
        return '""'
    s = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{s}"'


_SKIP_UC_CATALOGS = {"samples", "system", "__databricks_internal", "information_schema"}


def build_app_sp_grant_sql(catalog, schema, sp_app_id, extra_catalog_names=None):
    """Unity Catalog GRANT statements for the inspire-ai App service principal."""
    sp = str(sp_app_id or "").strip()
    cat = str(catalog or "").strip()
    sch = str(schema or "_inspire").strip()
    if not sp or not cat:
        return []

    grants = [
        f"GRANT USE_CATALOG ON CATALOG `{cat}` TO `{sp}`",
        f"GRANT BROWSE ON CATALOG `{cat}` TO `{sp}`",
        f"GRANT CREATE SCHEMA ON CATALOG `{cat}` TO `{sp}`",
        f"GRANT USE_SCHEMA ON SCHEMA `{cat}`.`{sch}` TO `{sp}`",
        f"GRANT CREATE_TABLE ON SCHEMA `{cat}`.`{sch}` TO `{sp}`",
        f"GRANT SELECT ON SCHEMA `{cat}`.`{sch}` TO `{sp}`",
        f"GRANT MODIFY ON SCHEMA `{cat}`.`{sch}` TO `{sp}`",
    ]
    all_catalogs = set(extra_catalog_names or [])
    try:
        for c in w.catalogs.list():
            all_catalogs.add(c.name)
    except Exception:
        pass
    for other in sorted(all_catalogs):
        if other in _SKIP_UC_CATALOGS or other == cat:
            continue
        grants.append(f"GRANT USE_CATALOG ON CATALOG `{other}` TO `{sp}`")
        grants.append(f"GRANT BROWSE ON CATALOG `{other}` TO `{sp}`")
    return grants


def print_copy_paste_grant_sql(catalog, schema, sp_app_id, grant_sql_list, warehouse_id=None, warehouse_name=None):
    """Print SQL the admin can copy into the SQL Editor (same grants the installer runs)."""
    sp = str(sp_app_id or "").strip()
    cat = str(catalog or "").strip()
    sch = str(schema or "_inspire").strip()
    wh_id = str(warehouse_id or "").strip()
    wh_name = str(warehouse_name or "").strip()

    print("\n" + "=" * 72)
    print("COPY-PASTE SQL — App service principal permissions")
    print("=" * 72)
    print(f"-- Service principal applicationId: {sp}")
    print(f"-- Inspire tracking: `{cat}`.`{sch}`")
    if wh_name or wh_id:
        print(f"-- SQL warehouse: {wh_name or '(name unknown)'}  (id: {wh_id or 'n/a'})")
    print("-- Run in SQL Editor (pick the same warehouse as the installer widget):")
    print()
    if not grant_sql_list:
        print("-- (no grants built — set applicationId and catalog first)")
    else:
        for sql in grant_sql_list:
            print(f"{sql};")
    print()
    print("-- SQL warehouse CAN_USE (run in SQL Editor if USAGE ON WAREHOUSE is supported):")
    if wh_name:
        print(f"GRANT USAGE ON WAREHOUSE `{wh_name}` TO `{sp}`;")
    elif wh_id:
        print(f"-- Grant CAN_USE on warehouse id {wh_id} via SQL Warehouses → Permissions")
        print(f"--   service principal applicationId: {sp}")
    print()
    print("-- If the installer already ran grants above, re-running is usually idempotent.")
    print("=" * 72 + "\n")


def write_app_yaml_deploy(path, inspire_db, warehouse_id, notebook_path, sp_resource_name):
    """Emit app.yaml without PyYAML (no extra pip on the cluster)."""
    lines = [
        "command:",
        '  - "bash"',
        '  - "start.sh"',
        "",
        "env:",
        '  - name: "NODE_ENV"',
        '    value: "production"',
        '  - name: "INSPIRE_DATABASE"',
        f"    value: {_yaml_quote(inspire_db)}",
        '  - name: "INSPIRE_AUTO_SETUP"',
        '    value: "true"',
    ]
    if warehouse_id:
        lines += ["  - name: \"INSPIRE_WAREHOUSE_ID\"", f"    value: {_yaml_quote(warehouse_id)}"]
    if notebook_path:
        lines += ["  - name: \"NOTEBOOK_PATH\"", f"    value: {_yaml_quote(notebook_path)}"]
    lines += [
        "",
        "resources:",
        f"  - name: {_yaml_quote(sp_resource_name)}",
        '    type: "service-principal"',
    ]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

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

b64 = export_workspace_b64(notebook_source, export_formats=("JUPYTER",))
if not b64:
    raise FileNotFoundError(f"Could not export or read notebook: {notebook_source}")

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

# Demo-data pipeline notebook (I don't have data — step 1)
GENERATE_DEMO_DEST = f"/Shared/{APP_NAME}/dbx_generate_demo_data"
generate_source = None
for candidate in [
    f"{SOURCE_FOLDER}/dbx_generate_demo_data.py",
    f"{SOURCE_FOLDER}/dbx_generate_demo_data",
]:
    if os.path.exists(candidate):
        generate_source = candidate
        break

if generate_source:
    print(f"Demo generator source: {generate_source}")
    gen_b64 = export_workspace_b64(generate_source, export_formats=("SOURCE", "JUPYTER"))
    if gen_b64:
        try:
            api("POST", "/api/2.0/workspace/mkdirs", {"path": f"/Shared/{APP_NAME}"})
        except Exception:
            pass
        gen_resp = api(
            "POST",
            "/api/2.0/workspace/import",
            {
                "path": GENERATE_DEMO_DEST,
                "format": "SOURCE",
                "content": gen_b64,
                "language": "PYTHON",
                "overwrite": True,
            },
        )
        if gen_resp.status_code in (200, 201):
            print(f"Published demo generator: ✅ {GENERATE_DEMO_DEST}")
        else:
            print(f"Demo generator publish: ⚠️ {gen_resp.status_code} {gen_resp.text[:200]}")
    else:
        print(f"⚠️ Could not read demo generator from {generate_source}")
else:
    print("⚠️ dbx_generate_demo_data not found in source — skip demo pipeline notebook publish")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3: Snapshot SPs, deploy, find new SP

# COMMAND ----------

# ── Snapshot all SPs BEFORE deploy ──
sp_before = set()
try:
    data = api_get("/api/2.0/preview/scim/v2/ServicePrincipals?count=500")
    for sp in data.get("Resources", []):
        sp_before.add(sp.get("applicationId", ""))
except Exception:
    pass
print(f"SPs before deploy: {len(sp_before)}")

# ── Configure app.yaml (no PyYAML / pip) ──
app_yaml_path = f"{SOURCE_FOLDER}/app.yaml"
write_app_yaml_deploy(app_yaml_path, INSPIRE_DB, WAREHOUSE_ID, NOTEBOOK_PATH, SP_NAME)
print("app.yaml: ✅")

# ── Create + Deploy ──
app_url = ""
resp = api("POST", "/api/2.0/apps", {"name": APP_NAME, "description": "Inspire AI v8.8"})
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

_sp_for_grants = NEW_SP_APP_ID or "<applicationId>"
_grants_sql = build_app_sp_grant_sql(CATALOG, SCHEMA, _sp_for_grants, available_catalogs)
print_copy_paste_grant_sql(CATALOG, SCHEMA, _sp_for_grants, _grants_sql, WAREHOUSE_ID, WAREHOUSE_NAME)

if NEW_SP_APP_ID and WAREHOUSE_ID:
    sp = NEW_SP_APP_ID
    print(f"Granting permissions to {sp} (installer executing SQL)...")

    grants = build_app_sp_grant_sql(CATALOG, SCHEMA, sp, available_catalogs)

    for sql in grants:
        try:
            stmt = w.statement_execution.execute_statement(warehouse_id=WAREHOUSE_ID, statement=sql, wait_timeout="15s")
            ok = stmt.status and stmt.status.state == StatementState.SUCCEEDED
            label = sql.split(" ON ")[0].replace("GRANT ", "") + " ON " + sql.split(" ON ")[1].split(" TO ")[0]
            print(f"  {label}: {'✅' if ok else '⚠️ ' + (stmt.status.error.message[:80] if stmt.status and stmt.status.error else str(stmt.status))}")
        except Exception as e:
            print(f"  ⚠️ {str(e)[:120]}")

    # Warehouse (REST — also printed above as GRANT USAGE ON WAREHOUSE when name is known)
    resp = api("PATCH", f"/api/2.0/permissions/sql/warehouses/{WAREHOUSE_ID}", {
        "access_control_list": [{"service_principal_name": sp, "permission_level": "CAN_USE"}]
    })
    print(f"  CAN_USE on warehouse: {'✅' if resp.status_code == 200 else '⚠️ ' + resp.text[:100]}")
elif not NEW_SP_APP_ID:
    print("⚠️ Skipped automatic grants — SP not found.")
    print("   Replace <applicationId> in the COPY-PASTE SQL block above, then run in SQL Editor.")
    print("   Or open the App → browser console: fetch('/api/health').then(r=>r.json()).then(console.log)")
elif not WAREHOUSE_ID:
    print("⚠️ Skipped automatic grants — no warehouse selected.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Done!

# COMMAND ----------

app_data = api_get(f"/api/2.0/apps/{APP_NAME}")
app_url = app_data.get("url", "")

print("=" * 60)
print("  Inspire AI v8.8 — Ready!")
print("=" * 60)
print(f"  Databricks App: {APP_NAME}  (Compute → Apps → {APP_NAME})")
print(f"  Open this URL to use Inspire AI (Apps runtime, not this notebook):")
print(f"  URL:         {app_url}")
print(f"  Database:    {INSPIRE_DB}")
print(f"  Warehouse:   {WAREHOUSE_NAME}")
print(f"  SP:          {NEW_SP_APP_ID or 'NOT FOUND'}")
print("=" * 60)

displayHTML(f"""
<div style="padding:24px;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:12px;text-align:center;margin:20px 0">
<h2 style="color:#e0e0e0;margin-bottom:8px">Inspire AI v8.8 — Databricks App ready</h2>
<p style="color:#aaa;font-size:13px;margin-bottom:8px">Installer finished. Run the product from the <strong>Databricks App</strong> below (hosted Apps compute + <code>start.sh</code>).</p>
<p style="color:#888;font-size:12px;margin-bottom:20px">Do not rely on this notebook for day-to-day use — open the App.</p>
<a href="{app_url}" target="_blank" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#ff6b35,#f7931e);color:white;text-decoration:none;border-radius:8px;font-size:18px;font-weight:600;box-shadow:0 4px 15px rgba(255,107,53,0.3)">Open Inspire AI (Databricks App)</a>
<p style="color:#666;margin-top:14px;font-size:12px">{app_url}</p>
</div>""")
