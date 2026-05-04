# Inspire AI — Deployment

This guide covers deploying the **Databricks App** named **inspire-ai** using the **workspace bundle zip** and the **installer_workspace.py** notebook.

---

## Before you start

Confirm the following so the run does not fail halfway.

| Requirement | Why it matters |
|---------------|----------------|
| **Databricks workspace** with **Unity Catalog** | The installer creates `{catalog}._inspire` and expects UC catalogs. |
| **SQL warehouse** you can use | You will pick one in the notebook; it runs `CREATE SCHEMA` and SQL grants. |
| **Catalog access** | You need rights on the catalog you pick (create schema or use an existing `_inspire` where allowed). |
| **Apps permission** | Creating/updating a Databricks App usually needs a user who is allowed to manage Apps in the workspace. |
| **Notebook compute** | **Run All** needs a cluster or **Serverless** where the notebook is allowed to run and reach Workspace APIs. |
| **Zip under the workspace import limit** | Workspace file import limits apply; the packaging script excludes heavy folders to keep the zip small. |

---

## 1. Produce InspireAI-workspace.zip

On a machine with **Node.js** and the repo cloned:

```bash
cd InspireAI
bash scripts/package-for-workspace.sh
```

This builds the frontend (unless `SKIP_BUILD=1`) and writes **dist/InspireAI-workspace.zip** (or `ARTIFACT_ZIP` if you set it).

---

## 2. Upload the zip to your user workspace

Upload the file so it exists at **exactly**:

```text
/Workspace/Users/<your-workspace-email>/InspireAI-workspace.zip
```

Replace `<your-workspace-email>` with the same identity Databricks shows under **Workspace** (often your corporate email). You can use **Databricks UI: Workspace, your user folder, Upload**, or the Databricks CLI **workspace import** with that path.

**Also upload the installer notebook** to the same area (any path you like), for example import **installer_workspace.py** from the repo as a **Python notebook** so you can open it and **Run All**.

When you use **npm run deploy** (section 6), the CLI imports the installer to **`/Workspace/Users/<your-email>/InspireAI_workspace_installer`** by default. Open that path if the script prints it after upload.

---

## 3. Open installer_workspace.py and set parameters

1. Open the imported **installer_workspace.py** notebook in the workspace.
2. Attach **Serverless** or an **all-purpose cluster** that can run Python and call Workspace APIs.
3. Open **View, Notebook parameters** (widgets).

You will see two dropdowns (order matters):

| Widget | What to choose |
|--------|----------------|
| **00_sql_warehouse** | The SQL warehouse used for SQL statements, grants, and the value written into the app as **INSPIRE_WAREHOUSE_ID**. |
| **01_inspire_catalog** | The Unity Catalog where Inspire will use schema **_inspire** for session and tracking tables. Defaults to **workspace** when that catalog exists. |

**Jobs / automation (no UI):** in the first code cell, set **WAREHOUSE_OVERRIDE** to the warehouse **UUID** and/or **CATALOG_OVERRIDE** to the catalog **name** so the matching widget is skipped.

---

## 4. Run All and wait

1. Click **Run All** on the installer notebook.
2. Wait until the last cells finish without an exception. Typical work the notebook performs includes:

   - Resolves **warehouse** and **catalog** from the widgets (or overrides).
   - Unpacks **InspireAI-workspace.zip** into **`/Workspace/Users/<you>/InspireAI`** when the zip is present (cleaning an old folder first), or uses an existing **`app.yaml`** tree (see fallbacks below).
   - Runs **`CREATE SCHEMA IF NOT EXISTS`** for **`{catalog}._inspire`** via the Statement API.
   - Publishes **`dbx_inspire_ai_agent`** under **`/Shared/inspire-ai/`** so the App service principal can run jobs against it.
   - Writes workspace **`app.yaml`** with **`INSPIRE_DATABASE`**, **`INSPIRE_WAREHOUSE_ID`**, **`NOTEBOOK_PATH`**, **`INSPIRE_AUTO_SETUP`**, and related env for the Node app.
   - Creates or updates the **inspire-ai** Databricks App and triggers a deployment from the source folder.
   - Applies **Unity Catalog and warehouse** grants for the app **service principal** where possible.

If **InspireAI-workspace.zip** is missing at the expected path, the installer still tries **existing folders** that contain **app.yaml**, for example **InspireAI**, **inspire-ai**, **InspireAI-main**, **/Workspace/Shared/InspireAI**, or any directory under your user folder matching **InspireAI-***.

---

## 5. Verify deployment succeeded

Use this checklist. If any step fails, fix the error shown in the notebook output or App logs before continuing.

| Step | How to verify |
|------|----------------|
| **Notebook completed** | No uncaught error in the final cells; output shows source folder, catalog, and warehouse. |
| **App exists** | In Databricks: **Compute, Apps, inspire-ai** (or the name your workspace uses if different). |
| **App URL opens** | Open the app URL from the UI or from the notebook final summary link. |
| **Health** | Visit **/api/health** on the app; it should report configuration in a good state (no missing critical env for App mode). |
| **Schema** | In Unity Catalog, confirm **{your_catalog}._inspire** exists (installer uses `CREATE SCHEMA IF NOT EXISTS`). |
| **Service principal** | If the notebook printed manual grant instructions, apply them; otherwise grants were applied via SQL and warehouse permissions. |

---

## 6. Optional: deploy from your laptop (npm run deploy)

If you prefer the CLI to upload the zip and installer and optionally run the notebook as a **Job**:

1. Install **Databricks CLI** and create **.env** in the repo root with **DATABRICKS_HOST** and **DATABRICKS_TOKEN**, or set **DATABRICKS_CONFIG_PROFILE**.
2. Optionally set **INSPIRE_DEPLOY_CLUSTER_ID** to an **all-purpose** cluster id that is **RUNNING** when you deploy.
3. Run **npm run deploy** from the repo root.

The script packages the zip, imports it and **installer_workspace.py**, and submits a one-time Job when a cluster id is available. If no **RUNNING** cluster is found, it still uploads assets and prints the notebook path; open that notebook and **Run All** as in sections 3 through 5.

---

## Permissions (short)

- **While you run the installer:** your user identity needs warehouse **CAN_USE**, rights to create or use **{catalog}._inspire**, and permissions to create or update the App and workspace paths the notebook touches.
- **After deployment:** the **App service principal** is what the running app uses. The installer grants:
  - On the **chosen Inspire catalog** only: **USE_CATALOG**, **BROWSE**, and on **`{catalog}._inspire`**: **USE_SCHEMA**, **CREATE_TABLE**, **SELECT**, **MODIFY** (session and `__inspire_*` tables live here).
  - On **every other catalog** (except a few system names): **BROWSE** only so the UI can list catalogs/schemas/tables for discovery — **no** **USE_CATALOG** elsewhere, so the SP cannot run queries against arbitrary catalogs through UC alone.
  - **CAN_USE** on the SQL warehouse you picked.

If identity resolution fails, follow the SQL hints printed by the notebook.

---

## Troubleshooting

| Symptom | What to do |
|---------|------------|
| **Zip not found** | Confirm the zip path is **/Workspace/Users/<email>/InspireAI-workspace.zip** or rely on an existing **app.yaml** folder as described in section 4. |
| **No warehouses in widget** | Create or start a SQL warehouse in the workspace; you need at least one warehouse with an id. |
| **Schema or grant errors** | Run as a user (or admin) with UC privileges on the chosen catalog; check warehouse is **RUNNING** or serverless as required. |
| **App does not start** | **Compute, Apps, inspire-ai, Logs**; confirm **start.sh** and Node dependencies succeed. |
| **Job path exits code 2** | No running cluster for the automated Job; start a cluster, set **INSPIRE_DEPLOY_CLUSTER_ID**, or **Run All** manually on Serverless. |

---

## Alternative: Git-backed App

You can also create an App from this **Git repository** in the Databricks UI (**Compute, Apps, Create from Git**). That path does not use the zip installer; it builds from the repo branch you configure. Use the **zip plus installer_workspace.py** flow above when you need the workspace copy, **app.yaml** patching, and SP grants that the installer performs.
