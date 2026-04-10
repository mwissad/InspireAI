# Inspire AI v4.6 — Deployment Guide

Deploy Inspire AI to any Databricks workspace in minutes. Five options available — pick the one that fits your workflow.

---

## Prerequisites

- A Databricks workspace (AWS, Azure, or GCP)
- A running SQL Warehouse (Serverless recommended)
- Unity Catalog enabled with at least one catalog
- Workspace admin permissions (to create Apps)

---

## Option 1: Git-Backed App (Recommended)

The fastest method — Databricks pulls the code directly from GitHub. No CLI, no build steps.

### Steps

1. Open your Databricks workspace
2. Go to **Compute** > **Apps** > **Create App**
3. Select **"Create from Git repository"**
4. Enter:
   - **Repository URL:** `https://github.com/mwissad/InspireAI`
   - **Branch:** `main`
   - **App name:** `inspire-ai`
5. Click **Create**
6. Wait 1-2 minutes for the app to build and start
7. Click the app URL — the Settings panel guides you through configuration

That's it. Databricks clones the repo, runs `start.sh`, and starts the app automatically.

---

## Option 2: Installer Notebook (Zero CLI)

A single notebook that does everything — ideal for customers or teams who don't have the Databricks CLI installed.

### Steps

1. Download `installer.py` from the repo (or import directly from GitHub)
2. Import it into your Databricks workspace: **Workspace** > **Import** > upload `installer.py`
3. Open the notebook and attach it to any cluster (DBR 13.3+) or **Serverless** compute
4. Review the pre-filled widgets at the top:
   - **Install Source:** `github`
   - **GitHub Repository URL:** `https://github.com/mwissad/InspireAI.git`
   - **GitHub Branch:** `main`
   - **App Name:** `inspire-ai`
   - **Inspire Catalog:** `workspace`
   - **Inspire Schema:** `_inspire`
5. Click **Run All**

The notebook will:
- Clone the repo (or extract a zip you uploaded)
- Detect a SQL warehouse and inject it into the app config
- Upload all files to your workspace
- Create and deploy the Databricks App
- Create the `workspace._inspire` schema
- Display a clickable link to your running app

**After the notebook completes**, open the app URL and enter your PAT — the warehouse, database, and notebook are already pre-configured.

> **Zip option:** If GitHub is not accessible from your workspace, download the repo as a zip, upload it to your workspace files (e.g. `/Workspace/Users/<you>/InspireAI.zip`), change the **Install Source** widget to `zip`, and update the **Zip File Path** widget accordingly.

---

## Option 3: Databricks CLI Deployment

For teams that prefer CLI-based deployments or need more control.

### Prerequisites

- [Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html) v0.229+
- Node.js 18+

### Steps

```bash
# 1. Authenticate to your workspace
databricks auth login --host https://<workspace-url> --profile <profile-name>

# 2. Clone the repo
git clone https://github.com/mwissad/InspireAI.git
cd InspireAI

# 3. Build the frontend
cd frontend && npm install && npm run build && cd ..

# 4. Install backend dependencies
cd backend && npm install && cd ..

# 5. Create the Inspire database schema
databricks api post /api/2.0/sql/statements -p <profile-name> --json '{
  "warehouse_id": "<warehouse-id>",
  "statement": "CREATE SCHEMA IF NOT EXISTS workspace._inspire",
  "wait_timeout": "30s"
}'

# 6. Create the app
databricks apps create inspire-ai \
  --description "Inspire AI — Data Strategy Copilot powered by Databricks" \
  -p <profile-name>

# 7. Wait for compute to reach ACTIVE
databricks apps get inspire-ai -p <profile-name>

# 8. Sync files to the workspace
databricks sync . /Workspace/Users/<your-email>/inspire-ai \
  --exclude node_modules \
  --exclude .venv \
  --exclude __pycache__ \
  --exclude .git \
  --exclude "frontend/src" \
  --exclude "frontend/public" \
  --exclude "frontend/node_modules" \
  --exclude ".DS_Store" \
  --exclude docs \
  --exclude notebooks \
  --exclude ".claude" \
  -p <profile-name> --full

# 9. Deploy
databricks apps deploy inspire-ai \
  --source-code-path /Workspace/Users/<your-email>/inspire-ai \
  -p <profile-name>

# 10. Get the app URL
databricks apps get inspire-ai -p <profile-name>
```

> **Find your warehouse ID:** `databricks warehouses list -p <profile-name>`

---

## Option 4: Run Locally

For development, testing, or demos without deploying to Databricks.

```bash
# 1. Clone and install
git clone https://github.com/mwissad/InspireAI.git
cd InspireAI
npm run install:all

# 2. Configure environment
export DATABRICKS_HOST=https://<your-workspace-url>
export DATABRICKS_TOKEN=dapi...

# 3a. Run in dev mode (hot reload)
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:8080

# 3b. Or run in production mode
bash start.sh
# App: http://localhost:8080
```

> **Note:** If npm registry is unreachable, use the mirror: `npm install --registry=https://registry.npmmirror.com`

---

## Option 5: Service Principal (Automated Auth)

For production deployments where users shouldn't need their own PAT.

### 1. Create a Service Principal

```bash
databricks service-principals create --display-name "Inspire AI" --output json -p <profile-name>
```

Note the `application_id` from the output.

### 2. Grant Permissions

```sql
-- Grant to service principal
GRANT USE CATALOG ON CATALOG <catalog> TO `<sp-application-id>`;
GRANT USE SCHEMA ON CATALOG <catalog> TO `<sp-application-id>`;
GRANT SELECT ON CATALOG <catalog> TO `<sp-application-id>`;
GRANT CREATE SCHEMA ON CATALOG <catalog> TO `<sp-application-id>`;
GRANT CREATE TABLE ON CATALOG <catalog> TO `<sp-application-id>`;
```

Also grant `CAN_USE` on the SQL Warehouse in the warehouse permissions UI.

### 3. Update app.yaml

Uncomment the `resources` section in `app.yaml`:

```yaml
resources:
  - name: "inspire-ai-sp"
    type: "service-principal"
    description: "Service principal for Inspire AI"
    permissions:
      - "CAN_USE"
      - "CAN_MANAGE"
```

### 4. Redeploy

The app will now automatically authenticate using the service principal — no PAT needed.

---

## First-Time Setup

On first launch, configure via the **Settings** panel:

| Setting | Description | Auto-detected? |
|---------|-------------|----------------|
| Databricks Host | Workspace URL | Yes (auto from Databricks runtime) |
| Access Token | PAT or Service Principal | Yes (if SP configured) |
| SQL Warehouse | Compute for queries | Select from dropdown |
| Inspire Database | `catalog.schema` for session data | User selects (e.g. `workspace._inspire`) |

After configuration, the app:
1. **Publishes the notebook** to `/Shared/inspire_ai/`
2. **Creates tracking tables** (`__inspire_session`, `__inspire_step`) in the Inspire Database
3. Settings are persisted in the browser — no repeat setup needed

---

## Permissions Required

### Minimum Permissions (PAT-based, per user)

| Permission | Why | How to grant |
|-----------|-----|-------------|
| `CAN_USE` on SQL Warehouse | Execute queries | Warehouse permissions > Add user |
| `USE CATALOG` on source catalogs | Scan table metadata | `GRANT USE CATALOG ON CATALOG <name> TO <user>` |
| `USE SCHEMA` on source schemas | Read table schemas | `GRANT USE SCHEMA ON SCHEMA <catalog>.<schema> TO <user>` |
| `SELECT` on source tables | Read column metadata | `GRANT SELECT ON SCHEMA <catalog>.<schema> TO <user>` |
| `CREATE SCHEMA` in target catalog | Create inspire database | `GRANT CREATE SCHEMA ON CATALOG <catalog> TO <user>` |
| Workspace: Write `/Shared/` | Publish notebook + artifacts | Automatic for workspace users |

---

## Configuration Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABRICKS_HOST` | Auto | Workspace URL (injected by Databricks runtime) |
| `DATABRICKS_TOKEN` | Auto/Manual | SP token (auto) or set manually for local dev |
| `PORT` | Auto | Listening port (default: 8080) |
| `NODE_ENV` | Set in app.yaml | `production` for deployed apps |
| `NOTEBOOK_PATH` | Optional | Pre-configured notebook path (auto-published if empty) |

### User Settings (persisted in browser)

| Setting | Description |
|---------|-------------|
| Databricks Host | Workspace URL |
| Token | PAT or SP token |
| Warehouse ID | SQL warehouse for queries |
| Inspire Database | `catalog.schema` for session data |
| Notebook Path | Workspace path of published notebook |

---

## Updating

### Git-backed app
Push to the branch configured in the Databricks App. It auto-redeploys.

### CLI deployment
```bash
git pull
cd frontend && npm run build && cd ..
databricks sync . /Workspace/Users/<email>/inspire-ai \
  --exclude node_modules --exclude .git --exclude "frontend/src" \
  --exclude "frontend/node_modules" --exclude ".claude" \
  -p <profile-name> --full
databricks apps deploy inspire-ai \
  --source-code-path /Workspace/Users/<email>/inspire-ai \
  -p <profile-name>
```

---

## Monitoring & Logs

Access application logs by appending `/logz` to your app URL:

```
https://inspire-ai-<workspace-id>.<region>.databricksapps.com/logz
```

Or via the Databricks UI: **Compute** > **Apps** > **inspire-ai** > **Logs**

---

## Troubleshooting

### App won't start

| Symptom | Fix |
|---------|-----|
| "Port already in use" | Another app is using port 8080. Check with `lsof -i :8080` |
| "Node.js not found" | The Databricks App runtime includes Node.js 18+. For local dev: install Node.js |
| "DBC file not found" | Ensure `databricks_inspire_v46.dbc` is in the repo root |
| App stuck on "Starting" | Check app logs. Ensure the runtime has internet access for `npm install` |

### Authentication issues

| Symptom | Fix |
|---------|-----|
| "Cannot reach workspace" | Check URL format: `https://adb-xxxx.xx.azuredatabricks.net` (no trailing slash) |
| "Token invalid (401)" | Regenerate PAT. Ensure it hasn't expired |
| "Cannot access catalog" | User needs `USE CATALOG` grant. Ask workspace admin |
| "Warehouse not accessible" | User needs `CAN_USE` permission on the warehouse |

### Pipeline execution issues

| Symptom | Fix |
|---------|-----|
| "Session table not found" | The notebook is still initializing. Wait 30 seconds and refresh |
| "Results empty" | Check the Monitor page — pipeline may still be running |
| "Notebook failed" | Check the Databricks job run in **Workflows** for error details |

### Re-running setup

To re-trigger the Settings configuration:
1. Open browser DevTools (F12)
2. Console: `localStorage.removeItem('db_setup_complete')`
3. Refresh the page
