# Inspire AI v4.5 — Data Strategy Copilot

> **Turn your data catalog into an actionable analytics strategy — powered by AI and Databricks.**

Inspire AI scans your Unity Catalog tables, understands their structure and relationships, and generates a comprehensive data strategy with prioritized use cases, Genie code instructions, and business impact assessments — all in minutes, not months.

---

## Quick Deploy (Git-Backed Databricks App)

The fastest way to get started — no build steps, no CLI:

1. Go to your Databricks workspace → **Compute** → **Apps** → **Create App**
2. Select **"Create from Git repository"**
3. Paste: `https://github.com/mwissad/InspireApp`
4. Set app name to `inspire-ai`, click **Create**
5. Open the app URL, enter your PAT in Settings — done.

> For detailed setup, service principal config, and troubleshooting, see **[SETUP.md](SETUP.md)**.

---

## What's New in v4.5

| Change | Details |
|--------|---------|
| **Genie Code Instructions** | SQL generation replaced by Genie code instruction generation — deploy directly to Databricks Genie |
| **AI Agent Manager** | New model fallback chain system (thinker → worker, large → small → tiny) with concurrency management |
| **Simplified Use Case Gen** | Merged 3 separate passes (Base, AI, Statistical) into a single unified generation pass |
| **Dark Theme** | Full dark mode redesign across all pages — premium cinema dark aesthetic |
| **Next-Level Landing Page** | Live terminal preview, animated counters, 3D hover tilt cards, industry showcase carousel, scrolling marquee |
| **Inline Results on Monitor** | Full results page embedded in Monitor when pipeline completes — no page switch needed |
| **Live Use Case Preview** | See discovered use cases in real-time as the pipeline runs (2s polling) |
| **Git-Backed Deployment** | Customers deploy by pasting a GitHub URL — no CLI or build steps required |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend  (React 19 · Vite · Tailwind CSS v4)  │
│  Dark Theme — Databricks brand design system     │
├────────────────────┬────────────────────────────┤
│  Static assets     │  Backend (Express 5 · Node) │
│  served by backend │  • Databricks REST API proxy │
│  in production     │  • SQL Statement API bridge  │
│                    │  • Auto notebook publish      │
└────────────────────┴──────────┬─────────────────┘
                                │
                   ┌────────────▼────────────┐
                   │    Databricks Workspace   │
                   │  • Unity Catalog metadata │
                   │  • SQL Warehouse (compute)│
                   │  • Foundation Models (AI)  │
                   │  • Genie (code instruct.) │
                   │  • /Shared/inspire_ai     │
                   └───────────────────────────┘
```

---

## How to Use

### Step 1: Launch
1. Click **Get Started** on the landing page
2. Enter the **Business Name** (e.g. "Acme Corp")
3. Browse **Unity Catalog** — select catalogs, schemas, and tables to analyze
4. Choose **Generation Options** (Genie Code Instructions, PDF Catalog, Presentation)
5. Click **Launch Inspire AI**

### Step 2: Configure (Settings Panel)
Click the **Settings** gear icon to:
- Set the **Databricks Host URL** and **Access Token**
- Select a **SQL Warehouse** from the live dropdown (shows RUNNING/STOPPED status)
- Set the **Inspire Database** (e.g. `catalog._inspire`) for session tracking

### Step 3: Monitor
- Watch real-time pipeline progress with a 2-second polling interval
- See **live use case previews** as they're discovered
- Expand **Detailed Steps** for stage-by-stage execution with filtering and search

### Step 4: Results
- Results appear **inline in the Monitor page** when complete — no need to switch pages
- Browse use cases by **domain**, **priority**, **quality**, and **technique**
- Expand cards for problem statements, solutions, and business value
- **Export JSON** for downstream use

---

## Deployment Options

### Option 1: Git-Backed App (Recommended)

Paste the GitHub URL in Databricks → done. See [Quick Deploy](#quick-deploy-git-backed-databricks-app) above.

### Option 2: CLI Deployment

```bash
# Clone & deploy
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp

databricks apps create inspire-ai
databricks sync . "/Workspace/Users/<your-email>/inspire-ai" \
  --exclude node_modules --exclude .git --exclude "frontend/src"
databricks apps deploy inspire-ai \
  --source-code-path "/Workspace/Users/<your-email>/inspire-ai"
```

### Option 3: Run Locally

```bash
# Install & start
cd frontend && npm install && npm run build && cd ..
cd backend && npm install && cd ..

# Configure
export DATABRICKS_HOST=https://<your-workspace>.azuredatabricks.net
export DATABRICKS_TOKEN=dapi...

# Run
bash start.sh
# Open http://localhost:8080
```

> For service principal setup and full guide, see **[SETUP.md](SETUP.md)**.

---

## Features

| Feature | Description |
|---------|-------------|
| **AI-Powered Discovery** | Scans Unity Catalog metadata and generates analytics use cases via Foundation Models |
| **Genie Code Instructions** | Generates per-use-case Genie code instructions ready for deployment |
| **Domain Clustering** | Intelligently groups use cases into business domains with subdomain detection |
| **Priority Scoring** | Value + Quality scoring with Ultra High → Low priority ranking |
| **Live Terminal Preview** | Landing page shows a simulated Inspire run with typing animation |
| **Industry Showcase** | 6-industry horizontal carousel with example use cases (Retail, Finance, Healthcare, Manufacturing, Telecom, Education) |
| **Dark Theme** | Premium cinema dark UI with aurora ambient effects and glass navigation |
| **Inline Results** | Full results browser embedded in Monitor page on completion |
| **Live Use Case Preview** | See use cases appear in real-time during pipeline execution |
| **2s Polling** | Fast progress updates with animated progress bar |
| **Multi-Language** | Generate artifacts in 15+ languages |
| **PDF & Presentations** | Professional PDF catalogs and executive slide decks |
| **Multi-Workspace** | Connect to any workspace via PAT — no redeployment needed |
| **Git-Backed Deploy** | Customers paste a GitHub URL — Databricks handles the rest |

---

## Project Structure

```
InspireApp/
├── app.yaml                     # Databricks App manifest
├── start.sh                     # Self-contained startup script
├── SETUP.md                     # Customer deployment guide
├── databricks_inspire_v45.dbc   # Inspire AI notebook (v4.5)
├── backend/
│   ├── server.js                # Express API — Databricks proxy, SQL bridge
│   ├── dbc_bundle.js            # Embedded DBC notebook (base64)
│   └── package.json
├── frontend/
│   ├── dist/                    # Production build (committed for git-backed deploy)
│   ├── src/
│   │   ├── App.jsx              # Root component, routing, state management
│   │   ├── index.css            # Tailwind v4 dark theme tokens
│   │   ├── components/
│   │   │   ├── Header.jsx       # Glass nav with step indicators
│   │   │   ├── SettingsPanel.jsx # Config panel — warehouse selector, auth
│   │   │   └── DatabricksLogo.jsx
│   │   └── pages/
│   │       ├── LandingPage.jsx  # Animated hero, industry showcase, terminal preview
│   │       ├── LaunchPage.jsx   # Catalog browser + generation options
│   │       ├── MonitorPage.jsx  # Real-time tracker + inline results
│   │       └── ResultsPage.jsx  # Use case catalog with filtering
│   └── vite.config.js
├── notebooks/                   # Split notebook source files (8 phases)
│   ├── 00_inspire_commons.py    # Shared library (classes, prompts, utils)
│   ├── 01_init_validate.py      # Widget creation, input validation
│   ├── 02_business_context.py   # Business context extraction
│   ├── 03_schema_discovery.py   # UC metadata scanning
│   ├── 04_use_case_gen.py       # AI use case generation
│   ├── 05_scoring_quality.py    # Scoring, dedup, quality filtering
│   ├── 06_genie_notebooks.py    # Genie code instruction generation
│   ├── 07_documentation.py      # PDF, PPTX, Excel generation
│   └── 08_samples_finalize.py   # Cleanup and reporting
└── split_notebook.py            # Splits .dbc into phase notebooks
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4 |
| Icons | Lucide React |
| Backend | Express 5, Node.js 18+ |
| Deployment | Databricks App (git-backed) |
| Notebook | Databricks .dbc v4.5 (Python) |
| AI | Databricks Foundation Models |
| API | Databricks REST API, SQL Statement API |

---

## API Endpoints

All endpoints accept `X-DB-PAT-Token` header for authentication and `X-Databricks-Host` for the target workspace.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check + config status |
| `GET` | `/api/warehouses` | List SQL warehouses with status |
| `GET` | `/api/notebook` | Auto-publish notebook |
| `GET` | `/api/catalogs` | List Unity Catalog catalogs |
| `GET` | `/api/catalogs/:c/schemas` | List schemas |
| `GET` | `/api/tables/:c/:s` | List tables with metadata |
| `POST` | `/api/run` | Submit a notebook run |
| `GET` | `/api/run/:id` | Get run status |
| `GET` | `/api/inspire/session` | Poll session status |
| `GET` | `/api/inspire/sessions` | List all sessions |
| `GET` | `/api/inspire/steps` | Get step progress (delta polling) |
| `GET` | `/api/inspire/results` | Get final results JSON |
| `GET` | `/api/inspire/usecases` | Get polished use cases |

---

## License

Proprietary — provided under the terms of the customer engagement agreement.
