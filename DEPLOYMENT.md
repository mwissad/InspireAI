# Inspire AI — Deployment Guide

Deploy Inspire AI to any Databricks workspace in minutes. Three methods available — pick the one that fits your workflow.

---

## Quick Start (Recommended)

### Option A: Git-Backed App (2 minutes, zero CLI)

1. Go to **Databricks Workspace** > **Compute** > **Apps**
2. Click **Create App** > **Custom App**
3. Enter:
   - **Name**: `inspire-ai`
   - **Git URL**: `https://github.com/mwissad/InspireApp.git`
   - **Branch**: `v46_ui_glow` (or `main`)
4. Click **Create**
5. Wait 1-2 minutes for the app to build and start
6. Click the app URL — the **Setup Wizard** guides you through the rest

That's it. The wizard handles authentication, warehouse selection, database creation, and notebook publishing.

---

### Option B: Databricks CLI + Asset Bundle (1 command)

**Prerequisites:**
- [Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html) installed and authenticated
- `databricks auth login --host https://your-workspace-url`

**Deploy:**

```bash
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp

# Deploy to your workspace
databricks bundle deploy -t prod

# Or for development/testing:
databricks bundle deploy -t dev
```

This creates:
- The Databricks App (accessible at `https://inspire-ai-<workspace>.databricksapps.com`)
- The Inspire notebook in `/Shared/inspire-ai/`
- The pipeline job definition

**Run the app:**

```bash
databricks bundle run inspire_ai -t prod
```

---

### Option C: Manual File Sync (for air-gapped environments)

```bash
# 1. Clone the repo locally
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp

# 2. Sync to workspace
databricks sync . "/Workspace/Users/$(databricks current-user me --output json | jq -r .userName)/inspire-ai" \
  --watch --include "app.yaml,start.sh,backend/**,frontend/dist/**,databricks_inspire_v46.dbc"

# 3. Create the app
databricks apps create inspire-ai

# 4. Deploy
databricks apps deploy inspire-ai \
  --source-code-path "/Workspace/Users/<your-email>/inspire-ai"
```

---

## Setup Wizard

On first launch, Inspire AI shows a guided setup wizard:

| Step | What it does | Auto-detected? |
|------|-------------|----------------|
| 1. Connect | Configures workspace URL | Yes (auto from Databricks runtime) |
| 2. Authenticate | PAT or Service Principal | Yes (if SP configured in app.yaml) |
| 3. Warehouse | Selects SQL warehouse | Yes (picks first running serverless) |
| 4. Database | Creates `catalog.schema` for Inspire data | User selects catalog, types schema name |
| 5. Verify | Tests all permissions and publishes notebook | Automated checks with clear pass/fail |

After setup completes, all settings are persisted in the browser. Users on the same workspace can share the app URL — each authenticates with their own PAT.

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

### Service Principal Permissions (for unattended deployment)

```sql
-- Grant to service principal
GRANT USE CATALOG ON CATALOG main TO `<sp-application-id>`;
GRANT USE SCHEMA ON CATALOG main TO `<sp-application-id>`;
GRANT SELECT ON CATALOG main TO `<sp-application-id>`;
GRANT CREATE SCHEMA ON CATALOG main TO `<sp-application-id>`;
GRANT CREATE TABLE ON CATALOG main TO `<sp-application-id>`;
```

Also grant `CAN_USE` on the SQL Warehouse in the warehouse permissions UI.

---

## Service Principal Setup (Optional)

For production deployments where users shouldn't need their own PAT:

### 1. Create Service Principal

```bash
# Via Databricks CLI
databricks service-principals create --display-name "Inspire AI" --output json
```

Note the `application_id` from the output.

### 2. Create OAuth Secret

```bash
databricks service-principals secrets create --service-principal-id <sp-id> --output json
```

Note the `secret` value.

### 3. Configure app.yaml

Uncomment the service principal section in `app.yaml`:

```yaml
env:
  - name: NODE_ENV
    value: production
resources:
  - name: inspire-sp
    description: "Service principal for Inspire AI"
    service_principal:
      permission: CAN_USE
```

### 4. Grant Permissions

See the SQL grants in the Permissions section above.

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
| Auth Mode | `pat` or `sp` |
| Warehouse ID | SQL warehouse for queries |
| Inspire Database | `catalog.schema` for session data |
| Notebook Path | Workspace path of published notebook |

---

## Architecture

```
Browser ──> Databricks App (Node.js)
                │
                ├── Express API (proxy to Databricks REST APIs)
                │     ├── /api/setup/verify (permission checks)
                │     ├── /api/notebook (auto-publish DBC)
                │     ├── /api/run (submit pipeline job)
                │     ├── /api/inspire/* (session tracking)
                │     └── /api/workspace/* (artifact access)
                │
                └── Static React Frontend
                      ├── Setup Wizard (first run)
                      ├── Landing Page
                      ├── Choose Page (session browser)
                      ├── Launch Page (configure & run)
                      ├── Monitor Page (live progress)
                      └── Results Page (use cases, artifacts)
```

### What happens when a user clicks "Launch":

1. Frontend sends parameters to `/api/run`
2. Backend creates a Databricks Job with the Inspire notebook
3. Backend starts the job → returns `run_id`
4. Frontend polls `/api/inspire/session` every 2 seconds
5. Backend queries `__inspire_session` and `__inspire_step` tables via SQL
6. Frontend shows real-time progress + live use case preview
7. On completion → Results page with full use case catalog

### Files deployed:

| File | Purpose | Size |
|------|---------|------|
| `app.yaml` | Databricks App manifest | 100B |
| `start.sh` | Startup script (Node.js bootstrap) | 2KB |
| `backend/server.js` | Express API server | 45KB |
| `backend/dbc_bundle.js` | Embedded notebook (base64 fallback) | 425KB |
| `frontend/dist/` | Pre-built React app | ~10MB |
| `databricks_inspire_v46.dbc` | Inspire notebook bundle | 320KB |

---

## Troubleshooting

### App won't start

| Symptom | Fix |
|---------|-----|
| "Port already in use" | Another app is using port 8080. Check with `lsof -i :8080` |
| "Node.js not found" | The Databricks App runtime includes Node.js 18+. For local dev: `brew install node` |
| "DBC file not found" | Ensure `databricks_inspire_v46.dbc` is in the repo root |

### Setup wizard issues

| Symptom | Fix |
|---------|-----|
| "Cannot reach workspace" | Check the URL format: `https://adb-xxxx.xx.azuredatabricks.net` (no trailing slash) |
| "Token invalid (401)" | Regenerate PAT. Ensure it hasn't expired |
| "Cannot access catalog" | User needs `USE CATALOG` grant. Ask workspace admin |
| "Warehouse not accessible" | User needs `CAN_USE` permission on the warehouse |

### Pipeline execution issues

| Symptom | Fix |
|---------|-----|
| "Session table not found" | The notebook is still initializing. Wait 30 seconds and refresh |
| "Results empty" | Check the Monitor page — pipeline may still be running |
| "Notebook failed" | Check the Databricks job run in Workflows for error details |

### Re-running setup

To re-trigger the Setup Wizard:
1. Open browser DevTools (F12)
2. Console: `localStorage.removeItem('db_setup_complete')`
3. Refresh the page

---

## Local Development

```bash
# Clone and install
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp
npm run install:all

# Create backend/.env
cat > backend/.env << 'EOF'
DATABRICKS_HOST=https://your-workspace-url
DATABRICKS_TOKEN=dapi_your_token_here
EOF

# Start dev servers (hot reload)
npm run dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:8080
```

---

## Updating

### Git-backed app
Push to the branch configured in the Databricks App. It auto-redeploys.

### Asset Bundle
```bash
git pull
databricks bundle deploy -t prod
```

### Manual
```bash
databricks sync . "/Workspace/Users/<email>/inspire-ai" \
  --include "app.yaml,start.sh,backend/**,frontend/dist/**,databricks_inspire_v46.dbc"
```
