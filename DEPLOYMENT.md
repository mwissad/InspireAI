# Inspire AI v4.6 — Deployment Guide

Three deployment methods — pick the one that fits your environment.

---

## Method 1: Git-Backed Databricks App (Recommended)

**Time**: 2 minutes | **Requirements**: GitHub access from workspace | **Skill level**: Any

This is the simplest path. No CLI, no local setup, no build steps.

### Steps

1. Open your Databricks workspace
2. Navigate to **Compute** > **Apps**
3. Click **Create App** > **Custom App**
4. Fill in:
   - **Name**: `inspire-ai`
   - **Git repository URL**: `https://github.com/mwissad/InspireApp.git`
   - **Branch**: `main`
5. Click **Create**
6. Wait ~90 seconds for the app to build and start
7. Click the app URL (format: `https://inspire-ai-<workspace-id>.<region>.databricksapps.com`)
8. The **Setup Wizard** appears automatically and guides you through:
   - Entering your workspace URL (auto-detected if running as Databricks App)
   - Authentication (PAT or Service Principal)
   - SQL Warehouse selection (auto-picks first running serverless warehouse)
   - Inspire database creation (pick catalog, type schema name)
   - Permission verification and notebook publishing
9. Click **Launch Inspire AI** — you're ready

### What happens behind the scenes

- Databricks clones the repo into the app runtime
- `start.sh` runs: installs Node.js dependencies, verifies the frontend build, starts Express on the injected `PORT`
- The backend serves the React frontend and proxies API calls to your Databricks workspace
- On first visit, the Setup Wizard detects missing configuration and walks through setup
- The Inspire notebook (`.dbc` file) is auto-published to your workspace

### Updating

Push to the `main` branch on GitHub. The Databricks App auto-redeploys within minutes.

---

## Method 2: Databricks Asset Bundle (CLI)

**Time**: 5 minutes | **Requirements**: Databricks CLI installed | **Skill level**: DevOps / Admin

Use this for automated deployments, CI/CD pipelines, or when you need infrastructure-as-code.

### Prerequisites

```bash
# Install Databricks CLI
pip install databricks-cli

# Authenticate
databricks auth login --host https://your-workspace-url
```

### Deploy

```bash
# Clone
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp

# Deploy to development target
databricks bundle deploy -t dev

# Or deploy to production (requires service principal)
databricks bundle deploy -t prod
```

### What it creates

| Resource | Description |
|----------|-------------|
| Databricks App `inspire-ai` | The web application |
| Job `Inspire AI Pipeline` | Multi-task workflow definition |
| Notebook | Published to `/Shared/inspire-ai/` |

### Configuration

Edit `databricks.yml` to customize:

```yaml
variables:
  warehouse_id: "your-warehouse-id"
  inspire_database: "catalog.schema"
  notebook_path: "/Shared/inspire/databricks_inspire_v46"
```

### Targets

| Target | Use | Root path |
|--------|-----|-----------|
| `dev` | Testing & development | `/Shared/inspire-ai-dev` |
| `prod` | Customer deployment | `/Shared/inspire-ai` |

### Updating

```bash
git pull
databricks bundle deploy -t dev
```

---

## Method 3: Manual File Sync (Air-Gapped)

**Time**: 10 minutes | **Requirements**: Databricks CLI, workspace file access | **Skill level**: Admin

Use this when your workspace has no internet access or Git connectivity.

### Steps

```bash
# 1. Clone locally
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp

# 2. Authenticate to workspace
databricks auth login --host https://your-workspace-url

# 3. Sync files to workspace
databricks sync . "/Workspace/Users/$(databricks current-user me --output json | jq -r .userName)/inspire-ai" \
  --include "app.yaml,start.sh,backend/**,frontend/dist/**,databricks_inspire_v46.dbc,package.json"

# 4. Create the app
databricks apps create inspire-ai

# 5. Deploy
databricks apps deploy inspire-ai \
  --source-code-path "/Workspace/Users/<your-email>/inspire-ai"
```

### Updating

Re-run the `databricks sync` command after pulling new changes locally.

### Alternative: ZIP upload

If you can't use the CLI at all:
1. Download the repo as a ZIP from GitHub
2. Extract it
3. Upload files manually to a Workspace folder via the Databricks UI (Workspace > Import)
4. Create the app pointing to that folder

---

## First-Run Setup Wizard

On first visit, Inspire AI shows a guided wizard. Here's what each step does:

| Step | What happens | Auto-detected? |
|------|-------------|----------------|
| **1. Connect** | Enter or confirm workspace URL | Yes — auto-injected by Databricks App runtime |
| **2. Authenticate** | Enter PAT or configure Service Principal | Yes — if SP configured in `app.yaml` |
| **3. Warehouse** | Select a SQL warehouse | Yes — auto-picks first running serverless warehouse |
| **4. Database** | Pick catalog + type schema name | No — user selects. Schema is created automatically if it doesn't exist |
| **5. Verify** | Tests all permissions, publishes notebook | Click "Run Verification" then "Publish Notebook" |

After setup, click **Launch Inspire AI** to enter the app.

**To re-run the wizard later**: Open browser console (F12) > type `localStorage.removeItem('db_setup_complete')` > refresh.

**To skip the wizard**: Click "Skip setup" at the bottom — configure manually via the Settings gear icon.

---

## Permissions

### Minimum permissions per user (PAT-based)

```sql
-- Replace <user> with the user's email or service principal ID
-- Replace <catalog> with your source data catalog

-- Read source data
GRANT USE CATALOG ON CATALOG <catalog> TO `<user>`;
GRANT USE SCHEMA ON CATALOG <catalog> TO `<user>`;
GRANT SELECT ON CATALOG <catalog> TO `<user>`;

-- Create inspire tracking database
GRANT CREATE SCHEMA ON CATALOG <catalog> TO `<user>`;
```

Also grant **CAN_USE** on the SQL warehouse:
- Warehouse settings > Permissions > Add user > CAN_USE

### Service Principal setup (optional, for unattended auth)

1. **Create SP**: Databricks > Admin Settings > Service Principals > Add
2. **Generate secret**: SP detail page > Generate OAuth Secret
3. **Grant permissions**: Same SQL as above, using SP application ID
4. **Configure app.yaml**: Uncomment the `resources` section:

```yaml
resources:
  - name: "inspire-ai-sp"
    type: "service-principal"
    description: "Service principal for Inspire AI"
    permissions:
      - "CAN_USE"
```

5. **Grant warehouse access**: Add SP to warehouse permissions with CAN_USE

---

## Tracking Tables

Inspire AI creates these tables automatically in your configured database (`catalog.schema`):

| Table | Purpose |
|-------|---------|
| `__inspire_session` | Session metadata, progress (0-100%), results JSON |
| `__inspire_step` | Step-by-step execution tracking (polled every 2s) |
| `__inspire_usecases` | Generated use cases with metadata |
| `_inspire_pipeline_state` | Pipeline state persistence between phases |

No manual table creation needed — the notebook creates them on first run.

---

## Environment Variables

| Variable | Set by | Description |
|----------|--------|-------------|
| `DATABRICKS_HOST` | Databricks runtime (auto) | Workspace URL |
| `DATABRICKS_TOKEN` | Databricks runtime or `.env` | SP token or PAT |
| `PORT` | Databricks runtime (auto) | Port to listen on (default: 8080) |
| `NODE_ENV` | `app.yaml` | Set to `production` |
| `NOTEBOOK_PATH` | Optional | Pre-configured notebook workspace path |

For local development, create `backend/.env`:
```
DATABRICKS_HOST=https://your-workspace-url
DATABRICKS_TOKEN=dapi_your_token
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| App won't start | Check Databricks App logs. Ensure `start.sh` has execute permissions (`chmod +x start.sh`) |
| "Cannot reach workspace" | Verify URL format: `https://adb-xxxx.xx.azuredatabricks.net` — no trailing slash |
| "Token invalid (401)" | Regenerate PAT: Databricks > User Settings > Developer > Access Tokens |
| "Cannot access catalog" | User needs `USE CATALOG` grant — ask workspace admin |
| "Warehouse not accessible" | User needs `CAN_USE` on the warehouse — check warehouse permissions |
| "Permission denied /tmp" | Fixed in v4.6. Re-publish notebook via Setup Wizard or Settings |
| "Session table not found" | The notebook is still initializing. Wait 30 seconds and refresh |
| Blank page after deploy | Hard refresh `Cmd+Shift+R`. Ensure `frontend/dist/` is in the deployed files |
| Setup Wizard won't appear | Run `localStorage.removeItem('db_setup_complete')` in browser console, refresh |
| Notebook publish fails | Check workspace write access to `/Shared/`. Try Settings > force re-publish |
| "DBC file not found" | Ensure `databricks_inspire_v46.dbc` exists in repo root. `backend/dbc_bundle.js` is the base64 fallback |

---

## Local Development

```bash
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp

# Install all dependencies
npm run install:all

# Create env file
cat > backend/.env << 'EOF'
DATABRICKS_HOST=https://your-workspace-url
DATABRICKS_TOKEN=dapi_your_token
EOF

# Start both servers with hot reload
npm run dev

# Frontend: http://localhost:5173 (Vite, hot reload)
# Backend:  http://localhost:8080 (Express, auto-restart)
```

### Build for production

```bash
cd frontend && npm run build
# Output: frontend/dist/ (committed to repo for git-backed deploy)
```
