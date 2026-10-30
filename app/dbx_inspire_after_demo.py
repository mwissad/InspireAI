# Databricks notebook source
# MAGIC %md
# MAGIC # Inspire AI — Step 2: Run discovery on generated demo data
# MAGIC
# MAGIC Reads **`taskValues`** from **`generate_demo_data`**, then runs the Inspire agent notebook.

# COMMAND ----------

dbutils.widgets.text("inspire_database", "", "Inspire tracking DB (catalog._inspire)")
dbutils.widgets.text("session_id", "", "Session ID")
dbutils.widgets.text("inspire_notebook_path", "/Shared/inspire-ai/dbx_inspire_ai_agent", "Inspire agent workspace path")

inspire_database = (dbutils.widgets.get("inspire_database") or "").strip()
session_id = (dbutils.widgets.get("session_id") or "").strip()
inspire_notebook_path = (
    (dbutils.widgets.get("inspire_notebook_path") or "").strip()
    or "/Shared/inspire-ai/dbx_inspire_ai_agent"
)

def _task(key, default=""):
    try:
        v = dbutils.jobs.taskValues.get(taskKey="generate_demo_data", key=key, default=default)
        if v is None:
            return default
        return v.strip() if isinstance(v, str) else v
    except Exception:
        return default

uc_metadata = _task("uc_metadata")
display_name = _task("display_name") or _task("business_name", "Demo Business")
user_description = _task("user_description", "")

if not uc_metadata:
    raise ValueError(
        "Missing uc_metadata from generate_demo_data. "
        "Run the full demo pipeline (task 1 must succeed first)."
    )
if not inspire_database:
    inspire_database = _task("inspire_database")
if not session_id:
    session_id = _task("session_id")

if not inspire_database or not session_id:
    raise ValueError("inspire_database and session_id are required")

print(f"Business: {display_name}")
print(f"UC metadata: {uc_metadata}")
print(f"Tracking: {inspire_database}")
print(f"Session: {session_id}")
print(f"Inspire notebook: {inspire_notebook_path}")

# COMMAND ----------

inspire_args = {
    "15_operation": "Discover Use Cases",
    "00_business_name": display_name,
    "01_uc_metadata": uc_metadata,
    "02_inspire_database": inspire_database,
    "04_table_election": "All Tables",
    "05_use_cases_quality": "Good",
    "06_business_domains": "",
    "07_business_priorities": "Increase Revenue",
    "08_generation_instructions": f"Demo data pipeline. {user_description[:500]}",
    "09_generation_options": "PDF Catalog",
    "11_generation_path": "./../demos/",
    "12_documents_languages": "English",
    "13_generate_genie_code_for": "0",
    "14_session_id": session_id,
}

print("Launching Inspire agent:")
for k, v in inspire_args.items():
    print(f"  {k} = {str(v)[:120]}")

try:
    run_result = dbutils.notebook.run(inspire_notebook_path, 0, inspire_args)
    print(f"Inspire notebook finished: {run_result}")
except Exception as e:
    msg = str(e)
    if "NotebookExecutionException" in msg or "FAILED" in msg:
        raise RuntimeError(
            f"Inspire agent failed at {inspire_notebook_path}. "
            "Open the child notebook run in the job UI for the full stack trace. "
            f"Original: {msg}"
        ) from e
    if "NOT_FOUND" in msg.upper() or "does not exist" in msg.lower():
        raise RuntimeError(
            f"Inspire notebook not found at '{inspire_notebook_path}'. "
            "Re-run Workspace setup or publish dbx_inspire_ai_agent to "
            "/Shared/inspire-ai/dbx_inspire_ai_agent."
        ) from e
    raise
