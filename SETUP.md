# Inspire AI — Quick Setup Guide

Deploy Inspire AI to your Databricks workspace in under 5 minutes using **git-backed Apps**.

---

## Prerequisites

- A Databricks workspace (AWS, Azure, or GCP)
- A running SQL Warehouse (Serverless recommended)
- Workspace admin permissions (to create Apps)

---

## Option 1: Git-Backed Deployment (Recommended)

The fastest way to deploy — Databricks pulls the code directly from GitHub.

### Step 1 — Create the App

1. Open your Databricks workspace
2. Go to **Compute** → **Apps**
3. Click **Create App**
4. Select **"Create from Git repository"**
5. Enter:
   - **Repository URL:** `https://github.com/<your-org>/InspireApp`
   - **Branch:** `main`
   - **App name:** `inspire-ai`
6. Click **Create**

Databricks will clone the repo, run `start.sh`, and start the app automatically.

### Step 2 — Open the App

Once the app status shows **Running**:
1. Click the app URL (e.g., `https://inspire-ai-<workspace-id>.<region>.databricksapps.com`)
2. The landing page will load
3. Click **Get Started** → you'll be taken to the Launch page

### Step 3 — Configure (first time only)

Click the **Settings** gear icon and enter:
- **Databricks Host:** Your workspace URL (auto-filled if deployed as an App)
- **Access Token:** Your personal access token (PAT) — get one from **User Settings → Developer → Access Tokens**
- **SQL Warehouse:** Select from the dropdown (auto-detected)

That's it — click **Launch** to run your first Inspire session.

---

## Option 2: Manual Deployment (Databricks CLI)

If you prefer CLI deployment:

```bash
# 1. Clone the repo
git clone https://github.com/<your-org>/InspireApp.git
cd InspireApp

# 2. Create the app
databricks apps create inspire-ai

# 3. Sync files to workspace
databricks sync . "/Workspace/Users/$(databricks current-user me --output json | jq -r .userName)/inspire-ai" \
  --watch --include "app.yaml,start.sh,backend/**,frontend/dist/**,databricks_inspire_v45.dbc"

# 4. Deploy
databricks apps deploy inspire-ai \
  --source-code-path "/Workspace/Users/<your-email>/inspire-ai"
```

---

## Option 3: Service Principal (Automated Auth)

For a fully automated setup where users don't need to enter PATs:

### 1. Create a Service Principal

```bash
# Via Databricks CLI
databricks service-principals create --display-name "inspire-ai-sp"
```

### 2. Grant Permissions

The service principal needs:
- **CAN_USE** on the target SQL Warehouse
- **USE CATALOG** on the catalogs you want Inspire to scan
- **CREATE TABLE** on the Inspire database (for tracking tables)
- **WRITE** on the workspace path for notebook publish

### 3. Update app.yaml

Uncomment the `resources` section in `app.yaml`:

```yaml
resources:
  - name: "inspire-ai-sp"
    type: "service-principal"
    description: "Service principal for Inspire AI"
```

### 4. Redeploy

The app will now automatically authenticate using the service principal — no PAT needed.

---

## What Happens on First Run

When you click **Launch** for the first time, Inspire AI will:

1. **Publish the notebook** — Uploads the Inspire AI notebook to your workspace at `/Shared/inspire_ai/`
2. **Create tracking tables** — Creates `__inspire_session` and `__inspire_step` in your Inspire Database
3. **Scan your catalog** — Reads metadata from the catalogs/schemas you selected
4. **Generate use cases** — AI analyzes your data schema and produces scored analytics use cases
5. **Deliver artifacts** — Generates PDFs, presentations, Genie instructions, and more

Typical first run: **15-30 minutes** depending on catalog size.

---

## Configuration Reference

| Setting | Description | Required | Example |
|---------|-------------|----------|---------|
| Databricks Host | Your workspace URL | Yes (auto-filled in App) | `https://adb-123.azuredatabricks.net` |
| Access Token | PAT or auto via SP | Yes | `dapi...` |
| SQL Warehouse | Compute for queries | Yes | Auto-detected from dropdown |
| Inspire Database | Where tracking tables go | Yes | `my_catalog._inspire` |
| Generation Path | Where artifacts are saved | Optional | `./inspire_gen/` |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| App stuck on "Starting" | Check the app logs in Compute → Apps → Logs. Ensure Node.js is available in the runtime. |
| "Unauthorized" errors | Verify your PAT is valid and hasn't expired. Or configure a service principal. |
| "No warehouses found" | Ensure you have a running SQL Warehouse and the token has access to it. |
| Notebook publish fails | Check workspace permissions — you need write access to `/Shared/`. |
| "No tables found" | Verify the catalogs/schemas exist and your token has `USE CATALOG` / `USE SCHEMA` permissions. |
| Frontend not loading | Ensure `frontend/dist/` exists in the repo. If missing, build locally: `cd frontend && npm run build`. |

---

## Architecture

```
Browser → Databricks App (Node.js)
              ├── Serves React frontend (static)
              ├── Proxies Databricks REST APIs
              ├── Publishes Inspire notebook
              └── Polls pipeline status

Databricks Workspace
    ├── SQL Warehouse (executes queries)
    ├── Inspire Notebook (runs the AI pipeline)
    ├── Unity Catalog (source metadata)
    └── Tracking tables (__inspire_session, __inspire_step)
```

---

## Need Help?

- Open an issue on the GitHub repo
- Check the app logs: **Compute → Apps → inspire-ai → Logs**
