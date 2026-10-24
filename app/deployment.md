# Inspire AI — Deployment

Deploy the **inspire-ai** Databricks App using **`installer_workspace.py`** (repo root) and the **`app/`** bundle.

---

## Customer path (recommended — no npm)

1. Import into the workspace (same parent folder):
   - **`installer_workspace.py`** from the repo root
   - **`app/`** folder (entire directory with `app.yaml`, `backend/`, `frontend/`, …)
2. **Or** upload a pre-built zip to  
   `/Workspace/Users/<your-email>/InspireAI-workspace.zip`  
   (built with `npm run package:workspace` inside `app/`).
3. Open the installer notebook → pick **warehouse** + **catalog** → **Run All**.

The installer deploys the app and grants the service principal. Open **Compute → Apps → inspire-ai**.

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

## 1. Produce InspireAI-workspace.zip (vendor / CI only)

On a machine with **Node.js**:

```bash
cd app
npm run package:workspace
```

This builds the frontend (unless `SKIP_BUILD=1`) and writes **`app/dist/InspireAI-workspace.zip`** (or `ARTIFACT_ZIP` if you set it).

---

## 2. Upload the zip to your user workspace

Upload the file so it exists at **exactly**:

```text
/Workspace/Users/<your-workspace-email>/InspireAI-workspace.zip
```

Replace `<your-workspace-email>` with the same identity Databricks shows under **Workspace** (often your corporate email). You can use **Databricks UI: Workspace, your user folder, Upload**, or the Databricks CLI **workspace import** with that path.

**Also upload the installer notebook** from the **repo root**: **`installer_workspace.py`** (import as a Python notebook). Place it in the same workspace folder as the **`app/`** directory, or rely on the zip-only path above.

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
   - Publishes **`dbx_inspire_ai_agent`** and **`dbx_generate_demo_data`** under **`/Shared/inspire-ai/`** so jobs and the App service principal can run them.
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

## 6. Selecting Unity Catalog metadata (Launch page)

After the app is deployed, open **inspire-ai** and go to the **Launch** flow. Under **Unity Catalog Metadata**, choose what Inspire should analyze. How you select metadata has a large impact on **run time** and **use-case quality**.

### Recommended approach

| Do | Why |
|----|-----|
| Select **individual tables** (not whole catalogs) | Inspire reads table and column metadata only; a focused list runs faster and produces sharper use cases. |
| Keep the set **small** — ideally **fewer than 25 tables** | Discovery and scoring scale with breadth; large selections take much longer. |
| Stay in **one business domain** | Example: all **sales** tables together (orders, line items, customers), not sales + HR + finance in one run. |
| Prefer **transactional** tables | Tables that receive new rows often (e.g. `sales_transactions`, `orders`, `events`) support richer use cases. |
| Skip or minimize **static** tables | Reference data that rarely changes (e.g. `store_location`, `country_codes`) adds little discovery value. |
| Use **Generation Instructions** for joins | If Unity Catalog metadata does not show primary/foreign keys between tables, describe relationships there (e.g. *join orders to customers on customer_id*). |

### How to select in the UI

1. Expand **Browse catalogs** under **Unity Catalog Metadata**.
2. Pick one or more **catalogs**, then **schemas**, then **tables** (table selection is the primary, preferred level).
3. Selected items appear in the **Selected Metadata** basket. Remove chips you do not need.
4. Optionally set **Generation Instructions** for domain focus, joins, or exclusions.

Avoid leaving only a **catalog** or **schema** in the basket without naming tables unless you intentionally want Inspire to scan **everything** in that scope.

### In-app warnings

The Launch page shows an amber notice when your selection is likely to run long or produce weaker results:

| Your selection | Warning |
|----------------|---------|
| **More than 10 tables** | Many explicit tables — expect a longer run; narrow to transactional tables in one domain if possible. |
| **Whole schema** (schema in basket, no tables) | All tables in that schema are in scope. Open the table list and pick a focused subset instead. |
| **Whole catalog** (catalog only) | All schemas and tables in that catalog are in scope. Prefer drilling down to specific schemas and tables. |

These warnings are advisory; you can still launch. For the best outcomes, treat **under 25 transactional tables in one domain** as the target.

### “I don’t have data”

If you have no UC tables yet, use **I don’t have data — generate demo tables instead**. That runs a separate pipeline: an LLM generates demo Delta tables (with Unity Catalog table and column descriptions), then Inspire discovers use cases on those tables. See the in-app flow on that page for details.

**Permissions:** Run **`installer_workspace.py` once** before using this flow. The installer deploys the **inspire-ai** App and grants its **service principal** access to `{catalog}._inspire`, the SQL warehouse, and UC browse on other catalogs. The demo pipeline’s **first task** (`dbx_generate_demo_data`) then grants the same service principal on the new **`inspire_demo_*`** schema so the App and step 2 (Inspire discovery) work end-to-end without manual SQL grants.

---

## 7. Optional: deploy from your laptop (npm run deploy)

If you prefer the CLI to upload the zip and installer and optionally run the notebook as a **Job**:

1. Install **Databricks CLI** and create **.env** in the repo root with **DATABRICKS_HOST** and **DATABRICKS_TOKEN**, or set **DATABRICKS_CONFIG_PROFILE**.
2. Optionally set **INSPIRE_DEPLOY_CLUSTER_ID** to an **all-purpose** cluster id that is **RUNNING** when you deploy.
3. Run **npm run deploy** from the repo root.

The script packages the zip, imports it and **installer_workspace.py**, and submits a one-time Job when a cluster id is available. If no **RUNNING** cluster is found, it still uploads assets and prints the notebook path; open that notebook and **Run All** as in sections 3 through 5. For how end users should pick catalogs, schemas, and tables in the app, see **section 6**.

---

## 8. Permissions (short)

- **While you run the installer:** your user identity needs warehouse **CAN_USE**, rights to create or use **{catalog}._inspire**, and permissions to create or update the App and workspace paths the notebook touches.
- **After deployment:** the **App service principal** is what the running app uses. The installer grants:
  - On the **chosen Inspire catalog**: **USE_CATALOG**, **BROWSE**, **CREATE SCHEMA** (so demo schemas can be created), and on **`{catalog}._inspire`**: **USE_SCHEMA**, **CREATE_TABLE**, **SELECT**, **MODIFY** (session and `__inspire_*` tables live here), and **CREATE VOLUME**, **READ VOLUME**, **WRITE VOLUME** (each run streams its live log to the `vol_root` volume here).
  - The **“I don’t have data”** pipeline task 1 additionally grants **USE_SCHEMA**, **SELECT**, and **MODIFY** on each new **`{catalog}.inspire_demo_*`** schema after demo tables are created.
  - On **every other catalog** (except a few system names): **USE_CATALOG** and **BROWSE** so the UI can list catalogs/schemas/tables for discovery — no **USE_SCHEMA** or **SELECT** elsewhere, so the SP reads metadata only.
  - **CAN_USE** on the SQL warehouse you picked.

If identity resolution fails, follow the SQL hints printed by the notebook.

---

## 9. Troubleshooting

| Symptom | What to do |
|---------|------------|
| **Zip not found** | Confirm the zip path is **/Workspace/Users/<email>/InspireAI-workspace.zip** or rely on an existing **app.yaml** folder as described in section 4. |
| **No warehouses in widget** | Create or start a SQL warehouse in the workspace; you need at least one warehouse with an id. |
| **Schema or grant errors** | Run as a user (or admin) with UC privileges on the chosen catalog; check warehouse is **RUNNING** or serverless as required. |
| **App does not start** | **Compute, Apps, inspire-ai, Logs**; confirm **start.sh** and Node dependencies succeed. |
| **Frontend build fails with missing Vite plugins** | Usually fixed by rerunning `bash app/scripts/package-for-workspace.sh` (it auto-installs frontend deps). If needed, run `cd app/frontend && npm install` and retry. |
| **Job path exits code 2** | No running cluster for the automated Job; start a cluster, set **INSPIRE_DEPLOY_CLUSTER_ID**, or **Run All** manually on Serverless. |

---

## 10. Alternative: Git-backed App

You can also create an App from this **Git repository** in the Databricks UI (**Compute, Apps, Create from Git**). That path does not use the zip installer; it builds from the repo branch you configure. Use the **zip plus installer_workspace.py** flow above when you need the workspace copy, **app.yaml** patching, and SP grants that the installer performs.
