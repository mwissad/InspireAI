# Inspire AI v4.6 — Data Strategy Copilot

> **Turn your Unity Catalog into an actionable analytics strategy — powered by Databricks Foundation Models.**

Inspire AI scans your tables, understands their structure and relationships, and generates a comprehensive data strategy with prioritized use cases, Genie code instructions, and business impact assessments — all in minutes.

---

## Deploy in 2 Minutes

### Option A: Git-Backed Databricks App (Recommended)

No CLI, no build steps — just a URL:

1. Go to **Databricks** > **Compute** > **Apps** > **Create App**
2. Select **Custom App**
3. Paste: `https://github.com/mwissad/InspireApp`
4. Branch: `main`
5. Name: `inspire-ai` > Click **Create**
6. Wait ~90 seconds > Open the app URL
7. The **Setup Wizard** walks you through authentication, warehouse, and database config

### Option B: Databricks CLI (1 command)

```bash
pip install databricks-cli
databricks auth login --host https://your-workspace-url

git clone https://github.com/mwissad/InspireApp.git
cd InspireApp
databricks bundle deploy -t dev
```

### Option C: Manual Sync (air-gapped / no Git access)

```bash
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp

databricks sync . "/Workspace/Users/<your-email>/inspire-ai" \
  --watch --include "app.yaml,start.sh,backend/**,frontend/dist/**,databricks_inspire_v46.dbc"

databricks apps create inspire-ai
databricks apps deploy inspire-ai \
  --source-code-path "/Workspace/Users/<your-email>/inspire-ai"
```

> See **[DEPLOYMENT.md](DEPLOYMENT.md)** for service principal setup, permissions, and troubleshooting.

---

## What It Does

```
Unity Catalog  ──>  Inspire AI  ──>  Prioritized Use Cases
(47 tables)        (8 pipeline       (23 use cases, PDF catalog,
                    phases)           Genie instructions, PPTX)
```

**Input**: Your Databricks Unity Catalog (catalogs, schemas, tables)

**Output**:
- Scored & prioritized analytics use cases per business domain
- Genie Code instructions (paste into Genie to generate full implementations)
- PDF catalog, PowerPoint presentation, Excel/CSV exports
- MLflow experiment tracking per use case
- Lakeview dashboard definitions

**Pipeline Phases**:
1. **Setup** — Widget validation, config persistence
2. **Business Understanding** — Strategic goals, domain extraction
3. **Schema Discovery** — UC metadata scanning, table filtering
4. **Use Case Generation** — 2-pass AI ensemble generation
5. **Scoring & Quality** — Clustering, dedup, priority scoring
6. **Genie Notebooks** — Code instruction generation per use case
7. **Documentation** — PDF, PPTX, Excel, Markdown catalogs
8. **Finalization** — Cleanup, reporting, MLflow logging

---

## What's New in v4.6

| Feature | Details |
|---------|---------|
| **Setup Wizard** | Guided 5-step first-run flow — connect, authenticate, pick warehouse, create database, verify & publish |
| **Light & Dark Theme** | Toggle between bright Databricks theme and dark mode (persisted) |
| **Quick Access** | PDF, CSV, Excel preview and open-in-tab directly from Results page |
| **Session Quick View** | Expand any session card to see top use cases without navigating away |
| **JobLauncher** | Notebooks wrapped in `def main()` with Databricks job tags |
| **Table Discovery** | Genie scans nearby schemas for additional relevant tables |
| **Condensed Prompts** | Shorter, more effective AI prompts (persona: 2-3 sentences vs 8-12) |
| **Triple-Quoted Prompts** | ai_query prompts as multi-line strings for user editability |
| **UI Effects** | Glassmorphism cards, animated counters, particle field, page transitions, skeleton loaders, confetti celebration |
| **DAB Support** | `databricks.yml` for `databricks bundle deploy` |

---

## Architecture

```
Browser
  |
  v
Databricks App (Node.js Express)
  |
  |── Static React Frontend (pre-built in frontend/dist/)
  |     |── Setup Wizard (first run)
  |     |── Landing Page (scroll-driven showcase)
  |     |── Choose Page (session browser with quick view)
  |     |── Launch Page (configure parameters & run)
  |     |── Monitor Page (real-time 2s polling)
  |     └── Results Page (use cases, artifacts, Quick Access)
  |
  └── API Layer (proxy to Databricks REST APIs)
        |── /api/setup/verify (permission checks)
        |── /api/notebook (auto-publish DBC)
        |── /api/run (submit pipeline job)
        |── /api/inspire/session (session polling)
        |── /api/inspire/steps (step-by-step progress)
        |── /api/inspire/results (final results)
        └── /api/workspace/* (file browsing & export)
          |
          v
Databricks Workspace
  |── Jobs API (run notebook)
  |── SQL Statement API (query tracking tables)
  |── Unity Catalog API (browse metadata)
  └── Workspace API (publish notebook, list/export artifacts)
          |
          v
Inspire Database (catalog.schema)
  |── __inspire_session (session metadata & progress)
  |── __inspire_step (step-by-step execution tracking)
  |── __inspire_usecases (generated use cases)
  └── _inspire_pipeline_state (pipeline state persistence)
```

---

## Permissions Required

| Permission | Resource | Purpose |
|-----------|----------|---------|
| `CAN_USE` | SQL Warehouse | Execute queries |
| `USE CATALOG` | Source catalog(s) | Scan table metadata |
| `USE SCHEMA` | Source schema(s) | Read table schemas |
| `SELECT` | Source tables | Read column metadata |
| `CREATE SCHEMA` | Target catalog | Create inspire database |
| Workspace Write | `/Shared/` | Publish notebook & artifacts |

**Grant with SQL:**
```sql
GRANT USE CATALOG ON CATALOG <catalog> TO `<user-or-sp>`;
GRANT USE SCHEMA ON CATALOG <catalog> TO `<user-or-sp>`;
GRANT SELECT ON CATALOG <catalog> TO `<user-or-sp>`;
GRANT CREATE SCHEMA ON CATALOG <catalog> TO `<user-or-sp>`;
```

---

## Project Structure

```
InspireApp/
├── app.yaml                        # Databricks App manifest
├── databricks.yml                  # Asset Bundle config (DAB)
├── start.sh                        # App startup script
├── databricks_inspire_v46.dbc      # Compiled notebook bundle
├── backend/
│   ├── server.js                   # Express API server
│   ├── dbc_bundle.js               # Embedded notebook (base64 fallback)
│   └── package.json
├── frontend/
│   ├── dist/                       # Pre-built React app (committed for git-backed deploy)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── SetupWizard.jsx     # Guided first-run setup
│   │   │   ├── LandingPage.jsx     # Immersive landing with scroll sections
│   │   │   ├── ChoosePage.jsx      # Session browser with quick view
│   │   │   ├── LaunchPage.jsx      # Parameter config & run
│   │   │   ├── MonitorPage.jsx     # Real-time pipeline monitoring
│   │   │   └── ResultsPage.jsx     # Results, artifacts, Quick Access
│   │   ├── components/             # Shared UI components
│   │   ├── ThemeContext.jsx         # Light/dark theme provider
│   │   └── index.css               # Tailwind + custom animations
│   └── package.json
├── notebooks/                      # Split notebook source files
│   ├── 00_inspire_commons.py       # Shared library (all classes)
│   ├── 01_init_validate.py         # Widget creation & validation
│   ├── 02-08_*.py                  # Pipeline phases
│   └── workflow_definition.json    # Lakeflow job definition
├── DEPLOYMENT.md                   # Detailed deployment guide
└── README.md                       # This file
```

---

## Local Development

```bash
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp
npm run install:all

# Create backend/.env
echo 'DATABRICKS_HOST=https://your-workspace-url' > backend/.env
echo 'DATABRICKS_TOKEN=dapi_your_token' >> backend/.env

# Start dev servers (hot reload)
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:8080
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Setup Wizard doesn't appear | Clear localStorage: `localStorage.removeItem('db_setup_complete')` and refresh |
| "Cannot reach workspace" | Check URL format: `https://adb-xxxx.xx.azuredatabricks.net` (no trailing slash) |
| "Token invalid (401)" | Regenerate PAT in Databricks > User Settings > Developer > Access Tokens |
| "Permission denied /tmp" | Fixed in v4.6 — unique temp dir per run. Re-publish notebook to workspace |
| "Session table not found" | Notebook still initializing. Wait 30s and refresh |
| App shows blank page | Hard refresh `Cmd+Shift+R`. Check browser console for errors |
| Notebooks not publishing | Ensure workspace write access to `/Shared/`. Check Settings > Notebook Path |
